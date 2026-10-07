// "Gold Devil" rules, one blind = up to 4 rounds.
// Each round: devil shows 3 of 5 cards. You may load the current chamber: A = live, Q = blank, nothing = empty.
// You play a poker hand. Higher score wins the round (tie -> devil). Winner pulls the trigger:
//   you win:  A -> devil drops gold = your score (damage); Q or empty -> click.
//   you lose: A or EMPTY -> you lose 1 HP; Q -> click.   (an empty chamber is the devil's bullet)
// Gun card (1 in your deck): play it with your hand -> you shoot this round regardless of the result.
// Blind won when the devil's gold reaches 0. Blind lost if your HP hits 0 or 4 rounds pass.
import { evaluateHand, handBase } from '../../src/game/hands.js';
import { cardChips } from '../../src/game/cards.js';
const score = (cards, m = 1) => { if (!cards.length) return 0; const { type, scoring } = evaluateHand(cards); const b = handBase(type, 1); return Math.floor((b.chips + scoring.reduce((s, c) => s + cardChips(c), 0)) * b.mult * m); };
function combos(a, k, s = 0, cur = [], out = []) { if (cur.length === k) { out.push(cur.slice()); return out; } for (let i = s; i < a.length; i++) { cur.push(a[i]); combos(a, k, i + 1, cur, out); cur.pop(); } return out; }
const CACHE = new Map();
function bestPlay(cards, m) { let r = { cards: [], score: 0 }; for (let k = 1; k <= Math.min(5, cards.length); k++) for (const c of combos(cards, k)) { const s = score(c, m); if (s > r.score) r = { cards: c, score: s }; } return r; }
function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(d, rng) { for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; }
const fresh = () => { const d = []; for (const s of ['spades', 'hearts', 'clubs', 'diamonds']) for (let r = 2; r <= 14; r++) d.push({ rank: r, suit: s }); return d; };

