// World Juniors forecast (build side): ratings from our prior and each team's projected lineup, results from Wikipedia and
// config/wjc/results.json, then the shared simulation in public/assets/wjcsim.js (the browser runs the same code live).
import fs from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "./paths.mjs";
import { get } from "./http.mjs";
import { gameProb, rates, simulate, parseWiki, matchResults } from "../../public/assets/wjcsim.js";

export { gameProb, rates };
const readJson = async (f, fb) => { try { return JSON.parse(await fs.readFile(f, "utf8")); } catch { return fb; } };
export const WIKI_PAGE = "2027_World_Junior_Ice_Hockey_Championships";
export const WIKI_URL = `https://en.wikipedia.org/w/api.php?action=parse&page=${WIKI_PAGE}&prop=wikitext&format=json&formatversion=2`;

/** Roster strength index from a team's projected lineup (forwards, defence, goalie). */
function rosterIndex(t) {
  const P = t.pool, avg = (ids) => (ids.length ? ids.reduce((s, id) => s + (P[id]?.score ?? 0), 0) / ids.length : 0);
  const F = t.projection.lines.flat(), D = t.projection.pairs.flat(), G = t.projection.goalies[0];
  const parts = { F: avg(F), D: avg(D), G: P[G]?.score ?? 0, nF: F.length, nD: D.length };
  // Missing lines mean a thin pool, not a bad team: weight what we have, and say how complete it is.
  const complete = Math.min(1, (parts.nF + parts.nD * 1.5 + (G ? 3 : 0)) / (12 + 9 + 3));
  return { ...parts, index: 0.5 * parts.F + 0.25 * parts.D + 0.25 * Math.min(parts.G * 1.6, 1), complete };
}

export async function ratings(wjc) {
  const cfgR = await readJson(path.join(CONFIG, "wjc", "ratings.json"), { priors: {}, rosterWeight: 0.4, goalsPerGame: 5.8 });
  const out = {}, codes = wjc.cfg.teams.map((t) => t.code);
  const R = Object.fromEntries(codes.map((c) => [c, rosterIndex(wjc.teams[c])]));
  const mean = codes.reduce((s, c) => s + R[c].index, 0) / codes.length;
  const sd = Math.sqrt(codes.reduce((s, c) => s + (R[c].index - mean) ** 2, 0) / codes.length) || 1;
  const pm = codes.reduce((s, c) => s + (cfgR.priors[c] ?? 0), 0) / codes.length;
  for (const c of codes) {
    const prior = (cfgR.priors[c] ?? 0) - pm, z = (R[c].index - mean) / sd;
    // The lineup moves the rating by up to about a goal a game, less when we know little of it.
    const adj = cfgR.rosterWeight * z * 0.9 * R[c].complete;
    out[c] = { prior: +prior.toFixed(2), roster: +adj.toFixed(2), rating: +(prior + adj).toFixed(3), complete: +R[c].complete.toFixed(2), parts: { F: +R[c].F.toFixed(2), D: +R[c].D.toFixed(2), G: +R[c].G.toFixed(2) } };
  }
  return { teams: out, T: cfgR.goalsPerGame ?? 5.8 };
}

/** Finished games: Wikipedia's tournament page first, then config/wjc/results.json (which wins if both have a game). */
export async function loadResults(cfg) {
  const valid = new Set(cfg.teams.map((t) => t.code));
  let parsed = [], source = null;
  try {
    const j = await get(WIKI_URL, { ttl: 300 });
    const wt = j?.parse?.wikitext ?? "";
    parsed = parseWiki(wt, valid);
    source = { name: "Wikipedia", url: `https://en.wikipedia.org/wiki/${WIKI_PAGE}`, games: parsed.length };
  } catch {}
  const m = matchResults(parsed, cfg.schedule);
  const manual = (await readJson(path.join(CONFIG, "wjc", "results.json"), { results: {} })).results ?? {};
  for (const [n, r] of Object.entries(manual)) m.results[n] = r;
  return { ...m, source };
}

/** Full forecast: per-game probabilities, tournament odds, mock bracket. */
export async function forecast(wjc, { sims = 20000 } = {}) {
  const R = await ratings(wjc), cfg = wjc.cfg;
  const res = await loadResults(cfg);
  const ratingOf = Object.fromEntries(Object.entries(R.teams).map(([c, v]) => [c, v.rating]));
  const sim = simulate({ teams: cfg.teams, schedule: cfg.schedule, ratings: ratingOf, results: res.results, playoffResults: res.playoffResults, T: R.T, sims });
  for (const c of Object.keys(sim.odds)) Object.assign(sim.odds[c], { prior: R.teams[c].prior, roster: R.teams[c].roster, complete: R.teams[c].complete, parts: R.teams[c].parts });
  return { ...sim, ratings: R.teams, results: res.results, playoffResults: res.playoffResults, resultsSource: res.source, built: new Date().toISOString() };
}
