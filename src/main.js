import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { CardObject } from './render/cardObject.js';
import { Background } from './render/background.js';
import { Particles } from './render/particles.js';
import { playingCardTexture, jokerTexture, planetTexture, backTexture, setMaxAnisotropy, FONT } from './render/textures.js';
import { sfx } from './audio.js';
import { SUIT_SYMBOL, SUIT_COLOR, rankLabel, cardChips, sortCards } from './game/cards.js';
import { HAND_ORDER, HAND_TYPES, handBase } from './game/hands.js';
import { JOKER_BY_ID } from './game/jokers.js';
import { EDITION_BY_ID } from './game/editions.js';
import { scoreHand, previewHand, isDebuffed } from './game/scoring.js';
import {
  newRun, startBlind, drawToHand, removeFromHand, cashOut, advanceBlind, openShop, buyItem,
  sellJoker, sellPrice, reroll, currentBlindInfo, BLIND_KINDS, MAX_ANTE, MAX_JOKERS,
} from './game/state.js';

const HAND_Y = -3.0;
const PLAY_Y = 0.45;
const JOKER_Y = 3.35;
const SHOP_Y = 0.35;
const DECK_POS = new THREE.Vector3(7.6, -3.1, 0);

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const fmtMult = (n) => (Number.isInteger(n) ? fmt(n) : n.toFixed(1));
const tmp = new THREE.Vector3();

const BG_THEMES = {
  small: ['#2f6fed', '#14325c', '#0b132b'],
  big: ['#f0a020', '#7a3b0c', '#1d1007'],
  shop: ['#8338ec', '#3a0ca3', '#10002b'],
  over: ['#e0245e', '#3d0a1a', '#0a0005'],
};

class Game {
  constructor() {
    this.canvas = $('scene');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    setMaxAnisotropy(this.renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.lookAt = new THREE.Vector3(0, -0.2, 0);
    this.camDist = 16;

    this.bg = new Background();
    this.scene.add(this.bg.mesh);
    this.particles = new Particles();
    this.scene.add(this.particles.points);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 5, 8);
    this.scene.add(sun);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.45, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.cardObjs = new Map(); // playing-card id -> CardObject
    this.playRow = [];
    this.jokerObjs = new Map(); // joker uid -> CardObject
    this.shopObjs = [];
    this.flying = new Set();
    this.anchors = new Set();
    this.deckPile = [];
    this.handHidden = true;

    this.pointer = new THREE.Vector2(-10, -10);
    this.pointerNdc = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.hovered = null;
    this.busy = false;
    this.sortMode = 'rank';
    this.shake = 0;
    this.time = 0;
    this.lastFrame = performance.now();

    this.makeDeckPile();
    this.bindUi();
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  // ───────────────────────────── setup ─────────────────────────────

  makeDeckPile() {
    for (let i = 0; i < 6; i++) {
      const o = new CardObject({ texture: backTexture(), data: null, kind: 'deck', faceDown: true });
      o.interactive = false;
      o.setTarget(tmp.copy(DECK_POS).add(new THREE.Vector3(i * 0.03, i * 0.03, i * 0.04)));
      o.target.rotZ = 0.04;
      o.snap();
      o.addTo(this.scene);
      this.deckPile.push(o);
    }
    this.deckLabel = this.anchor(this.deckPile[0], new THREE.Vector3(0, -1.45, 0), 'deck-count', '52/52');
  }

  bindUi() {
    const onPointer = (e) => {
      this.pointer.set(e.clientX, e.clientY);
    };
    this.canvas.addEventListener('pointermove', onPointer);
    this.canvas.addEventListener('pointerleave', () => this.pointer.set(-1e5, -1e5));
    this.canvas.addEventListener('pointerdown', (e) => {
      sfx.unlock();
      onPointer(e);
      this.updateHover();
      if (this.hovered) this.onObjectClick(this.hovered);
      else this.clearSellButtons();
    });

    $('btn-play').onclick = () => this.playHand();
    $('btn-discard').onclick = () => this.discard();
    $('btn-sort-rank').onclick = () => this.sortHand('rank');
    $('btn-sort-suit').onclick = () => this.sortHand('suit');
    $('btn-info').onclick = () => this.showRunInfo();
    $('btn-mute').onclick = () => {
      $('btn-mute').textContent = sfx.toggleMute() ? '🔇' : '🔊';
    };
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.playHand();
      else if (e.key === 'd' || e.key === 'D') this.discard();
      else if (e.key === 'Escape') this.closeRunInfo();
    });
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
    this.bg.setSize(w, h);