export function playBlind(pol, rng, cfg, S) {
  const deck = shuffle([...fresh(), { gun: true }], rng);
  let hand = deck.splice(0, 8), gold = cfg.devilGold, hp = cfg.hp, discards = 3;
  for (let round = 0; round < 4; round++) {
    // devil's hand: 5 from his own deck, 3 shown
    const dd = shuffle(fresh(), rng); const devil = dd.slice(0, 5), up = devil.slice(0, 3), pool = dd.slice(5);
    const devilScore = score(bestPlay(devil, cfg.devilMult).cards, cfg.devilMult);
    const samples = []; for (let i = 0; i < 30; i++) { const h = shuffle(pool.slice(), rng).slice(0, 2); samples.push(bestPlay([...up, ...h], cfg.devilMult).score); }
    const pWin = (s) => samples.filter((x) => s > x).length / samples.length;
    // dig for ammo with discards
    let cards = hand.filter((c) => !c.gun);
    const LIVE = cfg.live, BLANK = cfg.blank;
    while (discards > 0 && pol.dig && !cards.some((c) => LIVE.includes(c.rank)) && deck.length) {
      const bp = bestPlay(cards, cfg.m);
      const junk = cards.filter((c) => !bp.cards.includes(c) && !BLANK.includes(c.rank)).slice(0, 5);
      if (!junk.length) break;
      hand = hand.filter((c) => !junk.includes(c)); discards--; while (hand.length < 8 && deck.length) hand.push(deck.shift());
      cards = hand.filter((c) => !c.gun);
    }
    const hasGun = hand.some((c) => c.gun);
    const opts = [];
    const remain = gold;
    // pick the lowest-value card of the group to load
    const pickOf = (ranks) => cards.filter((c) => ranks.includes(c.rank)).sort((a, b) => a.rank - b.rank)[0];
    const without = (ranks) => { const c = pickOf(ranks); return c ? cards.filter((x) => x !== c) : null; };
    for (const load of ['A', 'Q', 'none']) {
      const rest = load === 'A' ? without(LIVE) : load === 'Q' ? without(BLANK) : cards;
      if (!rest) continue;
      const bp = bestPlay(rest, cfg.m);
      const p = hasGun && pol.useGun ? 1 : pWin(bp.score);
      const dmg = load === 'A' ? Math.min(bp.score, remain) / cfg.devilGold : 0;
      const risk = load === 'Q' ? 0 : (1 - p);
      const healCost = cfg.heal * 1 / 1; const ev = p * dmg * (load === 'A' ? 1 : 0) - risk * (pol.lambda * (hp === 1 ? 2 : 1) + cfg.heal * 0.5);
      opts.push({ load, bp, p, ev });
    }
    let pick = pol.threshold != null ? (() => { const A = opts.find((o) => o.load === 'A'), Q = opts.find((o) => o.load === 'Q'), N0 = opts.find((o) => o.load === 'none'); if (A && A.p >= pol.threshold) return A; return Q || (A && A.p >= 0.35 ? A : N0); })() : pol.fixed ? opts.find((o) => o.load === pol.fixed) || opts.find((o) => o.load === 'none') : opts.sort((a, b) => b.ev - a.ev)[0];
    const iWin = (hasGun && pol.useGun) || pick.bp.score > devilScore;
    if (hasGun && pol.useGun) { hand = hand.filter((c) => !c.gun); S.gunUsed++; }
    S.rounds++; S.shots++;
    if (iWin) {
      S.youShoot++;
      if (pick.load === 'A') { gold -= pick.bp.score; S.hits++; }
    } else {
      S.devilShoots++;
      if (pick.load !== 'Q') { hp--; S.hpLost++; gold = Math.min(cfg.devilGold * 1.5, gold + Math.floor(devilScore * cfg.heal)); }
    }
    S['load' + pick.load]++;
    const used = new Set(pick.bp.cards); if (pick.load === 'A') used.add(pickOf(LIVE)); if (pick.load === 'Q') used.add(pickOf(BLANK));
    hand = hand.filter((c) => !used.has(c)); while (hand.length < 8 && deck.length) hand.push(deck.shift());
    if (gold <= 0) return { win: true, round: round + 1 };
    if (round === 3) S.nearMiss += gold <= cfg.devilGold * 0.25 ? 1 : 0;
    if (hp <= 0) return { win: false, why: 'hp' };
  }
  return { win: false, why: 'time' };
}
const POL = {
  '总装A(不管胜率)': { fixed: 'A', useGun: true, dig: true, lambda: 0 },
  '总装Q(只求保命)': { fixed: 'Q', useGun: true, dig: true, lambda: 0 },
  '不装弹': { fixed: 'none', useGun: true, dig: false, lambda: 0 },
  '算胜率·激进 λ=0.3': { useGun: true, dig: true, lambda: 0.3 },
  '算胜率·均衡 λ=0.8': { useGun: true, dig: true, lambda: 0.8 },
  '算胜率·保守 λ=2': { useGun: true, dig: true, lambda: 2 },
};
if (false) {
  const N = +process.argv[2] || 2000;
  for (const cfg of [{ name: '恶魔金币 150, 你 2 血', devilGold: 150, hp: 2, m: 1, devilMult: 1 }, { name: '恶魔金币 250, 你 2 血', devilGold: 250, hp: 2, m: 1, devilMult: 1 }, { name: '恶魔金币 250, 你 3 血', devilGold: 250, hp: 3, m: 1, devilMult: 1 }]) {
    console.log(`\n== ${cfg.name} (单关 4 轮) ==`);
    console.log('策略'.padEnd(16), '过关率  耗尽血量  超时  平均每关开枪  你开枪占比  装A/装Q/空 占比');
    for (const [n, p] of Object.entries(POL)) {
      const rng = mul(31); const S = { rounds: 0, shots: 0, youShoot: 0, devilShoots: 0, hits: 0, hpLost: 0, gunUsed: 0, loadA: 0, loadQ: 0, loadnone: 0 };
      let w = 0, hpd = 0, to = 0;
      for (let i = 0; i < N; i++) { const r = playBlind(p, rng, cfg, S); if (r.win) w++; else if (r.why === 'hp') hpd++; else to++; }
      const R = S.rounds;
      console.log(n.padEnd(12), `${(w / N * 100).toFixed(0)}%`.padStart(5), `${(hpd / N * 100).toFixed(0)}%`.padStart(8), `${(to / N * 100).toFixed(0)}%`.padStart(6), (S.shots / N).toFixed(1).padStart(9), `${(S.youShoot / R * 100).toFixed(0)}%`.padStart(9), `   ${(S.loadA / R * 100).toFixed(0)}/${(S.loadQ / R * 100).toFixed(0)}/${(S.loadnone / R * 100).toFixed(0)}`);
    }
  }
}
