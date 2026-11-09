// World Juniors forecast: team ratings, a win probability and projected score for every game, and a full-tournament
// simulation (round robin, quarterfinals, semifinals, medals, relegation) with a mock bracket.
//
// Ratings = our prior (recent results and public roster projections, config/wjc/ratings.json) blended with the strength of
// each team's projected lineup. A game is two Poisson goal counts with rates set by the rating gap; regulation ties go to
// overtime and a shootout, which favours the better team only a little.
import fs from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "./paths.mjs";

const readJson = async (f, fb) => { try { return JSON.parse(await fs.readFile(f, "utf8")); } catch { return fb; } };
const C_GAP = 0.2;   // how fast scoring rates move with the rating gap
const TIE_BOOST = 0.08;

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function poisson(l, r) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }
const pmf = (l, n = 16) => { const o = [Math.exp(-l)]; for (let k = 1; k <= n; k++) o.push((o[k - 1] * l) / k); return o; };

/** Expected goals for each side of a game, from the two ratings. */
export function rates(ra, rb, T = 5.8) { const d = ra - rb; return [(T / 2) * Math.exp(C_GAP * d), (T / 2) * Math.exp(-C_GAP * d)]; }

/** Probabilities for one game: win chance for A (overtime included), overtime chance, and the most likely scores. */
export function gameProb(ra, rb, { T = 5.8 } = {}) {
  const [la, lb] = rates(ra, rb, T), pa = pmf(la), pb = pmf(lb);
  let win = 0, tie = 0, loss = 0; const grid = [];
  for (let i = 0; i < pa.length; i++) for (let j = 0; j < pb.length; j++) {
    const p = pa[i] * pb[j]; grid.push([i, j, p]);
    if (i > j) win += p; else if (i < j) loss += p; else tie += p;
  }
  const s = win + tie + loss; win /= s; tie /= s; loss /= s;
  const t2 = Math.min(0.5, tie * (1 + TIE_BOOST)), k = (1 - t2) / (1 - tie); win *= k; loss *= k;
  const otA = 0.5 + 0.25 * (la / (la + lb) - 0.5); // overtime and shootouts are close to coin flips
  grid.sort((x, y) => y[2] - x[2]);
  return { win: win + t2 * otA, regWin: win, regLoss: loss, ot: t2, otA, la, lb, top: grid.slice(0, 3).map(([a, b, p]) => ({ a, b, p })) };
}

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

const IS_GROUP = (g) => /^Group/.test(g.round);

