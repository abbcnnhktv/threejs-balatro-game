import { makeDeck, shuffle } from './cards.js';
import { HAND_ORDER } from './hands.js';
import { JOKERS, JOKER_BY_ID, makeJokerInstance } from './jokers.js';
import { PLANETS, PLANET_COST } from './planets.js';
import { EDITIONS, EDITION_BY_ID } from './editions.js';

export const ANTE_BASE = [300, 800, 2000, 5000, 11000, 20000, 35000, 50000];
export const MAX_ANTE = ANTE_BASE.length;
export const HAND_SIZE = 8;
export const MAX_JOKERS = 5;

export const BOSSES = [
  { id: 'club', name: 'The Club', desc: 'All Club cards are debuffed', debuffSuit: 'clubs', color: '#4fb286' },
  { id: 'head', name: 'The Head', desc: 'All Heart cards are debuffed', debuffSuit: 'hearts', color: '#e2384d' },
  { id: 'goad', name: 'The Goad', desc: 'All Spade cards are debuffed', debuffSuit: 'spades', color: '#7b6cf6' },
  { id: 'window', name: 'The Window', desc: 'All Diamond cards are debuffed', debuffSuit: 'diamonds', color: '#f08a24' },
  { id: 'wall', name: 'The Wall', desc: 'Extra large blind', targetMult: 4, color: '#8d6e63' },
  { id: 'needle', name: 'The Needle', desc: 'Play only 1 hand', hands: 1, color: '#b8c0ff' },
  { id: 'water', name: 'The Water', desc: 'Start with 0 discards', discards: 0, color: '#48cae4' },
  { id: 'flint', name: 'The Flint', desc: 'Base Chips and Mult are halved', color: '#ff7b00' },
];

export const BLIND_KINDS = [
  { kind: 'small', name: 'Small Blind', mult: 1, reward: 3, color: '#2f6fed' },
  { kind: 'big', name: 'Big Blind', mult: 1.5, reward: 4, color: '#f0a020' },
  { kind: 'boss', name: 'Boss Blind', mult: 2, reward: 5, color: '#e0245e' },
];

export function newRun(rng = Math.random) {
  return {
    rng,
    ante: 1,
    blindIndex: 0, // 0 small, 1 big, 2 boss
    round: 0,
    money: 4,
    baseHands: 4,
    baseDiscards: 3,
    hands: 4,
    discards: 3,
    score: 0,
    jokers: [],
    handLevels: Object.fromEntries(HAND_ORDER.map((h) => [h, 1])),
    handPlays: Object.fromEntries(HAND_ORDER.map((h) => [h, 0])),
    fullDeck: makeDeck(),
    drawPile: [],
    hand: [],
    blind: null,
    bossForAnte: pick(BOSSES, rng),
    shop: null,
    phase: 'blind-select',
  };
}

function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

export function currentBlindInfo(state) {
  const base = BLIND_KINDS[state.blindIndex];
  const boss = state.blindIndex === 2 ? state.bossForAnte : null;
  const anteBase = ANTE_BASE[state.ante - 1];
  const target = Math.round(anteBase * base.mult * (boss?.targetMult ?? 1));
  return {
    ...base,
    name: boss ? boss.name : base.name,
    color: boss ? boss.color : base.color,
    boss,
    target,
  };
}

export function startBlind(state) {
  state.blind = currentBlindInfo(state);
  state.round += 1;
  state.score = 0;
  state.hands = state.blind.boss?.hands ?? state.baseHands;
  state.discards = state.blind.boss?.discards ?? state.baseDiscards;
  state.drawPile = shuffle([...state.fullDeck], state.rng);
  state.hand = [];
  state.phase = 'play';
}

/** Draw up to hand size. Returns the newly drawn cards. */
export function drawToHand(state) {
  const drawn = [];
  while (state.hand.length < HAND_SIZE && state.drawPile.length) {
    const c = state.drawPile.pop();
    state.hand.push(c);
    drawn.push(c);
  }
  return drawn;
}

export function removeFromHand(state, cards) {
  const ids = new Set(cards.map((c) => c.id));
  state.hand = state.hand.filter((c) => !ids.has(c.id));
}

export function cashOut(state) {
  const lines = [];
  lines.push({ label: `${state.blind.name} defeated`, amount: state.blind.reward });
  if (state.hands > 0) lines.push({ label: `Remaining hands (${state.hands})`, amount: state.hands });
  const interest = Math.min(5, Math.floor(state.money / 5));
  if (interest > 0) lines.push({ label: 'Interest ($1 per $5)', amount: interest });
  for (const j of state.jokers) {
    const def = JOKER_BY_ID[j.id];
    const m = def.onRoundEnd?.(state);
    if (m) lines.push({ label: def.name, amount: m });
  }
  const total = lines.reduce((s, l) => s + l.amount, 0);
  state.money += total;
  return { lines, total };
}

/** Advance after winning a blind. Returns 'shop' or 'victory'. */
export function advanceBlind(state) {
  state.blindIndex += 1;
  if (state.blindIndex > 2) {
    state.blindIndex = 0;
    state.ante += 1;
    state.bossForAnte = pick(BOSSES, state.rng);
    if (state.ante > MAX_ANTE) return 'victory';
  }
  return 'shop';
}

function rollEdition(rng) {
  let r = rng();
  for (const e of EDITIONS) {
    if (r < e.chance) return e.id;
    r -= e.chance;
  }
  return null;
}

export function rollShop(state) {
  const owned = new Set(state.jokers.map((j) => j.id));
  const pool = JOKERS.filter((j) => !owned.has(j.id));
  const items = [];
  for (let i = 0; i < 2 && pool.length; i++) {
    const idx = Math.floor(state.rng() * pool.length);
    const def = pool.splice(idx, 1)[0];
    const edition = rollEdition(state.rng);
    const cost = def.cost + (edition ? EDITION_BY_ID[edition].extra : 0);
    items.push({ type: 'joker', def, edition, cost, sold: false });
  }
  const planetPool = [...PLANETS];
  for (let i = 0; i < 2; i++) {
    const idx = Math.floor(state.rng() * planetPool.length);
    items.push({ type: 'planet', def: planetPool.splice(idx, 1)[0], cost: PLANET_COST, sold: false });
  }
  return items;
}

export function openShop(state) {
  state.phase = 'shop';
  state.shop = { items: rollShop(state), rerollCost: 5 };
}

export function buyItem(state, item) {
  if (item.sold || state.money < item.cost) return false;
  if (item.type === 'joker') {
    if (state.jokers.length >= MAX_JOKERS) return false;
    state.jokers.push(makeJokerInstance(item.def, item.edition));
  } else if (item.type === 'planet') {
    state.handLevels[item.def.hand] += 1;
  }
  state.money -= item.cost;
  item.sold = true;
  return true;
}

export function sellPrice(state, inst) {
  const def = JOKER_BY_ID[inst.id];
  const extra = inst.edition ? EDITION_BY_ID[inst.edition].extra : 0;
  return Math.max(1, Math.floor((def.cost + extra) / 2));
}

export function sellJoker(state, inst) {
  const i = state.jokers.indexOf(inst);
  if (i < 0) return 0;
  const price = sellPrice(state, inst);
  state.jokers.splice(i, 1);
  state.money += price;
  return price;
}

export function reroll(state) {
  if (state.money < state.shop.rerollCost) return false;
  state.money -= state.shop.rerollCost;
  state.shop.rerollCost += 1;
  state.shop.items = rollShop(state);
  return true;
}