    const wide = w > 820;
    const side = $('sidebar');
    const sideW = wide ? side.offsetWidth + 20 : 0;
    const topH = wide ? 0 : side.offsetHeight;
    const cw = w - sideW;
    const ch = h - topH;

    // fit an 18 x 10.4 world-unit content box inside the free area
    const needH = Math.max(10.4, 18 / (cw / ch));
    const half = THREE.MathUtils.degToRad(this.camera.fov / 2);
    this.camDist = ((needH * h) / ch) / 2 / Math.tan(half);
    this.camera.aspect = w / h;
    this.camera.setViewOffset(w, h, -sideW / 2, -topH / 2, w, h);
    this.camera.updateProjectionMatrix();

    const pr = this.renderer.getPixelRatio();
    this.particles.points.material.uniforms.scale.value = (h * pr) / (2 * Math.tan(half));
  }

  // ───────────────────────────── run flow ─────────────────────────────

  async start() {
    await Promise.race([document.fonts.load(`700 40px ${FONT}`), wait(2500)]).catch(() => {});
    await document.fonts.load(`40px ${FONT}`).catch(() => {});
    $('loading').remove();
    this.loop();
    this.newRun();
  }

  newRun() {
    for (const o of [...this.cardObjs.values(), ...this.jokerObjs.values(), ...this.shopObjs]) this.flyAway(o);
    this.cardObjs.clear();
    this.jokerObjs.clear();
    this.shopObjs = [];
    this.playRow = [];
    this.state = newRun();
    this.setHandDisplay(null);
    this.updateHud();
    this.showBlindSelect();
  }

  setTheme(name, color) {
    if (color) {
      const c = new THREE.Color(color);
      this.bg.setColors(c, c.clone().multiplyScalar(0.35), c.clone().multiplyScalar(0.08));
    } else this.bg.setColors(...BG_THEMES[name]);
  }

  showBlindSelect() {
    this.state.phase = 'blind-select';
    this.handHidden = true;
    $('controls').classList.add('hidden');
    this.setTheme('small');
    const s = this.state;
    const cols = BLIND_KINDS.map((kind, i) => {
      const info = currentBlindInfo({ ...s, blindIndex: i });
      const status = i < s.blindIndex ? 'defeated' : i === s.blindIndex ? 'current' : 'upcoming';
      const chip = info.boss ? '☠' : i === 0 ? '◐' : '●';
      return `
        <div class="blind-card ${status}" style="--c:${info.color}">
          <div class="blind-chip">${chip}</div>
          <h3>${info.name}</h3>
          <p class="desc">${info.boss ? info.boss.desc : '&nbsp;'}</p>
          <div class="need">Score at least<b>${fmt(info.target)}</b></div>
          <div class="reward">${'$'.repeat(kind.reward)}</div>
          ${status === 'current' ? '<button class="btn orange" data-act="select">Select</button>'
            : `<div class="status">${status === 'defeated' ? 'Defeated' : 'Upcoming'}</div>`}
        </div>`;
    }).join('');
    this.showOverlay(`
      <div class="panel-title">Ante ${s.ante} <small>/ ${MAX_ANTE}</small></div>
      <div class="blind-select">${cols}</div>
    `, { select: () => { this.hideOverlay(); this.startRound(); } }, 'bottom');
  }

  async startRound() {
    sfx.click();
    startBlind(this.state);
    const b = this.state.blind;
    this.setTheme(b.kind, b.boss ? b.color : null);
    this.bg.spinTarget = b.boss ? 1.2 : b.kind === 'big' ? 0.7 : 0.4;
    this.handHidden = false;
    this.setHandDisplay(null);
    this.updateHud();
    $('controls').classList.remove('hidden');
    if (b.boss) this.banner(b.name, b.boss.desc, b.color);
    await this.deal();
  }

  async deal() {
    this.busy = true;
    this.updateHud();
    const drawn = drawToHand(this.state);
    this.state.hand = sortCards(this.state.hand, this.sortMode);
    for (const card of drawn) {
      const o = new CardObject({ texture: playingCardTexture(card), data: card, kind: 'card', faceDown: true });
      o.setTarget(tmp.copy(DECK_POS).setZ(0.4));
      o.snap();
      o.speed = 0; // hold on the deck until dealt
      o.faceMat.uniforms.dim.value = isDebuffed(this.state, card) ? 0.8 : 0;
      o.addTo(this.scene);
      this.cardObjs.set(card.id, o);
    }
    for (let i = 0; i < drawn.length; i++) {
      const o = this.cardObjs.get(drawn[i].id);
      o.speed = 9;
      o.target.flip = 0;
      sfx.deal(i);
      this.updateHud();
      await wait(80);
    }
    await wait(250);
    this.busy = false;
    this.updateHud();
    if (!this.state.hand.length) this.gameOver();
  }

  selectedCards() {
    return this.state.hand.filter((c) => this.cardObjs.get(c.id)?.selected);
  }

  sortHand(mode) {
    sfx.click();
    this.sortMode = mode;
    this.state.hand = sortCards(this.state.hand, mode);
  }

  onObjectClick(o) {
    const s = this.state;
    if (o.kind === 'card') {
      if (s.phase !== 'play' || this.busy || !s.hand.includes(o.data)) return;
      if (!o.selected && this.selectedCards().length >= 5) {
        o.bump(0.15);
        sfx.debuff();
        return;
      }
      o.selected = !o.selected;
      o.selected ? sfx.select() : sfx.deselect();
      this.updatePreview();
      this.updateHud();
    } else if (o.kind === 'joker') {
      o.bump(0.2);
      sfx.select();
      if (s.phase === 'shop') this.toggleSellButton(o);
    } else if (o.kind === 'shop') {
      this.buy(o);
    }
  }

  updatePreview() {
    const sel = this.selectedCards();
    const p = previewHand(this.state, sel);
    this.setHandDisplay(p ? { name: p.name, level: p.level, chips: p.chips, mult: p.mult } : null);
  }

  setHandDisplay(d) {
    $('hand-name').innerHTML = d ? `${d.name} <small>lvl.${d.level}</small>` : '&nbsp;';
    $('chips').textContent = d ? fmt(d.chips) : '0';
    $('mult').textContent = d ? fmtMult(d.mult) : '0';
  }

  async playHand() {
    const s = this.state;
    const sel = this.selectedCards();
    if (this.busy || s.phase !== 'play' || !sel.length || s.hands <= 0) return;
    this.busy = true;
    this.hideTooltip();

    removeFromHand(s, sel);
    s.hands -= 1;
    const result = scoreHand(s, sel, s.hand);
    s.handPlays[result.type] += 1;
    this.playRow = sel.map((c) => this.cardObjs.get(c.id));
    for (const o of this.playRow) o.selected = false;
    this.updateHud();
    sfx.whoosh();
    await wait(450);

    const handEl = $('hand-name');
    this.setHandDisplay({ name: result.name, level: result.level, ...result.steps[0].total });
    this.pop(handEl);
    this.pop($('chips'));
    this.pop($('mult'));
    sfx.chips(0);

    const scoringIds = new Set(result.scoring.map((c) => c.id));
    for (const o of this.playRow) o.scoring = scoringIds.has(o.data.id);
    await wait(380);

    let n = 0;
    for (const step of result.steps.slice(1)) {
      n++;
      const delay = Math.max(170, 420 - n * 18);
      if (step.kind === 'card') {
        const o = this.cardObjs.get(step.ref.id);
        o.bump(0.3);
        o.faceMat.uniforms.flash.value = 1;
        this.floatText(o, `+${step.chips}`, 'chips');
        this.particles.burst(o.group.position.clone().setZ(0.6), '#4ea8ff', 18, { speed: 3, size: 0.18 });
        sfx.chips(n);
      } else if (step.kind === 'debuff') {
        const o = this.cardObjs.get(step.ref.id);
        o.bump(-0.15);
        this.floatText(o, 'Debuffed', 'debuff');
        sfx.debuff();
      } else if (step.kind === 'joker') {
        const o = this.jokerObjs.get(step.ref.uid);
        if (step.on) this.cardObjs.get(step.on.id)?.bump(0.2);
        if (o) {
          o.bump(0.4);
          o.faceMat.uniforms.flash.value = 0.8;
        }
        const target = o ?? this.cardObjs.get(step.on?.id);
        if (step.xmult) {
          this.floatText(target, `X${step.xmult} Mult`, 'xmult');
          this.particles.burst(target.group.position.clone().setZ(0.6), '#ff3b5c', 50, { speed: 5, size: 0.3 });
          this.shake = Math.max(this.shake, 0.18);
          sfx.xmult();
        } else if (step.mult) {
          this.floatText(target, `+${step.mult} Mult`, 'mult');
          this.particles.burst(target.group.position.clone().setZ(0.6), '#ff4d6d', 22, { speed: 3, size: 0.2 });
          sfx.mult(n);
        } else if (step.chips) {
          this.floatText(target, `+${step.chips}`, 'chips');
          this.particles.burst(target.group.position.clone().setZ(0.6), '#4ea8ff', 22, { speed: 3, size: 0.2 });
          sfx.chips(n);
        }
      }
      $('chips').textContent = fmt(step.total.chips);
      $('mult').textContent = fmtMult(step.total.mult);
      this.pop(step.mult || step.xmult ? $('mult') : $('chips'));
      await wait(delay);
    }

    await wait(250);
    // the big payoff
    const total = result.total;
    const before = s.score;
    s.score += total;
    const remaining = s.blind.target - before;
    const ratio = total / Math.max(1, remaining);
    const heat = Math.min(1, Math.log10(1 + total) / 4.5);
    handEl.innerHTML = `<span class="total">${fmt(total)}</span>`;
    this.pop(handEl);
    sfx.score();
    this.shake = Math.max(this.shake, 0.1 + heat * 0.35);
    this.bg.uniforms.pulse.value = 0.4 + heat;
    this.bg.uniforms.spin.value += 0.5 + heat;
    this.particles.burst(new THREE.Vector3(0, PLAY_Y, 1), '#ffd166', 60 + Math.floor(heat * 140), { speed: 6 + heat * 6, size: 0.3, life: 1.2 });
    if (ratio >= 1) {
      $('round-score').classList.add('fire');
      this.particles.burst(new THREE.Vector3(0, PLAY_Y, 1), '#ff4d6d', 120, { speed: 10, size: 0.35, life: 1.4 });
    }
    await this.countUp($('round-score'), before, s.score, 650);
    await wait(350);

    // clear the table
    for (const o of this.playRow) {
      this.cardObjs.delete(o.data.id);
      this.flyAway(o);
    }
    this.playRow = [];
    this.setHandDisplay(null);
    $('round-score').classList.remove('fire');
    this.updateHud();
    await wait(300);

    if (s.score >= s.blind.target) await this.roundWon();
    else if (s.hands <= 0) this.gameOver();
    else await this.deal();
  }

  async discard() {
    const s = this.state;
    const sel = this.selectedCards();
    if (this.busy || s.phase !== 'play' || !sel.length || s.discards <= 0) return;
    this.busy = true;
    this.hideTooltip();
    s.discards -= 1;
    removeFromHand(s, sel);
    sfx.whoosh();
    for (const c of sel) {
      const o = this.cardObjs.get(c.id);
      this.cardObjs.delete(c.id);
      this.flyAway(o);
      await wait(50);
    }
    this.setHandDisplay(null);
    this.updateHud();
    await wait(200);
    await this.deal();
  }

  async roundWon() {
    const s = this.state;
    s.phase = 'cashout';
    this.busy = true;
    sfx.win();
    this.banner('Blind Defeated!', `${fmt(s.score)} / ${fmt(s.blind.target)}`, '#ffd166');
    for (let i = 0; i < 4; i++) {
      this.particles.burst(new THREE.Vector3((Math.random() - 0.5) * 10, Math.random() * 3, 1), ['#ffd166', '#4ea8ff', '#ff4d6d', '#06d6a0'][i], 70, { speed: 8, size: 0.3, life: 1.5 });
    }
    await wait(900);
    // return the hand to the deck
    for (const c of s.hand) {
      const o = this.cardObjs.get(c.id);
      if (!o) continue;
      o.target.flip = Math.PI;
      o.setTarget(tmp.copy(DECK_POS).setZ(0.3), 0, 1);
      o.dieAt = this.time + 0.8;
      this.flying.add(o);
      this.cardObjs.delete(c.id);
    }
    s.hand = [];
    this.handHidden = true;
    $('controls').classList.add('hidden');
    await wait(500);

    const { lines, total } = cashOut(s);
    const rows = lines.map((l) => `<div class="cash-line"><span>${l.label}</span><b>${'$'.repeat(Math.min(l.amount, 10))}${l.amount > 10 ? '+' : ''} <small>$${l.amount}</small></b></div>`).join('');
    this.showOverlay(`
      <div class="panel-title gold">Cash Out</div>
      <div class="cash">${rows}</div>
      <button class="btn orange big" data-act="cash">Cash Out: $${total}</button>
    `, {
      cash: () => {
        sfx.money();
        this.hideOverlay();
        this.updateHud();
        this.pop($('money'));
        const next = advanceBlind(s);
        this.busy = false;
        if (next === 'victory') this.victory();
        else this.showShop();
      },
    });
  }

  // ───────────────────────────── shop ─────────────────────────────

  showShop() {
    openShop(this.state);
    this.setTheme('shop');
    this.bg.spinTarget = 0.3;
    this.updateHud();
    this.renderShopItems();
    this.showOverlay(`
      <div class="shop-bar">
        <button class="btn red big" data-act="next">Next Round</button>
        <div class="shop-title">SHOP<small>Click a card to buy · click your jokers to sell</small></div>
        <button class="btn green big" data-act="reroll" id="btn-reroll">Reroll $${this.state.shop.rerollCost}</button>
      </div>
    `, {
      next: () => {
        sfx.click();
        for (const o of this.shopObjs) this.flyAway(o);
        this.shopObjs = [];
        this.clearSellButtons();
        this.hideOverlay();
        this.showBlindSelect();
      },
      reroll: () => {
        if (!reroll(this.state)) {
          sfx.debuff();
          this.pop($('money'));
          return;
        }
        sfx.money();
        $('btn-reroll').textContent = `Reroll $${this.state.shop.rerollCost}`;
        this.renderShopItems();
        this.updateHud();
      },
    }, 'bottom passthrough');
  }

  renderShopItems() {
    for (const o of this.shopObjs) this.flyAway(o);
    this.shopObjs = [];
    this.state.shop.items.forEach((item, i) => {
      const tex = item.type === 'joker' ? jokerTexture(item.def) : planetTexture(item.def);
      const o = new CardObject({ texture: tex, data: item, kind: 'shop', edition: item.edition, faceDown: true });
      o.setTarget(new THREE.Vector3(0, 8, 0));
      o.snap();
      o.addTo(this.scene);
      setTimeout(() => {
        o.target.flip = 0;
        sfx.deal(i);
      }, 150 + i * 120);
      o.priceTag = this.anchor(o, new THREE.Vector3(0, -1.5, 0), 'price', `$${item.cost}`);
      this.shopObjs.push(o);
    });
  }

  buy(o) {
    const s = this.state;
    const item = o.data;
    if (item.type === 'joker' && s.jokers.length >= MAX_JOKERS) {
      this.floatText(o, 'No room!', 'debuff');
      o.bump(-0.15);
      sfx.debuff();
      return;
    }
    if (!buyItem(s, item)) {
      this.floatText(o, 'Need more $', 'debuff');
      o.bump(-0.15);
      sfx.debuff();
      return;
    }
    sfx.money();
    this.removeAnchor(o.priceTag);
    this.shopObjs = this.shopObjs.filter((x) => x !== o);
    this.hideTooltip();
    if (item.type === 'joker') {
      // the bought card itself becomes the joker
      const inst = s.jokers[s.jokers.length - 1];
      o.kind = 'joker';
      o.data = inst;
      this.jokerObjs.set(inst.uid, o);
      o.bump(0.4);
      this.particles.burst(o.group.position.clone().setZ(0.6), '#ffd166', 40);
    } else {
      const h = item.def.hand;
      this.floatText(o, `${HAND_TYPES[h].name} lvl.${s.handLevels[h]}!`, 'level');
      this.particles.burst(o.group.position.clone().setZ(0.6), item.def.color[0], 80, { speed: 6, size: 0.3 });
      this.shake = 0.12;
      o.setTarget(tmp.copy(o.group.position).setY(9), 0.6, 0.4);
      o.dieAt = this.time + 1;
      this.flying.add(o);
    }
    this.updateHud();
  }

  toggleSellButton(o) {
    if (o.sellTag) {
      this.clearSellButtons();
      return;
    }
    this.clearSellButtons();
    const price = sellPrice(this.state, o.data);
    o.sellTag = this.anchor(o, new THREE.Vector3(0, -1.35, 0), 'sell', `<button class="btn green tiny">Sell $${price}</button>`);
    o.sellTag.el.querySelector('button').onclick = (e) => {
      e.stopPropagation();
      const got = sellJoker(this.state, o.data);
      sfx.money();
      this.floatText(o, `+$${got}`, 'money');
      this.clearSellButtons();
      this.jokerObjs.delete(o.data.uid);
      this.flyAway(o);
      this.updateHud();
    };
  }

  clearSellButtons() {
    for (const o of this.jokerObjs.values()) {
      if (o.sellTag) this.removeAnchor(o.sellTag);
      o.sellTag = null;
    }
  }

  // ───────────────────────────── end states ─────────────────────────────

  gameOver() {
    const s = this.state;
    s.phase = 'over';
    this.busy = true;
    sfx.lose();
    this.setTheme('over');
    this.bg.spinTarget = 2;
    this.shake = 0.4;
    $('controls').classList.add('hidden');
    const best = HAND_ORDER.filter((h) => s.handPlays[h]).sort((a, b) => s.handPlays[b] - s.handPlays[a])[0];
    this.showOverlay(`
      <div class="panel-title red">Game Over</div>
      <div class="summary">
        <div><span>Reached</span><b>Ante ${s.ante}, Round ${s.round}</b></div>
        <div><span>Final score</span><b>${fmt(s.score)} / ${fmt(s.blind.target)}</b></div>
        <div><span>Favourite hand</span><b>${best ? HAND_TYPES[best].name : '–'}</b></div>
      </div>
      <button class="btn orange big" data-act="again">New Run</button>
    `, { again: () => { this.hideOverlay(); this.busy = false; this.newRun(); } });
  }

  victory() {
    sfx.win();
    this.setTheme('shop');
    this.bg.spinTarget = 2;
    for (let i = 0; i < 8; i++) {
      setTimeout(() => this.particles.burst(new THREE.Vector3((Math.random() - 0.5) * 12, Math.random() * 4 - 1, 1), `hsl(${Math.random() * 360},90%,60%)`, 100, { speed: 9, size: 0.35, life: 1.6 }), i * 250);
    }
    this.showOverlay(`
      <div class="panel-title gold">You Win!</div>
      <p class="center">All ${MAX_ANTE} antes cleared. The jokers salute you.</p>
      <button class="btn orange big" data-act="again">New Run</button>
    `, { again: () => { this.hideOverlay(); this.newRun(); } });
  }

  showRunInfo() {
    sfx.click();
    if (this.infoOpen) return this.closeRunInfo();
    const s = this.state;
    const rows = HAND_ORDER.map((h) => {
      const b = handBase(h, s.handLevels[h]);
      return `<tr><td class="lvl">lvl.${s.handLevels[h]}</td><td>${HAND_TYPES[h].name}</td><td><span class="chips">${b.chips}</span> × <span class="mult">${b.mult}</span></td><td class="plays">#${s.handPlays[h]}</td></tr>`;
    }).join('');
    const el = document.createElement('div');
    el.className = 'info-panel';
    el.innerHTML = `<div class="panel-title">Poker Hands</div><table>${rows}</table><button class="btn orange">Back</button>`;
    el.querySelector('button').onclick = () => this.closeRunInfo();
    document.body.appendChild(el);
    this.infoOpen = el;
  }

  closeRunInfo() {
    this.infoOpen?.remove();
    this.infoOpen = null;
  }

  // ───────────────────────────── HUD / DOM helpers ─────────────────────────────

  updateHud() {
    const s = this.state;
    if (!s) return;
    const b = s.blind && s.phase !== 'blind-select' && s.phase !== 'shop' ? s.blind : currentBlindInfo(s);
    $('blind-panel').style.setProperty('--c', b.color);
    $('blind-name').textContent = b.name;
    $('blind-desc').textContent = b.boss?.desc ?? '';
    $('target').textContent = fmt(b.target);
    $('reward').textContent = `Reward: ${'$'.repeat(b.reward)}`;
    if (!this.counting) $('round-score').textContent = fmt(s.score);
    $('hands').textContent = s.hands;
    $('discards').textContent = s.discards;
    $('money').textContent = `$${s.money}`;
    $('ante').textContent = `${Math.min(s.ante, MAX_ANTE)}/${MAX_ANTE}`;
    $('round').textContent = s.round;
    const inDeck = s.phase === 'play' || s.phase === 'cashout' ? s.drawPile.length : s.fullDeck.length;
    this.deckLabel.el.textContent = `${inDeck}/${s.fullDeck.length}`;
    this.deckPile.forEach((o, i) => (o.group.visible = o.shadow.visible = inDeck > i * 9));

    const sel = this.cardObjs.size ? this.selectedCards().length : 0;
    const canAct = s.phase === 'play' && !this.busy && sel > 0;
    $('btn-play').disabled = !canAct || s.hands <= 0;
    $('btn-discard').disabled = !canAct || s.discards <= 0;
    if (this.jokerLabel) this.jokerLabel.el.textContent = `Jokers ${s.jokers.length}/${MAX_JOKERS}`;
  }

  showOverlay(html, actions = {}, mode = '') {
    const el = $('overlay');
    el.className = mode;
    el.innerHTML = `<div class="overlay-inner">${html}</div>`;
    el.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = () => actions[b.dataset.act]?.();
    });
  }

  hideOverlay() {
    $('overlay').className = 'hidden';
    $('overlay').innerHTML = '';
  }

  banner(title, sub, color) {
    const el = document.createElement('div');
    el.className = 'banner';
    el.style.setProperty('--c', color);
    el.innerHTML = `<h2>${title}</h2><p>${sub}</p>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  pop(el) {
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  countUp(el, from, to, ms) {
    this.counting = true;
    return new Promise((resolve) => {
      const t0 = performance.now();
      const step = (t) => {
        const k = Math.min(1, (t - t0) / ms);
        const e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(from + (to - from) * e);
        if (k < 1) requestAnimationFrame(step);
        else {
          this.counting = false;
          this.pop(el);
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  anchor(obj, offset, cls, html) {
    const el = document.createElement('div');
    el.className = `anchor ${cls}`;
    el.innerHTML = html;
    $('labels').appendChild(el);
    const a = { el, obj, offset };
    this.anchors.add(a);
    return a;
  }

  removeAnchor(a) {
    if (!a) return;
    a.el.remove();
    this.anchors.delete(a);
  }

  toScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight };
  }

  floatText(obj, text, cls) {
    if (!obj) return;
    const el = document.createElement('div');
    el.className = `float ${cls}`;
    el.textContent = text;
    const { x, y } = this.toScreen(obj.group.position.clone().add(new THREE.Vector3(0, 1.3, 0.5)));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    $('labels').appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  showTooltip(o) {
    const tt = $('tooltip');
    let html = '';
    if (o.kind === 'card') {
      const c = o.data;
      const deb = isDebuffed(this.state, c);
      html = `<h4 style="color:${SUIT_COLOR[c.suit]}">${rankLabel(c.rank)} ${SUIT_SYMBOL[c.suit]}</h4><p><span class="chips">+${cardChips(c)}</span> chips</p>${deb ? '<p class="red">Debuffed by the boss</p>' : ''}`;
    } else if (o.kind === 'joker' || (o.kind === 'shop' && o.data.type === 'joker')) {
      const def = JOKER_BY_ID[o.kind === 'joker' ? o.data.id : o.data.def.id];
      const ed = EDITION_BY_ID[o.data.edition];
      html = `<h4>${def.name}</h4><p>${colorize(def.desc)}</p>${ed ? `<p class="edition ${ed.id}">${ed.label}: ${colorize(ed.desc)}</p>` : ''}<span class="rarity ${def.rarity}">${def.rarity}</span>`;
    } else if (o.kind === 'shop') {
      const def = o.data.def;
      const lvl = this.state.handLevels[def.hand];
      const h = HAND_TYPES[def.hand];
      html = `<h4>${def.name}</h4><p>Level up <b>${h.name}</b> (lvl.${lvl} → ${lvl + 1})</p><p><span class="chips">+${h.lvChips}</span> chips, <span class="mult">+${h.lvMult}</span> mult</p><span class="rarity planet">planet</span>`;
    } else return;
    tt.innerHTML = html;
    tt.classList.remove('hidden');
    this.tooltipFor = o;
  }

  hideTooltip() {
    $('tooltip').classList.add('hidden');
    this.tooltipFor = null;
  }

  flyAway(o) {
    if (!o) return;
    this.removeAnchor(o.priceTag);
    this.removeAnchor(o.sellTag);
    o.selected = false;
    o.setTarget(new THREE.Vector3(13 + Math.random() * 2, (Math.random() - 0.5) * 4, 1), -1.5 + Math.random(), 1);
    o.speed = 5;
    o.dieAt = this.time + 1.2;
    this.flying.add(o);
  }

  // ───────────────────────────── per-frame ─────────────────────────────

  syncJokers() {
    const s = this.state;
    for (const inst of s.jokers) {
      if (this.jokerObjs.has(inst.uid)) continue;
      const o = new CardObject({ texture: jokerTexture(JOKER_BY_ID[inst.id]), data: inst, kind: 'joker', edition: inst.edition });
      o.setTarget(new THREE.Vector3(0, 9, 0));
      o.snap();
      o.addTo(this.scene);
      this.jokerObjs.set(inst.uid, o);
    }
    if (!this.jokerLabel) {
      this.jokerLabel = this.anchor({ group: { position: new THREE.Vector3(0, JOKER_Y + 1.15, 0) } }, new THREE.Vector3(), 'joker-count', '');
    }
  }

  layout() {
    const s = this.state;
    if (!s) return;
    const v = new THREE.Vector3();

    const hand = s.hand.map((c) => this.cardObjs.get(c.id)).filter(Boolean);
    const n = hand.length;
    const spacing = Math.min(1.3, 9.6 / Math.max(n, 1));
    hand.forEach((o, i) => {
      const off = i - (n - 1) / 2;
      const y = HAND_Y - off * off * 0.022 + (o.selected ? 0.5 : 0) + (this.handHidden ? -8 : 0);
      o.setTarget(v.set(off * spacing, y, i * 0.03 + (o.hovered ? 0.7 : 0)), -off * 0.035, 1);
    });

    const m = this.playRow.length;
    this.playRow.forEach((o, i) => {
      const off = i - (m - 1) / 2;
      o.setTarget(v.set(off * 1.8, PLAY_Y + (o.scoring ? 0.35 : 0), 0.3 + (o.hovered ? 0.5 : 0)), 0, 1.05);
    });

    this.syncJokers();
    const jokers = s.jokers.map((j) => this.jokerObjs.get(j.uid)).filter(Boolean);
    const jn = jokers.length;
    const js = Math.min(1.7, 8.5 / Math.max(jn, 1));
    jokers.forEach((o, i) => {
      const off = i - (jn - 1) / 2;
      o.setTarget(v.set(off * js, JOKER_Y, 0.1 + i * 0.02 + (o.hovered ? 0.7 : 0)), 0, 0.82);
    });

    const k = this.shopObjs.length;
    this.shopObjs.forEach((o, i) => {
      const off = i - (k - 1) / 2;
      o.setTarget(v.set(off * 2.2 + (i >= 2 ? 0.4 : -0.4), SHOP_Y, 0.2 + (o.hovered ? 0.7 : 0)), 0, 1);
    });
  }

  interactiveObjects() {
    const list = [...this.jokerObjs.values(), ...this.shopObjs];
    if (this.state?.phase === 'play') {
      for (const c of this.state.hand) {
        const o = this.cardObjs.get(c.id);
        if (o) list.push(o);
      }
    }
    return list;
  }

  updateHover() {
    const w = window.innerWidth, h = window.innerHeight;
    this.pointerNdc.set((this.pointer.x / w) * 2 - 1, -(this.pointer.y / h) * 2 + 1);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    const objs = this.interactiveObjects();
    const hits = $('overlay').classList.contains('hidden') || $('overlay').classList.contains('passthrough')
      ? this.raycaster.intersectObjects(objs.map((o) => o.front), false)
      : [];
    const hit = hits[0];
    const o = hit?.object.userData.cardObject ?? null;
    if (o !== this.hovered) {
      if (this.hovered) {
        this.hovered.hovered = false;
        this.hovered.tiltTarget.set(0, 0);
      }
      this.hovered = o;
      if (o) {
        o.hovered = true;
        sfx.hover();
        this.showTooltip(o);
      } else this.hideTooltip();
    }
    if (o && hit.uv) o.tiltTarget.set((hit.uv.x - 0.5) * 1.1, (hit.uv.y - 0.5) * 1.1);
    this.canvas.style.cursor = o ? 'pointer' : 'default';
  }

  updateAnchors() {
    for (const a of this.anchors) {
      const p = this.toScreen(tmp.copy(a.obj.group.position).add(a.offset));
      a.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    }
    if (this.tooltipFor) {
      const o = this.tooltipFor;
      const p = this.toScreen(tmp.copy(o.group.position).add(new THREE.Vector3(0, 1.25 * o.group.scale.y, 0.5)));
      const tt = $('tooltip');
      tt.style.transform = `translate(${Math.max(110, Math.min(window.innerWidth - 110, p.x))}px, ${p.y}px) translate(-50%, -100%)`;
    }
  }

  loop() {
    const tick = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
      this.lastFrame = now;
      this.time += dt;
      this.layout();
      this.updateHover();

      const all = [...this.cardObjs.values(), ...this.jokerObjs.values(), ...this.shopObjs, ...this.flying, ...this.deckPile];
      for (const o of all) o.update(dt, this.time);
      for (const o of this.flying) {
        if (this.time > o.dieAt) {
          o.removeFrom(this.scene);
          this.flying.delete(o);
        }
      }

      this.bg.update(dt, this.time);
      this.particles.update(dt);

      // camera: gentle parallax toward the pointer + screen shake
      this.shake = Math.max(0, this.shake - dt * 0.9);
      const px = THREE.MathUtils.clamp(this.pointerNdc.x, -1, 1);
      const py = THREE.MathUtils.clamp(this.pointerNdc.y, -1, 1);
      const sh = this.shake * this.shake * 2;
      const dir = new THREE.Vector3(px * 0.06, -0.14 + py * 0.04, 1).normalize();
      this.camera.position.copy(this.lookAt).addScaledVector(dir, this.camDist);
      this.camera.position.x += (Math.random() - 0.5) * sh;
      this.camera.position.y += (Math.random() - 0.5) * sh;
      this.camera.lookAt(this.lookAt);
      this.camera.rotation.z += (Math.random() - 0.5) * sh * 0.03;

      this.updateAnchors();
      this.composer.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}

function colorize(text) {
  return text
    .replace(/([+X]\d+(\.\d+)? Mult)/g, '<span class="mult">$1</span>')
    .replace(/(\+\d+ Chips)/g, '<span class="chips">$1</span>')
    .replace(/(\$\d+)/g, '<span class="gold">$1</span>');
}

const game = new Game();
window.__game = game;
game.start();
