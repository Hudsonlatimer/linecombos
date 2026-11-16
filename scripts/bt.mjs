// Backtest harness: node scripts/bt.mjs   (prints out-of-sample accuracy for each season; every game predicted from earlier games only)
import fs from "node:fs";
import { backtest, score, FIT } from "../src/lib/gamepredict.mjs";
import { seasonLog } from "../src/lib/gamelog.mjs";
import { DEFAULTS } from "../public/assets/winprob.js";

const ABBR = ["ANA","BOS","BUF","CAR","CBJ","CGY","CHI","COL","DAL","DET","EDM","FLA","LAK","MIN","MTL","NJD","NSH","NYI","NYR","OTT","PHI","PIT","SEA","SJS","STL","TBL","TOR","UTA","VAN","VGK","WPG","WSH"];
const cache = "scripts/.logs.json";
let L;
if (fs.existsSync(cache)) L = JSON.parse(fs.readFileSync(cache, "utf8"));
else {
  L = {};
  for (const s of [20232024, 20242025, 20252026, 20262027]) L[s] = await seasonLog(ABBR, s);
  fs.writeFileSync(cache, JSON.stringify(L));
}
for (const s of Object.keys(L)) L[s].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
export { L };
const seasons = [[20242025, 20232024], [20252026, 20242025], [20262027, 20252026]];
export function run(opts = {}, label = "") {
  const out = [];
  let all = [];
  for (const [s, p] of seasons) {
    const rows = backtest(L[p], L[s], opts);
    // skip the first 150 games of each season: ratings are mostly the prior then; report both
    const sc = score(rows), late = score(rows.slice(150));
    out.push(`${s}: n=${sc.n} acc=${(sc.acc * 100).toFixed(1)}% ll=${sc.logLoss.toFixed(4)} | after 150: acc=${(late.acc * 100).toFixed(1)}% ll=${late.logLoss.toFixed(4)}`);
    all = all.concat(rows);
  }
  const t = score(all);
  console.log(`${label || "run"}\n  ${out.join("\n  ")}\n  ALL n=${t.n} acc=${(t.acc * 100).toFixed(2)}% ll=${t.logLoss.toFixed(4)} brier=${t.brier.toFixed(4)}`);
  return t;
}
if (process.argv[1].endsWith("bt.mjs")) run({}, "baseline");
