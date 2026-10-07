import { run, STRATS } from './sim.mjs';
function mul(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const N = +process.argv[2] || 700;
const names = Object.keys(STRATS);
console.log('没过关中弹 | 命 | 开枪耗出牌 | 掉落 | ' + names.map((n) => n.split(' ')[0]).join('      '));
for (const penalty of [3]) for (const lives of [2]) for (const shotCost of [0, 1]) for (const drop of [0.4, 0.6, 0.8]) {
  const row = names.map((n) => { const rng = mul(5); const S = { fails: 0, failHits: 0, shots: 0, hits: 0, loads: 0, desperate: 0, desperateHits: 0 }; let w = 0; for (let i = 0; i < N; i++) if (run(STRATS[n], rng, S, { lives, drop, shop: 0.4, startBullets: 1, penalty, shotCost, capB: 5 }).win) w++; return (w / N * 100).toFixed(1).padStart(5) + '%'; });
  console.log(`${penalty}/6`.padEnd(10), String(lives).padEnd(3), String(shotCost).padEnd(10), String(drop).padEnd(5), row.join('  '));
}
