import { playBlind } from './gold-duel.mjs';
function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const POL = {
  '永远装实弹(莽)': { fixed: 'A', useGun: true, dig: true, lambda: 0 },
  '永远不装弹': { fixed: 'none', useGun: true, dig: true, lambda: 0 },
  '永远装空弹Q(怂)': { fixed: 'Q', useGun: true, dig: true, lambda: 0 },
  '经验法则: 胜率过半装实弹': { threshold: 0.5, useGun: true, dig: true },
  '经验法则: 胜率≥65%才装实弹': { threshold: 0.65, useGun: true, dig: true },
  '精算(期望值)': { useGun: true, dig: true, lambda: 0.5 },
};
const N = +process.argv[2] || 2000;
for (const cfg of [
  { name: '你的方案原样: 实弹=A, 空弹=Q', live: [14], blank: [12] },
  { name: '推荐: 实弹=A和K, 空弹=Q', live: [14, 13], blank: [12] },
]) {
  Object.assign(cfg, { devilGold: 175, hp: 3, m: 1, devilMult: 2.5, heal: 0 });
  console.log(`\n== ${cfg.name} · 每关 4 轮 · 你 3 点血 · 恶魔金币 175 ==`);
  console.log('策略'.padEnd(22), '过关率  被打死  超时(恶魔没破产)  你开枪的轮次  恶魔开枪的轮次');
  for (const [n, p] of Object.entries(POL)) {
    const rng = mul(77); const S = { rounds: 0, shots: 0, youShoot: 0, devilShoots: 0, hits: 0, hpLost: 0, gunUsed: 0, loadA: 0, loadQ: 0, loadnone: 0, nearMiss: 0 };
    let w = 0, d = 0, t = 0;
    for (let i = 0; i < N; i++) { const r = playBlind(p, rng, cfg, S); if (r.win) w++; else if (r.why === 'hp') d++; else t++; }
    console.log(n.padEnd(16), `${(w / N * 100).toFixed(0)}%`.padStart(5), `${(d / N * 100).toFixed(0)}%`.padStart(6), `${(t / N * 100).toFixed(0)}%`.padStart(10), `${(S.youShoot / S.rounds * 100).toFixed(0)}%`.padStart(12), `${(S.devilShoots / S.rounds * 100).toFixed(0)}%`.padStart(12));
  }
}
