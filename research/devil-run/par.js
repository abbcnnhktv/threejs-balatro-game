// run the simulator on all cores: node par.js <runsPerTier>; env CFG=json overrides CONFIG, POLICY=dud|live, TIERS=a,b
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');
if (isMainThread) {
  const N = +process.argv[2] || 400, base = process.argv[3] || '';
  const tiers = [['novice', N], ['average', N], ['expert', N]].filter(([t]) => !process.env.TIERS || process.env.TIERS.split(',').includes(t));
  const cores = os.cpus().length;
  const jobs = [];
  for (const [tier, n] of tiers) { const per = Math.ceil(n / cores); for (let k = 0; k < cores; k++) jobs.push({ tier, n: per, seed: 1000 * k + tier.length, base }); }
  const t0 = Date.now();
  Promise.all(jobs.map((j) => new Promise((res, rej) => { const w = new Worker(__filename, { workerData: j }); w.on('message', res); w.on('error', rej); }))).then((outs) => {
    const DL = require('./logic.js'); if (process.env.CFG) Object.assign(DL.CONFIG, JSON.parse(process.env.CFG)); 
    const { report } = require('./sim.js');
    const merged = {};
    outs.forEach((o, i) => { const t = jobs[i].tier; merged[t] = merged[t] || { runs: [], S: null }; merged[t].runs.push(...o.runs); if (!merged[t].S) merged[t].S = o.S; else for (const k of Object.keys(o.S)) { if (typeof o.S[k] === 'number') merged[t].S[k] += o.S[k]; else if (Array.isArray(o.S[k])) merged[t].S[k].push(...o.S[k]); else for (const kk of Object.keys(o.S[k])) merged[t].S[k][kk] += o.S[k][kk]; } });
    const out = {};
    for (const t of Object.keys(merged)) out[t] = report(t, merged[t]);
    require('fs').writeFileSync(process.env.OUT || 'last-sim.json', JSON.stringify(out));
    console.log('target', DL.CONFIG.target.join(','), 'devilPower', DL.CONFIG.devilPower.join(','), `runs/tier ${Object.values(merged)[0].runs.length}`, `(${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    for (const r of Object.values(out)) {
      console.log(`${r.label.padEnd(8)} 击败最终Boss ${(r.finalWin * 100).toFixed(0).padStart(3)}%  活着离开 ${(r.win * 100).toFixed(0).padStart(3)}%  死亡(底注1-8) ${r.deathByAnte.map((x) => (x * 100).toFixed(0)).join('/')}  差一点 ${(r.nearMiss * 100).toFixed(0)}%  杀恶魔/局 ${r.kills.toFixed(2)}  你开枪 ${r.youShots.toFixed(2)} 恶魔开枪 ${r.devilShots.toFixed(2)} 恶魔平均命中率 ${(r.avgDevilP * 100).toFixed(0)}% 你平均命中率 ${(r.avgYouP * 100).toFixed(0)}%`);
      console.log(`   装实弹率 你 ${(r.youLiveRate * 100).toFixed(0)}% 恶魔 ${(r.devilLiveRate * 100).toFixed(0)}%  死亡率 ${(r.deaths * 100).toFixed(0)}%  其中枪里有你自己实弹的 ${(r.ownLiveDeaths * 100).toFixed(0)}%`);
      console.log('   过关率 小/大/Boss: ' + [1, 2, 3, 4, 5, 6, 7, 8].map((a) => [0, 1, 2].map((i) => { const p = r.pass[`${a}-${i}`]; return p ? Math.round(p[0] / p[1] * 100) : '-'; }).join('/')).join('  '));
      console.log(`   原版规则(第一次失败即结束) 通关 ${(r.classicWin * 100).toFixed(0)}%  首败分布 ${r.classicDeath.map((x) => (x * 100).toFixed(0)).join('/')}  关卡数 ${r.avgBlinds.toFixed(1)}`);
      console.log(`   每关回合 ${r.turnsPerBlind.toFixed(1)}  你赢回合比例 ${(r.turnWinRate * 100).toFixed(0)}%  险胜(赢时恶魔已过75%) ${(r.closeWin * 100).toFixed(0)}%  惜败(输时你已过75%) ${(r.nearMiss * 100).toFixed(0)}%`);
      console.log('   分数/目标 中位数: ' + Object.entries(r.medRatio).map(([a, v]) => `${a}:${v.toFixed(2)}`).join(' '));
    }
  });
} else {
  const DL = require('./logic.js'); if (process.env.CFG) Object.assign(DL.CONFIG, JSON.parse(process.env.CFG)); 
  const { runTier } = require('./sim.js');
  const o = runTier(workerData.tier, workerData.n, workerData.seed);
  parentPort.postMessage({ runs: o.runs.map((r) => ({ ante: r.ante, died: r.died, kills: r.kills, blinds: r.blinds, finalWin: r.finalWin })), S: o.S });
}
