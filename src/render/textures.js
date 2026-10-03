import * as THREE from 'three';
import { SUIT_SYMBOL, SUIT_COLOR, rankLabel } from '../game/cards.js';
import { HAND_TYPES } from '../game/hands.js';

export const TEX_W = 384;
export const TEX_H = 538;
export const FONT = '"Pixelify Sans", "Trebuchet MS", sans-serif';

const cache = new Map();
let maxAniso = 1;
export function setMaxAnisotropy(v) {
  maxAniso = v;
}

function canvasTexture(key, draw) {
  if (cache.has(key)) return cache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = TEX_W;
  canvas.height = TEX_H;
  const ctx = canvas.getContext('2d');
  draw(ctx, TEX_W, TEX_H);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(key, tex);
  return tex;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const glyph = (suit) => SUIT_SYMBOL[suit] + '︎';

// standard pip layouts: [x, y] in 0..1 inside the pip box
const L = 0.22, C = 0.5, R = 0.78;
const PIPS = {
  2: [[C, 0.12], [C, 0.88]],
  3: [[C, 0.12], [C, 0.5], [C, 0.88]],
  4: [[L, 0.12], [R, 0.12], [L, 0.88], [R, 0.88]],
  5: [[L, 0.12], [R, 0.12], [C, 0.5], [L, 0.88], [R, 0.88]],
  6: [[L, 0.12], [R, 0.12], [L, 0.5], [R, 0.5], [L, 0.88], [R, 0.88]],
  7: [[L, 0.12], [R, 0.12], [C, 0.31], [L, 0.5], [R, 0.5], [L, 0.88], [R, 0.88]],
  8: [[L, 0.12], [R, 0.12], [C, 0.31], [L, 0.5], [R, 0.5], [C, 0.69], [L, 0.88], [R, 0.88]],
  9: [[L, 0.12], [R, 0.12], [L, 0.375], [R, 0.375], [C, 0.5], [L, 0.625], [R, 0.625], [L, 0.88], [R, 0.88]],
  10: [[L, 0.12], [R, 0.12], [C, 0.25], [L, 0.375], [R, 0.375], [L, 0.625], [R, 0.625], [C, 0.75], [L, 0.88], [R, 0.88]],
};

function cardBase(ctx, w, h, fill = '#f7f0e1') {
  ctx.clearRect(0, 0, w, h);
  roundRect(ctx, 0, 0, w, h, 28);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  roundRect(ctx, 5, 5, w - 10, h - 10, 24);
  ctx.stroke();
}

export function playingCardTexture(card) {
  return canvasTexture(`card:${card.rank}:${card.suit}`, (ctx, w, h) => {
    const color = SUIT_COLOR[card.suit];
    const label = rankLabel(card.rank);
    cardBase(ctx, w, h);

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const corner = () => {
      ctx.font = `700 64px ${FONT}`;
      ctx.fillText(label, 44, 52);
      ctx.font = `48px ${FONT}`;
      ctx.fillText(glyph(card.suit), 44, 104);
    };
    corner();
    ctx.save();
    ctx.translate(w, h);
    ctx.rotate(Math.PI);
    corner();
    ctx.restore();

    const bx = 86, by = 70, bw = w - 172, bh = h - 140;
    if (card.rank <= 10) {
      ctx.font = `76px ${FONT}`;
      for (const [px, py] of PIPS[card.rank]) {
        ctx.save();
        ctx.translate(bx + px * bw, by + py * bh);
        if (py > 0.55) ctx.rotate(Math.PI);
        ctx.fillText(glyph(card.suit), 0, 0);
        ctx.restore();
      }
    } else if (card.rank === 14) {
      ctx.font = `230px ${FONT}`;
      ctx.fillText(glyph(card.suit), w / 2, h / 2 + 8);
    } else {
      // face card panel
      const g = ctx.createLinearGradient(0, by, 0, by + bh);
      g.addColorStop(0, color);
      g.addColorStop(1, shade(color, -0.35));
      roundRect(ctx, bx - 4, by + 10, bw + 8, bh - 20, 18);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#e8c35a';
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.arc(bx + bw / 2, by + bh / 2, 30 + i * 22, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.stroke();
      }
      ctx.fillStyle = '#ffe9a8';
      ctx.font = `150px ${FONT}`;
      const crown = { 11: '♝', 12: '♛', 13: '♚' }[card.rank];
      ctx.fillText(crown + '︎', w / 2, h / 2 - 34);
      ctx.font = `700 92px ${FONT}`;
      ctx.fillStyle = '#fff';
      ctx.fillText(label, w / 2 - 34, h / 2 + 92);
      ctx.font = `70px ${FONT}`;
      ctx.fillText(glyph(card.suit), w / 2 + 38, h / 2 + 92);
    }
  });
}

export function backTexture() {
  return canvasTexture('back', (ctx, w, h) => {
    cardBase(ctx, w, h, '#c8323c');
    roundRect(ctx, 18, 18, w - 36, h - 36, 18);
    ctx.fillStyle = '#9e1f2a';
    ctx.fill();
    ctx.save();
    roundRect(ctx, 18, 18, w - 36, h - 36, 18);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,210,150,0.28)';
    ctx.lineWidth = 4;
    for (let i = -h; i < w + h; i += 30) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.moveTo(i, h);
      ctx.lineTo(i + h, 0);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#f7f0e1';
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c8323c';
    ctx.font = `110px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★', w / 2, h / 2 + 6);
  });
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  const lines = [];
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, x, y + (i - (lines.length - 1) / 2) * lineH));
}

const RARITY_COLOR = { common: '#3a86ff', uncommon: '#06d6a0', rare: '#ff006e' };

export function jokerTexture(def) {
  return canvasTexture(`joker:${def.id}`, (ctx, w, h) => {
    const [emoji, a, b] = def.art;
    cardBase(ctx, w, h, '#f7f0e1');
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    roundRect(ctx, 22, 22, w - 44, h - 150, 18);
    ctx.fillStyle = g;
    ctx.fill();
    // sunburst
    ctx.save();
    roundRect(ctx, 22, 22, w - 44, h - 150, 18);
    ctx.clip();
    ctx.translate(w / 2, (h - 128) / 2 + 11);
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    for (let i = 0; i < 12; i++) {
      ctx.rotate((Math.PI * 2) / 12);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-40, -400);
      ctx.lineTo(40, -400);
      ctx.fill();
    }
    ctx.restore();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `170px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;
    ctx.fillText(emoji, w / 2, (h - 128) / 2 + 18);
    ctx.shadowColor = 'transparent';
    // name plate
    ctx.fillStyle = '#2b2d42';
    ctx.font = `700 48px ${FONT}`;
    wrapText(ctx, def.name, w / 2, h - 66, w - 50, 48);
    // rarity gem
    ctx.fillStyle = RARITY_COLOR[def.rarity] ?? '#888';
    ctx.beginPath();
    ctx.arc(w - 46, 46, 13, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function planetTexture(def) {
  return canvasTexture(`planet:${def.id}`, (ctx, w, h) => {
    cardBase(ctx, w, h, '#14112b');
    // stars
    let seed = def.id.length * 977;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
      const s = rnd() < 0.15 ? 4 : 2;
      ctx.fillRect(20 + rnd() * (w - 40), 20 + rnd() * (h - 40), s, s);
    }
    const [a, b] = def.color;
    const cx = w / 2, cy = h / 2 - 40, r = 100;
    if (def.id === 'saturn') {
      ctx.strokeStyle = '#f2cc8f';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * 1.6, r * 0.42, -0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
    const g = ctx.createRadialGradient(cx - 35, cy - 35, 10, cx, cy, r);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.font = `700 52px ${FONT}`;
    ctx.fillText(def.name, w / 2, h - 140);
    ctx.font = `30px ${FONT}`;
    ctx.fillStyle = '#b8c0ff';
    wrapText(ctx, `Level up ${HAND_TYPES[def.hand].name}`, w / 2, h - 80, w - 60, 34);
  });
}

export function shadowTexture() {
  return canvasTexture('shadow', (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.filter = 'blur(22px)';
    roundRect(ctx, 50, 50, w - 100, h - 100, 40);
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fill();
  });
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}
