// v6: two guns.
// Devil's gun (penalty): ante N holds N live in 6 (spun each pull). Fail a blind -> devil pulls at you.
// Your gun (the gun card, once per blind): hit chance = your bullets / 6. Playing it costs 1 hand.
//   Hit: blind cleared + devil drops a joker; the bullet is spent. Miss: nothing.
//   Desperation: if you fail and still hold the gun card, you get that shot first.
// Load: spend a hand; bullets by hand type. Your bullets persist for the whole run (max 6).
import { evaluateHand, handBase } from '../../src/game/hands.js';
import { cardChips } from '../../src/game/cards.js';
const BUL = { high_card: 0, pair: 1, two_pair: 2, three_kind: 2, straight: 3, flush: 3, full_house: 4, four_kind: 4, straight_flush: 5 };
const score = (cards, jm) => { const { type, scoring } = evaluateHand(cards); const b = handBase(type, 1); return { type, score: Math.floor((b.chips + scoring.reduce((s, c) => s + cardChips(c), 0)) * b.mult * jm) }; };
function combos(a, k, s = 0, cur = [], out = []) { if (cur.length === k) { out.push(cur.slice()); return out; } for (let i = s; i < a.length; i++) { cur.push(a[i]); combos(a, k, i + 1, cur, out); cur.pop(); } return out; }
function best(hand, jm, key) { let r = null; for (let k = 1; k <= Math.min(5, hand.length); k++) for (const c of combos(hand, k)) { const s = score(c, jm); const v = key ? BUL[s.type] * 1e7 + s.score : s.score; if (!r || v > r.v) r = { cards: c, ...s, v }; } return r; }
function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function deck(rng) { const d = []; for (const s of 'shcd') for (let r = 2; r <= 14; r++) d.push({ rank: r, suit: s }); d.push({ gun: true }); for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; }
const TARGETS = [[300, 450, 600], [800, 1200, 1600], [2000, 3000, 4000], [5000, 7500, 10000]];

export function run(st, rng, S, cfg) {
  let lives = cfg.lives, jm = 1, gold = 4, b = cfg.startBullets;
  for (let ante = 0; ante < 4; ante++) {
    const devilLiveBase = ante + 1;
    for (let bi = 0; bi < 3; bi++) {
      const target = TARGETS[ante][bi];
      const d = deck(rng);
      let hand = d.splice(0, 8), sc = 0, hands = 4, discards = 3, cleared = false;
      const refill = () => { while (hand.length < 8 && d.length) hand.push(d.shift()); };
      const shoot = () => { S.shots++; hand = hand.filter((c) => !c.gun); if (rng() < Math.min(cfg.capB, b) / 6) { b--; S.hits++; jm += cfg.drop; gold += 3; return true; } return false; };
      for (;;) {
        if (sc >= target) { gold += [3, 4, 5][bi] + hands; cleared = true; break; }
        if (hands === 0) break;
        const cards = hand.filter((c) => !c.gun), hasGun = cards.length < hand.length;
        const bs = cards.length ? best(cards, jm) : null;
        const need = target - sc;
        const onTrack = bs && bs.score * hands >= need;
        if (hasGun && b >= st.minB && (st.shootWhen === 'always' || !onTrack)) { hands -= cfg.shotCost; shoot(); refill(); continue; }
        if (bs && b < st.loadTo && st.loadIn.includes(bi)) {
          const bb = best(cards, jm, 1);
          const spare = bs.score * (hands - 1) >= need;
          if (BUL[bb.type] > 0 && (spare || st.loadEvenBehind)) { b = Math.min(6, b + BUL[bb.type]); S.loads++; hands--; hand = hand.filter((c) => !bb.cards.includes(c)); refill(); continue; }
        }
        if (bs && discards > 0 && (!onTrack || (st.dig && !hasGun)) && cards.length > bs.cards.length) {
          const junk = cards.filter((c) => !bs.cards.includes(c)).slice(0, 5);
          hand = hand.filter((c) => !junk.includes(c)); discards--; refill(); continue;
        }
        if (!bs) { hands = 0; continue; }
        sc += bs.score; hands--; hand = hand.filter((c) => !bs.cards.includes(c)); refill();
      }
      if (!cleared) {
        S.fails++;
        
        const devilLive = cfg.penalty;
        if (rng() < devilLive / 6) { S.failHits++; if (--lives <= 0) return { win: false, ante }; }
      }
    }
    while (gold >= 6) { gold -= 6; jm += cfg.shop; }
  }
  return { win: true, ante: 4 };
}
export const STRATS = {
  'A 纯计分,不开枪': { loadTo: 0, loadIn: [], minB: 9 },
  'B 不上膛,有枪就开': { loadTo: 0, loadIn: [], minB: 1, shootWhen: 'always' },
  'C 有余力才上膛→2发,落后才开': { loadTo: 2, loadIn: [0, 1, 2], minB: 1, shootWhen: 'behind' },
  'D 有余力才上膛→3发,有枪就开': { loadTo: 3, loadIn: [0, 1, 2], minB: 1, shootWhen: 'always' },
  'E 有余力才上膛→4发,有枪就开': { loadTo: 4, loadIn: [0, 1, 2], minB: 1, shootWhen: 'always' },
  'F 有余力才上膛→6发,有枪就开': { loadTo: 6, loadIn: [0, 1, 2], minB: 1, shootWhen: 'always' },
  'G 拼命上膛(落后也装)→6发': { loadTo: 6, loadIn: [0, 1, 2], minB: 1, shootWhen: 'always', loadEvenBehind: true },
};
if (false) {
  const N = +process.argv[2] || 1500;
  const cfg = { lives: 2, drop: 0.6, shop: 0.25, startBullets: 1 };
  console.log('2 条命 · 恶魔惩罚枪 = 第N底注 N/6 · 你的子弹贯穿整局');
  console.log('策略'.padEnd(26), '通关率  到达底注  打中恶魔/局  未过关/局  绝境一枪命中/局  被惩罚枪打中/局');
  for (const [name, st] of Object.entries(STRATS)) {
    const rng = mul(2026); const S = { fails: 0, failHits: 0, shots: 0, hits: 0, loads: 0, desperate: 0, desperateHits: 0 };
    let wins = 0, a = 0;
    for (let i = 0; i < N; i++) { const r = run(st, rng, S, cfg); if (r.win) wins++; a += r.ante + 1; }
    console.log(name.padEnd(18), `${(wins / N * 100).toFixed(1)}%`.padStart(6), (a / N).toFixed(2).padStart(8), (S.hits / N).toFixed(2).padStart(10), (S.fails / N).toFixed(2).padStart(9), (S.desperateHits / N).toFixed(2).padStart(13), (S.failHits / N).toFixed(2).padStart(14));
  }
}
