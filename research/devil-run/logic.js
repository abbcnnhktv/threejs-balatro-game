/* 恶魔赌局 · shared rules. The simulator (Node) and the playable demo (browser) both run this file,
   so the numbers in the report are the numbers you play. No DOM, no randomness of its own: pass an rng. */
(function (root) {
  'use strict';

  /* ───────────── cards & hands ───────────── */
  const SUITS = ['s', 'h', 'c', 'd'];
  const SUIT_SYM = { s: '♠', h: '♥', c: '♣', d: '♦' };
  const SUIT_NAME = { s: '黑桃', h: '红心', c: '梅花', d: '方块' };
  const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const rankLabel = (r) => RANK_LABEL[r] || String(r);
  const cardChips = (c) => (c.r === 14 ? 11 : c.r >= 10 ? 10 : c.r);
  const isFace = (c) => c.r >= 11 && c.r <= 13;

  let uid = 0;
  function makeDeck() {
    const d = [];
    for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push({ r, s, id: 'c' + uid++ });
    return d;
  }
  function shuffle(a, rng) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  // [name, chips, mult, +chips per level, +mult per level]
  const HANDS = {
    straight_flush: ['同花顺', 100, 8, 40, 4],
    four_kind: ['四条', 60, 7, 30, 3],
    full_house: ['葫芦', 40, 4, 25, 2],
    flush: ['同花', 35, 4, 15, 2],
    straight: ['顺子', 30, 4, 30, 3],
    three_kind: ['三条', 30, 3, 20, 2],
    two_pair: ['两对', 20, 2, 20, 1],
    pair: ['对子', 10, 2, 15, 1],
    high_card: ['高牌', 5, 1, 10, 1],
  };
  const HAND_ORDER = Object.keys(HANDS);

  function evaluate(cards) {
    const n = cards.length;
    const byRank = {};
    for (const c of cards) (byRank[c.r] = byRank[c.r] || []).push(c);
    const groups = Object.values(byRank).sort((a, b) => b.length - a.length || b[0].r - a[0].r);
    const flush = n === 5 && cards.every((c) => c.s === cards[0].s);
    let straight = false;
    if (n === 5 && groups.length === 5) {
      const rs = cards.map((c) => c.r).sort((a, b) => a - b);
      straight = rs[4] - rs[0] === 4 || (rs[0] === 2 && rs[1] === 3 && rs[2] === 4 && rs[3] === 5 && rs[4] === 14);
    }
    if (flush && straight) return { type: 'straight_flush', scoring: cards };
    if (groups[0].length === 4) return { type: 'four_kind', scoring: groups[0] };
    if (groups[0].length === 3 && groups[1] && groups[1].length === 2) return { type: 'full_house', scoring: cards };
    if (flush) return { type: 'flush', scoring: cards };
    if (straight) return { type: 'straight', scoring: cards };
    if (groups[0].length === 3) return { type: 'three_kind', scoring: groups[0] };
    if (groups[0].length === 2 && groups[1] && groups[1].length === 2) return { type: 'two_pair', scoring: groups[0].concat(groups[1]) };
    if (groups[0].length === 2) return { type: 'pair', scoring: groups[0] };
    return { type: 'high_card', scoring: [groups[0][0]] };
  }
  // one pass: hand type, scoring cards and which hand types the play "contains"
  function analyze(cards) {
    const ev = evaluate(cards);
    const counts = {};
    for (const c of cards) counts[c.r] = (counts[c.r] || 0) + 1;
    const sz = Object.values(counts).sort((a, b) => b - a);
    const t = ev.type;
    ev.has = {
      high_card: true, pair: sz[0] >= 2, two_pair: sz[0] >= 2 && sz[1] >= 2, three_kind: sz[0] >= 3, four_kind: sz[0] >= 4,
      straight: t === 'straight' || t === 'straight_flush', flush: t === 'flush' || t === 'straight_flush',
      full_house: t === 'full_house', straight_flush: t === 'straight_flush',
    };
    return ev;
  }
  function contains(type, cards) {
    const counts = {};
    for (const c of cards) counts[c.r] = (counts[c.r] || 0) + 1;
    const sizes = Object.values(counts).sort((a, b) => b - a);
    if (type === 'pair') return sizes[0] >= 2;
    if (type === 'two_pair') return sizes[0] >= 2 && sizes[1] >= 2;
    if (type === 'three_kind') return sizes[0] >= 3;
    const e = evaluate(cards).type;
    if (type === 'straight') return e === 'straight' || e === 'straight_flush';
    if (type === 'flush') return e === 'flush' || e === 'straight_flush';
    return e === type;
  }

  /* ───────────── jokers ───────────── */
  // onCard(card, ctx) → effect per scored card; onHand(ctx) → effect once per hand. effect: { chips, mult, xmult }
  const suitJ = (id, name, suit, cost) => ({ id, name, cost, rarity: 1, desc: `每张计分的${SUIT_NAME[suit]}牌 +3 倍率`, onCard: (c) => (c.s === suit ? { mult: 3 } : null) });
  const typeJ = (id, name, type, eff, cost, rarity = 1) => ({
    id, name, cost, rarity,
    desc: `出牌含${HANDS[type][0]}时 ${eff.xmult ? '×' + eff.xmult + ' 倍率' : eff.mult ? '+' + eff.mult + ' 倍率' : '+' + eff.chips + ' 筹码'}`,
    onHand: (x) => (x.has[type] ? eff : null),
  });
  const JOKERS = [
    { id: 'joker', name: '小丑', cost: 2, rarity: 1, desc: '+4 倍率', onHand: () => ({ mult: 4 }) },
    suitJ('greedy', '贪婪小丑', 'd', 5), suitJ('lusty', '色欲小丑', 'h', 5), suitJ('wrath', '暴怒小丑', 's', 5), suitJ('glutton', '暴食小丑', 'c', 5),
    typeJ('jolly', '快乐小丑', 'pair', { mult: 8 }, 3), typeJ('zany', '疯狂小丑', 'three_kind', { mult: 12 }, 4),
    typeJ('mad', '狂躁小丑', 'two_pair', { mult: 10 }, 4), typeJ('crazy', '癫狂小丑', 'straight', { mult: 12 }, 4),
    typeJ('droll', '滑稽小丑', 'flush', { mult: 10 }, 4), typeJ('sly', '狡猾小丑', 'pair', { chips: 50 }, 3),
    typeJ('duo', '二重奏', 'pair', { xmult: 2 }, 8, 2), typeJ('trio', '三重奏', 'three_kind', { xmult: 3 }, 8, 2),
    typeJ('family', '一家人', 'flush', { xmult: 2 }, 8, 2),
    { id: 'fib', name: '斐波那契', cost: 7, rarity: 2, desc: '计分的 A/2/3/5/8 各 +8 倍率', onCard: (c) => ([14, 2, 3, 5, 8].includes(c.r) ? { mult: 8 } : null) },
    { id: 'scary', name: '鬼脸', cost: 4, rarity: 1, desc: '计分的人头牌各 +30 筹码', onCard: (c) => (isFace(c) ? { chips: 30 } : null) },
    { id: 'even', name: '偶数史蒂文', cost: 4, rarity: 1, desc: '计分的偶数牌各 +4 倍率', onCard: (c) => (c.r <= 10 && c.r % 2 === 0 ? { mult: 4 } : null) },
    { id: 'odd', name: '奇数托德', cost: 4, rarity: 1, desc: '计分的奇数牌各 +31 筹码', onCard: (c) => (c.r === 14 || (c.r <= 9 && c.r % 2 === 1) ? { chips: 31 } : null) },
    { id: 'abstract', name: '抽象小丑', cost: 4, rarity: 1, desc: '每张小丑 +3 倍率', onHand: (x) => ({ mult: 3 * x.run.jokers.length }) },
    { id: 'half', name: '半个小丑', cost: 4, rarity: 1, desc: '出牌不超过 3 张时 +20 倍率', onHand: (x) => (x.played.length <= 3 ? { mult: 20 } : null) },
    { id: 'green', name: '绿色小丑', cost: 4, rarity: 1, desc: '每出一手 +1 倍率，每弃一次 -1（会累积）', onHand: (x) => ({ mult: x.run.green }) },
    { id: 'nova', name: '超新星', cost: 5, rarity: 2, desc: '这个牌型本局打过几次，就 +几 倍率', onHand: (x) => ({ mult: x.run.plays[x.type] + 1 }) },
    { id: 'constel', name: '星座', cost: 6, rarity: 2, desc: '每用过一张星球牌，×0.1 倍率（会累积）', onHand: (x) => (x.run.planetsUsed ? { xmult: 1 + 0.1 * x.run.planetsUsed } : null) },
    { id: 'banana', name: '大香蕉', cost: 8, rarity: 3, desc: '×3 倍率', onHand: () => ({ xmult: 3 }) },
    { id: 'bull', name: '公牛', cost: 6, rarity: 2, desc: '你每有 $1，+2 筹码', onHand: (x) => (x.run.money > 0 ? { chips: 2 * x.run.money } : null) },
    { id: 'gold', name: '金小丑', cost: 6, rarity: 1, desc: '每关结束 +$4', endOfBlind: () => 4 },
  ];
  const JOKER_BY_ID = Object.fromEntries(JOKERS.map((j) => [j.id, j]));

  const PLANETS = [
    ['pluto', '冥王星', 'high_card'], ['mercury', '水星', 'pair'], ['uranus', '天王星', 'two_pair'], ['venus', '金星', 'three_kind'],
    ['saturn', '土星', 'straight'], ['jupiter', '木星', 'flush'], ['earth', '地球', 'full_house'], ['mars', '火星', 'four_kind'], ['neptune', '海王星', 'straight_flush'],
  ].map(([id, name, hand]) => ({ id, name, hand, cost: 3 }));

  /* ───────────── blinds, bosses, the revolver ───────────── */
  const CONFIG = {
    antes: 8,
    anteBase: [300, 1000, 2300, 4600, 9000, 16500, 28000, 47000],
    blindMult: [1, 1.5, 2],
    blindReward: [3, 4, 5],
    hands: 4, discards: 3, handSize: 8, jokerSlots: 5, startMoney: 4,
    interestPer: 5, interestCap: 5,
    shopJokers: 2, shopPlanets: 2, rerollBase: 4,
    chambers: 6,
    devilKillMoney: 8, bountyPerLive: 4, dudCost: 3,
    devilSureBelow: 0.75, devilLiveSure: 0.7, devilLiveNear: 0.4,
  };
  const BOSSES = [
    { id: 'wall', name: '高墙', desc: '目标分 ×2', targetMult: 2 },
    { id: 'water', name: '深水', desc: '没有弃牌', discards: 0 },
    { id: 'manacle', name: '镣铐', desc: '手牌上限 -1', handSize: -1 },
    { id: 'flint', name: '燧石', desc: '牌型基础筹码和倍率减半', halve: true },
    { id: 'club', name: '梅花之咒', desc: '梅花牌不计分', debuff: 'c' },
    { id: 'heart', name: '红心之咒', desc: '红心牌不计分', debuff: 'h' },
    { id: 'needle', name: '独针', desc: '只能出 1 手，但目标只有一半', hands: 1, targetMult: 0.5 },
  ];
  const BLIND_NAMES = ['小盲注', '大盲注', 'Boss'];

  function blindTarget(ante, idx, boss) {
    const base = CONFIG.anteBase[Math.min(ante, CONFIG.antes) - 1];
    return Math.round(base * CONFIG.blindMult[idx] * (idx === 2 && boss && boss.targetMult ? boss.targetMult : 1));
  }

  function newRun(rng) {
    return {
      ante: 1, blind: 0, money: CONFIG.startMoney, jokers: [], levels: Object.fromEntries(HAND_ORDER.map((h) => [h, 1])),
      plays: Object.fromEntries(HAND_ORDER.map((h) => [h, 0])), green: 0, planetsUsed: 0,
      gun: { chambers: [] }, // this ante's bullets in load order: { who: 'you'|'devil', live }
      boss: BOSSES[Math.floor(rng() * BOSSES.length)], alive: true, devilsKilled: 0, log: [],
    };
  }

  /* ───────────── scoring ───────────── */
  // returns { type, name, chips, mult, total, steps } ; steps are for animation
  function score(run, played, held, boss, fast, pre) {
    const an = pre || analyze(played);
    const { type, scoring } = an;
    const lv = run.levels[type];
    const h = HANDS[type];
    let chips = h[1] + h[3] * (lv - 1), mult = h[2] + h[4] * (lv - 1);
    if (boss && boss.halve) { chips = Math.ceil(chips / 2); mult = Math.ceil(mult / 2); }
    const steps = fast ? null : [{ kind: 'base', chips, mult }];
    const ctx = { run, played, held, type, scoring, has: an.has };
    const apply = (kind, ref, e) => {
      if (!e) return;
      if (e.chips) chips += e.chips;
      if (e.mult) mult += e.mult;
      if (e.xmult) mult *= e.xmult;
      if (steps) steps.push({ kind, ref, e, chips, mult });
    };
    for (const c of scoring) {
      if (boss && boss.debuff === c.s) { if (steps) steps.push({ kind: 'debuff', ref: c, chips, mult }); continue; }
      apply('card', c, { chips: cardChips(c) });
      for (const j of run.jokers) { const d = JOKER_BY_ID[j]; if (d.onCard) apply('joker', j, d.onCard(c, ctx)); }
    }
    for (const j of run.jokers) { const d = JOKER_BY_ID[j]; if (d.onHand) apply('joker', j, d.onHand(ctx)); }
    mult = Math.round(mult * 100) / 100;
    return { type, name: h[0], chips, mult, total: Math.floor(chips * mult), steps, scoring };
  }
  // after a hand is played (mutates run counters)
  function notePlayed(run, type) { run.plays[type]++; run.green++; }
  function noteDiscard(run) { run.green = Math.max(0, run.green - 1); }

  /* ───────────── blind lifecycle ───────────── */
  function startBlind(run, rng) {
    const idx = run.blind, boss = idx === 2 ? run.boss : null;
    return {
      idx, boss, target: blindTarget(run.ante, idx, boss), score: 0,
      hands: boss && boss.hands ? boss.hands : CONFIG.hands,
      discards: boss && boss.discards === 0 ? 0 : CONFIG.discards,
      handSize: CONFIG.handSize + (boss && boss.handSize ? boss.handSize : 0),
      deck: shuffle(makeDeck(), rng), hand: [],
    };
  }
  function draw(b) { while (b.hand.length < b.handSize && b.deck.length) b.hand.push(b.deck.pop()); }

  // The winner of each blind loads one bullet and chooses live or dud; the other side sees a bullet go in, not which.
  // The boss winner loads, spins and fires. Every live round counts, whoever loaded it: your live round can kill you.
  // a dud is insurance and costs money; a live round is free. You must load live if you can't pay.
  function loadBullet(run, youWon, live) {
    if (youWon && !live) { if (run.money < CONFIG.dudCost) live = true; else run.money -= CONFIG.dudCost; }
    run.gun.chambers.push({ who: youWon ? 'you' : 'devil', live: !!live });
    return !!live;
  }
  // killing the devil pays a bounty that grows with every live round in the gun
  const killMoney = (shot) => CONFIG.devilKillMoney + CONFIG.bountyPerLive * shot.live;
  const liveCount = (run) => run.gun.chambers.filter((c) => c.live).length;
  function hitChance(n) { return Math.min(1, n / CONFIG.chambers); }
  function bossShot(run, youWon, rng) {
    const shooter = youWon ? 'you' : 'devil', live = liveCount(run);
    const p = hitChance(live);
    const hit = rng() < p;
    return { shooter, p, hit, live, chambers: run.gun.chambers.map((c) => ({ ...c })) };
  }
  // the devil only loads after you fail a blind. Boss win: always live. Otherwise he bets on you failing again.
  function devilLoadsLive(blindIdx, ratio, rng) { return blindIdx === 2 || rng() < (ratio < CONFIG.devilSureBelow ? CONFIG.devilLiveSure : CONFIG.devilLiveNear); }
  // your firepower this blind (points per hand) projected onto this ante's boss: 1.0 = exactly enough
  function projectBoss(run, score, handsUsed) {
    const boss = run.boss, hands = boss.hands || CONFIG.hands;
    return (score / Math.max(1, handsUsed)) * hands / blindTarget(run.ante, 2, boss);
  }

  function endBlindMoney(run, b, won) {
    const lines = [];
    if (won) {
      lines.push(['击败' + BLIND_NAMES[b.idx], CONFIG.blindReward[b.idx]]);
      if (b.hands > 0) lines.push(['剩余出牌 ×' + b.hands, b.hands]);
    }
    const interest = Math.min(CONFIG.interestCap, Math.floor(run.money / CONFIG.interestPer));
    if (interest) lines.push(['利息', interest]);
    for (const j of run.jokers) { const d = JOKER_BY_ID[j]; if (d.endOfBlind) lines.push([d.name, d.endOfBlind()]); }
    const total = lines.reduce((s, l) => s + l[1], 0);
    run.money += total;
    return { lines, total };
  }
  function advance(run, rng) {
    run.blind++;
    if (run.blind > 2) { run.blind = 0; run.ante++; run.gun = { chambers: [] }; run.boss = BOSSES[Math.floor(rng() * BOSSES.length)]; }
    return run.ante > CONFIG.antes ? 'victory' : 'next';
  }

  /* ───────────── shop ───────────── */
  function rollShop(run, rng) {
    const owned = new Set(run.jokers);
    const pool = JOKERS.filter((j) => !owned.has(j.id));
    const weight = (j) => (j.rarity === 1 ? 10 : j.rarity === 2 ? 4 : 1.2);
    const items = [];
    for (let i = 0; i < CONFIG.shopJokers && pool.length; i++) {
      let tot = pool.reduce((s, j) => s + weight(j), 0), x = rng() * tot, k = 0;
      while ((x -= weight(pool[k])) > 0) k++;
      items.push({ kind: 'joker', id: pool[k].id, cost: pool[k].cost });
      pool.splice(k, 1);
    }
    const pl = shuffle(PLANETS.slice(), rng);
    for (let i = 0; i < CONFIG.shopPlanets; i++) items.push({ kind: 'planet', id: pl[i].id, hand: pl[i].hand, cost: pl[i].cost });
    return items;
  }
  function devilDrop(run, rng) {
    // killing the devil: pick 1 of 3 jokers, weighted toward rare
    const owned = new Set(run.jokers);
    const pool = shuffle(JOKERS.filter((j) => !owned.has(j.id)), rng).sort((a, b) => b.rarity - a.rarity + (rng() - 0.5) * 2);
    return pool.slice(0, 3).map((j) => j.id);
  }
  function buy(run, item) {
    if (run.money < item.cost) return false;
    if (item.kind === 'joker') { if (run.jokers.length >= CONFIG.jokerSlots) return false; run.jokers.push(item.id); }
    else { run.levels[item.hand]++; run.planetsUsed++; }
    run.money -= item.cost;
    return true;
  }
  function sellValue(id) { return Math.max(1, Math.floor(JOKER_BY_ID[id].cost / 2)); }

  const DL = {
    SUITS, SUIT_SYM, SUIT_NAME, rankLabel, cardChips, isFace, makeDeck, shuffle, HANDS, HAND_ORDER, evaluate, analyze, contains,
    JOKERS, JOKER_BY_ID, PLANETS, CONFIG, BOSSES, BLIND_NAMES, blindTarget, newRun, score, notePlayed, noteDiscard,
    startBlind, draw, loadBullet, killMoney, liveCount, hitChance, bossShot, devilLoadsLive, projectBoss, endBlindMoney, advance, rollShop, devilDrop, buy, sellValue,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = DL; else root.DL = DL;
})(typeof window !== 'undefined' ? window : globalThis);