/** Full forecast: per-game probabilities, tournament odds, mock bracket. */
export async function forecast(wjc, { sims = 20000, seed = 20261226 } = {}) {
  const cfg = wjc.cfg, R = await ratings(wjc), T = R.T;
  const resFile = await readJson(path.join(CONFIG, "wjc", "results.json"), { results: {} });
  const results = resFile.results ?? {};
  const rt = (c) => R.teams[c].rating;
  const codes = cfg.teams.map((t) => t.code), grp = Object.fromEntries(cfg.teams.map((t) => [t.code, t.group]));
  const groups = { A: codes.filter((c) => grp[c] === "A"), B: codes.filter((c) => grp[c] === "B") };
  const gGames = cfg.schedule.filter(IS_GROUP);

  // ----- per-game probabilities (group games; playoff games are TBD until the bracket is set)
  const games = {};
  for (const g of gGames) {
    const p = gameProb(rt(g.a), rt(g.b), { T });
    games[g.n] = { n: g.n, a: g.a, b: g.b, pa: +p.win.toFixed(4), pb: +(1 - p.win).toFixed(4), ot: +p.ot.toFixed(3), la: +p.la.toFixed(2), lb: +p.lb.toFixed(2),
      top: p.top.map((x) => ({ a: x.a, b: x.b, p: +x.p.toFixed(3) })), regWinA: +p.regWin.toFixed(3), regWinB: +p.regLoss.toFixed(3), result: results[g.n] ?? null };
  }

  // ----- simulation
  const r = rng(seed);
  const z = () => ({ pts: 0, gf: 0, ga: 0, gp: 0 });
  const acc = Object.fromEntries(codes.map((c) => [c, { rank: [0, 0, 0, 0, 0], pts: 0, qf: 0, sf: 0, final: 0, gold: 0, silver: 0, bronze: 0, fourth: 0, rel: 0 }]));
  // Quarterfinal pairings (1st of one group against 4th of the other, and so on). The schedule doesn't say which game is which.
  const qfSlots = [{ n: 22, a: ["A", 1], b: ["B", 4] }, { n: 23, a: ["B", 2], b: ["A", 3] }, { n: 24, a: ["B", 1], b: ["A", 4] }, { n: 25, a: ["A", 2], b: ["B", 3] }];
  const slotSeen = {};
  const note = (slot, a, b) => { const k = `${a}-${b}`; const m = (slotSeen[slot] ??= {}); m[k] = (m[k] ?? 0) + 1; };
  const cache = new Map();
  const pWin = (a, b) => { const k = `${a}|${b}`; let v = cache.get(k); if (v == null) { v = gameProb(rt(a), rt(b), { T }).win; cache.set(k, v); } return v; };

  for (let s = 0; s < sims; s++) {
    const st = Object.fromEntries(codes.map((c) => [c, z()]));
    for (const g of gGames) {
      const res = results[g.n];
      let ga, gb, ot = null;
      if (res) { ga = res.a; gb = res.b; ot = res.ot ?? null; }
      else {
        const [la, lb] = rates(rt(g.a), rt(g.b), T);
        ga = poisson(la, r); gb = poisson(lb, r);
        if (ga === gb) { ot = "OT"; if (r() < 0.5 + 0.25 * (la / (la + lb) - 0.5)) ga++; else gb++; }
      }
      const A = st[g.a], B = st[g.b]; A.gp++; B.gp++; A.gf += ga; A.ga += gb; B.gf += gb; B.ga += ga;
      const aw = ga > gb;
      if (ot) { (aw ? A : B).pts += 2; (aw ? B : A).pts += 1; } else (aw ? A : B).pts += 3;
    }
    const order = {};
    for (const G of ["A", "B"]) {
      const tb = Object.fromEntries(groups[G].map((c) => [c, r()]));
      order[G] = [...groups[G]].sort((x, y) => st[y].pts - st[x].pts || (st[y].gf - st[y].ga) - (st[x].gf - st[x].ga) || st[y].gf - st[x].gf || tb[y] - tb[x]);
      order[G].forEach((c, i) => { acc[c].rank[i]++; acc[c].pts += st[c].pts; });
    }
    { const a = order.A[4], b = order.B[4]; acc[r() < pWin(a, b) ? b : a].rel++; } // fifth-place teams play once; the loser goes down
    const at = (G, i) => order[G][i - 1];
    const qf = qfSlots.map((q) => [at(...q.a), at(...q.b)]);
    qf.forEach(([a, b], i) => { acc[a].qf++; acc[b].qf++; note(`QF${i + 1}`, a, b); });
    const w = qf.map(([a, b]) => (r() < pWin(a, b) ? a : b));
    const sfPairs = [[w[0], w[1]], [w[2], w[3]]];
    sfPairs.forEach(([a, b], i) => { acc[a].sf++; acc[b].sf++; note(`SF${i + 1}`, a, b); });
    const sw = sfPairs.map(([a, b]) => (r() < pWin(a, b) ? a : b)), sl = sfPairs.map(([a, b], i) => (sw[i] === a ? b : a));
    acc[sw[0]].final++; acc[sw[1]].final++; note("Final", sw[0], sw[1]);
    const gold = r() < pWin(sw[0], sw[1]) ? sw[0] : sw[1]; acc[gold].gold++; acc[gold === sw[0] ? sw[1] : sw[0]].silver++;
    const bronze = r() < pWin(sl[0], sl[1]) ? sl[0] : sl[1]; acc[bronze].bronze++; acc[bronze === sl[0] ? sl[1] : sl[0]].fourth++;
    note("Bronze", sl[0], sl[1]);
  }

  const odds = {};
  for (const c of codes) {
    const a = acc[c];
    odds[c] = { code: c, group: grp[c], rating: R.teams[c].rating, prior: R.teams[c].prior, roster: R.teams[c].roster, complete: R.teams[c].complete, parts: R.teams[c].parts,
      pts: +(a.pts / sims).toFixed(2), rank: a.rank.map((x) => +(x / sims).toFixed(4)), winGroup: a.rank[0] / sims, qf: a.qf / sims, sf: a.sf / sims, final: a.final / sims,
      gold: a.gold / sims, silver: a.silver / sims, bronze: a.bronze / sims, medal: (a.gold + a.silver + a.bronze) / sims, rel: a.rel / sims, top2: (a.rank[0] + a.rank[1]) / sims };
  }

  // ----- mock bracket: seed each group by expected finish, then take the favourite in every game
  const seedOrder = (G) => [...groups[G]].sort((x, y) => odds[y].pts - odds[x].pts || odds[y].rating - odds[x].rating);
  const SO = { A: seedOrder("A"), B: seedOrder("B") };
  const get = ([G, i]) => SO[G][i - 1];
  const mk = (n, label, a, b) => { const p = pWin(a, b), pr = gameProb(rt(a), rt(b), { T }); return { n, label, a, b, pa: +p.toFixed(3), win: p >= 0.5 ? a : b, la: +pr.la.toFixed(1), lb: +pr.lb.toFixed(1) }; };
  const bQF = qfSlots.map((q, i) => mk(q.n, `Quarterfinal ${i + 1}`, get(q.a), get(q.b)));
  const bSF = [mk(26, "Semifinal 1", bQF[0].win, bQF[1].win), mk(27, "Semifinal 2", bQF[2].win, bQF[3].win)];
  const loser = (m) => (m.win === m.a ? m.b : m.a);
  const bBronze = mk(28, "Bronze medal", loser(bSF[0]), loser(bSF[1]));
  const bFinal = mk(29, "Gold medal", bSF[0].win, bSF[1].win);
  const bRel = mk(21, "Relegation", SO.A[4], SO.B[4]);
  const bracket = { seeds: SO, qf: bQF, sf: bSF, bronze: bBronze, final: bFinal, relegation: bRel, champion: bFinal.win, silver: loser(bFinal), bronzeWinner: bBronze.win };

  const slots = Object.fromEntries(Object.entries(slotSeen).map(([k, m]) => [k, Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([pair, n]) => ({ pair: pair.split("-"), p: +(n / sims).toFixed(3) }))]));

  return { sims, T, ratings: R.teams, odds, games, bracket, slots, groups, results, built: new Date().toISOString() };
}
