import { playBlind } from './gold-duel.mjs';
function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const POL = {
  '莽：永远装实弹': { fixed: 'A', useGun: true, dig: true, lambda: 0 },
  '新手：从不装弹': { fixed: 'none', useGun: true, dig: false, lambda: 0 },
  '经验法则：胜率过半装实弹': { threshold: 0.5, useGun: true, dig: true },
  '精算': { useGun: true, dig: true, lambda: 0.5 },
};
const N = +process.argv[2] || 1500;
const BL = [['小盲 150 金币·亮3张', 150, 3], ['大盲 200 金币·亮3张', 200, 3], ['Boss 250 金币·亮2张', 250, 2]];
console.log('原型参数：实弹 A/K，空弹 Q，恶魔 ×2.5，每关 4 轮 3 血');
for (const [n, g, shown] of BL) {
  console.log(`\n== ${n} ==`); console.log('策略'.padEnd(20), '过关  被打死  超时');
  for (const [pn, p] of Object.entries(POL)) {
    const rng = mul(3); const S = { rounds: 0, shots: 0, youShoot: 0, devilShoots: 0, hits: 0, hpLost: 0, gunUsed: 0, loadA: 0, loadQ: 0, loadnone: 0, nearMiss: 0 };
    let w = 0, d = 0, t = 0;
    for (let i = 0; i < N; i++) { const r = playBlind(p, rng, { devilGold: g, hp: 3, m: 1, devilMult: 2.5, heal: 0, live: [14, 13], blank: [12], shown }, S); if (r.win) w++; else if (r.why === 'hp') d++; else t++; }
    console.log(pn.padEnd(14), `${(w / N * 100).toFixed(0)}%`.padStart(5), `${(d / N * 100).toFixed(0)}%`.padStart(6), `${(t / N * 100).toFixed(0)}%`.padStart(6));
  }
}
