// Monte Carlo of full 8-ante runs for 恶魔赌局, using the exact same rules file as the demo.
// usage: node sim.js [runsPerTier] [anteBase comma list]
const DL = require('./logic.js');

function mulberry(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// all subsets of up to 5 cards (indices), precomputed per hand size
const SUBS = {};
function subsets(n) {
  if (SUBS[n]) return SUBS[n];
  const out = [];
  for (let m = 1; m < 1 << n; m++) { let c = 0; for (let i = 0; i < n; i++) if (m & (1 << i)) c++; if (c <= 5) out.push(m); }
  return (SUBS[n] = out);
}
const PREP = new WeakMap();
function prep(hand) {
  let e = PREP.get(hand);
  if (e) return e;
  e = [];
  for (const m of subsets(hand.length)) {
    const played = [], held = [];
    for (let i = 0; i < hand.length; i++) (m & (1 << i) ? played : held).push(hand[i]);
    e.push({ played, held, an: DL.analyze(played) });
  }
  PREP.set(hand, e);
  return e;
}
function bestPlay(run, hand, boss) {
  let best = null;
  for (const x of prep(hand)) {
    const s = DL.score(run, x.played, x.held, boss, true, x.an);
    if (!best || s.total > best.total || (s.total === best.total && x.played.length < best.played.length)) { s.played = x.played; best = s; }
  }
  return best;
}

// static joker values (rough mult-equivalent), used by the average player
const STATIC = { joker: 4, greedy: 4, lusty: 4, wrath: 4, glutton: 4, jolly: 5, zany: 3, mad: 4, crazy: 2, droll: 3, sly: 3, duo: 9, trio: 5, family: 5, fib: 7, scary: 4, even: 5, odd: 4, abstract: 6, half: 4, green: 6, nova: 6, constel: 7, banana: 12, bull: 4, gold: 3 };

// expert: value = average best-hand score over sample hands
function sampleValue(run, jokers, rng, samples) {
  const save = run.jokers; run.jokers = jokers;
  let tot = 0;
  for (const h of samples) tot += bestPlay(run, h, null).total;
  run.jokers = save;
  return tot / samples.length;
}
function makeSamples(rng, n) { const out = []; for (let i = 0; i < n; i++) out.push(DL.shuffle(DL.makeDeck(), rng).slice(0, 8)); return out; }

function mainHand(run) { return DL.HAND_ORDER.reduce((a, h) => (run.plays[h] > run.plays[a] ? h : a), 'pair'); }

function shop(run, tier, rng, S) {
  let items = DL.rollShop(run, rng);
  let rerolls = 0;
  const samples = tier === 'expert' ? makeSamples(rng, 8) : null;
  for (let pass = 0; pass < 2; pass++) {
    for (const it of items) {
      if (it.bought) continue;
      if (it.kind === 'planet') {
        const want = tier === 'novice' ? rng() < 0.4 : it.hand === mainHand(run) || (tier === 'average' && rng() < 0.15);
        const keep = tier === 'expert' ? 20 : 0;
        if (want && run.money - it.cost >= keep && DL.buy(run, it)) { it.bought = true; S.planets++; }
        continue;
      }
      if (tier === 'novice') {
        if (run.jokers.length < DL.CONFIG.jokerSlots && rng() < 0.7 && DL.buy(run, it)) { it.bought = true; S.jokersBought++; }
        continue;
      }
      if (tier === 'average') {
        if (run.jokers.length >= DL.CONFIG.jokerSlots) {
          const worst = run.jokers.reduce((a, j) => (STATIC[j] < STATIC[a] ? j : a), run.jokers[0]);
          if (STATIC[it.id] > STATIC[worst] + 2 && run.money + DL.sellValue(worst) >= it.cost) { run.money += DL.sellValue(worst); run.jokers.splice(run.jokers.indexOf(worst), 1); }
        }
        if (run.jokers.length < DL.CONFIG.jokerSlots && DL.buy(run, it)) { it.bought = true; S.jokersBought++; }
        continue;
      }
      // expert: buy if it raises the sampled score enough for its price, keep interest money when the gain is small
      const base = sampleValue(run, run.jokers, rng, samples);
      let cand = run.jokers.concat(it.id), sold = null;
      if (run.jokers.length >= DL.CONFIG.jokerSlots) {
        let bestDrop = null, bestV = -1;
        for (const j of run.jokers) { const v = sampleValue(run, run.jokers.filter((x) => x !== j).concat(it.id), rng, samples); if (v > bestV) { bestV = v; bestDrop = j; } }
        cand = run.jokers.filter((x) => x !== bestDrop).concat(it.id); sold = bestDrop;
      }
      const gain = sampleValue(run, cand, rng, samples) / Math.max(1, base) - 1;
      const reserve = gain > 0.35 ? 0 : 20;
      const money = run.money + (sold ? DL.sellValue(sold) : 0);
      if (gain > 0.08 && money - it.cost >= reserve) {
        if (sold) { run.money += DL.sellValue(sold); run.jokers.splice(run.jokers.indexOf(sold), 1); }
        if (DL.buy(run, it)) { it.bought = true; S.jokersBought++; }
      }
    }
    if (tier === 'expert' && run.money >= 32 && rerolls < 1) { run.money -= DL.CONFIG.rerollBase; rerolls++; items = DL.rollShop(run, rng); continue; }
    break;
  }
}

function playBlind(run, tier, rng, S) {
  const b = DL.startBlind(run, rng);
  DL.draw(b);
  let maxHand = 0;
  while (b.hands > 0 && b.score < b.target) {
    const bp = bestPlay(run, b.hand, b.boss);
    const need = b.target - b.score;
    const behind = bp.total * b.hands < need;
    if (tier !== 'novice' && b.discards > 0 && behind && b.deck.length) {
      // keep the best hand's cards; experts also chase a 4-card flush
      let keep = new Set(bp.played);
      if (tier === 'expert') {
        const bySuit = {}; for (const c of b.hand) (bySuit[c.s] = bySuit[c.s] || []).push(c);
        const big = Object.values(bySuit).sort((a, c) => c.length - a.length)[0];
        if (big.length >= 4 && bp.type !== 'flush' && bp.total * 2.2 < need) keep = new Set(big);
      }
      const toss = b.hand.filter((c) => !keep.has(c)).sort((a, c) => a.r - c.r).slice(0, 5);
      if (toss.length) {
        b.hand = b.hand.filter((c) => !toss.includes(c)); b.discards--; DL.noteDiscard(run); DL.draw(b); S.discards++;
        continue;
      }
    }
    b.score += bp.total; maxHand = Math.max(maxHand, bp.total);
    DL.notePlayed(run, bp.type); b.hands--; S.hands++;
    b.hand = b.hand.filter((c) => !bp.played.includes(c)); DL.draw(b);
  }
  return { won: b.score >= b.target, ratio: b.score / b.target, target: b.target, maxHand, boss: b.boss };
}

function playRun(tier, rng, S) {
  const run = DL.newRun(rng);
  const R = { ante: 1, died: false, kills: 0, blinds: [], finalWin: false };
  while (true) {
    const res = playBlind(run, tier, rng, S);
    R.blinds.push({ ante: run.ante, idx: run.blind, won: res.won, ratio: res.ratio });
    DL.loadBullet(run, res.won);
    if (run.ante === DL.CONFIG.antes && run.blind === 2 && res.won) R.finalWin = true;
    if (run.blind === 2) {
      const shot = DL.bossShot(run, res.won, rng);
      S.shots[shot.shooter]++; S.bulletsAtShot[shot.shooter] += shot.bullets[shot.shooter];
      if (shot.shooter === 'devil') { S.devilShotP.push(shot.p); if (shot.hit) { R.died = true; R.ante = run.ante; return R; } }
      else if (shot.hit) {
        R.kills++; S.kills++; run.money += DL.CONFIG.devilKillMoney;
        const drop = DL.devilDrop(run, rng);
        const pick = tier === 'novice' ? drop[0] : drop.reduce((a, j) => (STATIC[j] > STATIC[a] ? j : a), drop[0]);
        if (run.jokers.length < DL.CONFIG.jokerSlots) run.jokers.push(pick);
        else { const worst = run.jokers.reduce((a, j) => (STATIC[j] < STATIC[a] ? j : a), run.jokers[0]); if (STATIC[pick] > STATIC[worst]) run.jokers[run.jokers.indexOf(worst)] = pick; }
      }
    }
    DL.endBlindMoney(run, { idx: run.blind, hands: 0 }, false); // interest (+ blind reward added below)
    if (res.won) run.money += DL.CONFIG.blindReward[run.blind];
    if (DL.advance(run, rng) === 'victory') { R.ante = 9; return R; }
    shop(run, tier, rng, S);
    R.ante = run.ante;
  }
}

function runTier(tier, n, seed) {
  const rng = mulberry(seed);
  const S = { hands: 0, discards: 0, planets: 0, jokersBought: 0, kills: 0, shots: { you: 0, devil: 0 }, bulletsAtShot: { you: 0, devil: 0 }, devilShotP: [] };
  const runs = [];
  for (let i = 0; i < n; i++) runs.push(playRun(tier, rng, S));
  return { runs, S };
}

function report(label, out) {
  const { runs, S } = out, n = runs.length;
  const win = runs.filter((r) => r.ante === 9).length / n;
  const finalWin = runs.filter((r) => r.finalWin).length / n;
  const deathByAnte = Array(9).fill(0); runs.forEach((r) => { if (r.died) deathByAnte[r.ante]++; });
  const pass = {}; const near = { fail: 0, near: 0 }; const ratios = {};
  for (const r of runs) for (const b of r.blinds) {
    const k = `${b.ante}-${b.idx}`; (pass[k] = pass[k] || [0, 0]); pass[k][0] += b.won ? 1 : 0; pass[k][1]++;
    (ratios[b.ante] = ratios[b.ante] || []).push(b.ratio);
    if (!b.won) { near.fail++; if (b.ratio >= 0.75) near.near++; }
  }
  // classic Balatro rule for comparison: the run ends at the first failed blind
  const classicWin = runs.filter((r) => r.blinds.length === 24 && r.blinds.every((b) => b.won)).length / n;
  const firstFail = Array(9).fill(0); runs.forEach((r) => { const f = r.blinds.find((b) => !b.won); if (f) firstFail[f.ante]++; });
  const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  return { label, n, win, finalWin, classicWin, classicDeath: firstFail.slice(1).map((d) => d / n), deathByAnte: deathByAnte.slice(1).map((d) => d / n), pass, nearMiss: near.near / Math.max(1, near.fail), medRatio: Object.fromEntries(Object.entries(ratios).map(([a, v]) => [a, med(v)])), S, avgBlinds: runs.reduce((s, r) => s + r.blinds.length, 0) / n, kills: S.kills / n, youShots: S.shots.you / n, devilShots: S.shots.devil / n, avgDevilP: S.devilShotP.reduce((a, b) => a + b, 0) / Math.max(1, S.devilShotP.length), handsPerRun: S.hands / n, discardsPerRun: S.discards / n };
}

module.exports = { runTier, report, playRun };
if (require.main === module) {
  const N = +process.argv[2] || 300;
  if (process.argv[3]) DL.CONFIG.anteBase = process.argv[3].split(',').map(Number);
  const t0 = Date.now();
  const res = {};
  for (const [tier, n] of [['novice', N], ['average', N], ['expert', Math.max(50, Math.round(N / 2))]]) res[tier] = report(tier, runTier(tier, n, 7 + tier.length));
  console.log('anteBase', DL.CONFIG.anteBase.join(','), `(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  for (const r of Object.values(res)) {
    console.log(`${r.label.padEnd(8)} 通关 ${(r.win * 100).toFixed(0).padStart(3)}%  死亡分布(底注1-8) ${r.deathByAnte.map((x) => (x * 100).toFixed(0)).join('/')}  差一点 ${(r.nearMiss * 100).toFixed(0)}%  打死恶魔/局 ${r.kills.toFixed(2)}  你开枪/局 ${r.youShots.toFixed(2)} 恶魔开枪/局 ${r.devilShots.toFixed(2)} 平均中弹率 ${(r.avgDevilP * 100).toFixed(0)}%`);
    console.log('         每底注过关率(小/大/Boss): ' + [1, 2, 3, 4, 5, 6, 7, 8].map((a) => [0, 1, 2].map((i) => { const p = r.pass[`${a}-${i}`]; return p ? Math.round(p[0] / p[1] * 100) : '-'; }).join('/')).join('  '));
    console.log('         每底注 分数/目标 中位数: ' + Object.entries(r.medRatio).map(([a, v]) => `${a}:${v.toFixed(2)}`).join(' '));
  }
}
