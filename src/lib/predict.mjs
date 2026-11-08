// Stanley Cup predictor: rate every team, play out the rest of the season 10,000 times,
// seed the playoffs with the real NHL format, and play out every series.
import { get } from "./http.mjs";

const WEB = "https://api-web.nhle.com/v1";
export const HOME_EDGE = 1.045; // home teams score ~4.5% more, away ~4.5% less
export const SIMS = 10000;
const K = 35; // games of "prior" weight: early in a season the prior dominates

/** Last season's final standings: the prior for this season's ratings. */
async function lastSeason(seasonId) {
  const y = String(seasonId).slice(0, 4);
  const st = await get(`${WEB}/standings/${y}-04-20`, { ttl: Infinity });
  return Object.fromEntries((st?.standings ?? []).map((t) => [t.teamAbbrev.default, { gp: t.gamesPlayed, gf: t.goalFor, ga: t.goalAgainst }]));
}

export async function ratings(league) {
  const prev = await lastSeason(league.seasonId);
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const gpAll = sum(league.teams, (t) => t.gp) || 1;
  const lg = gpAll > 50 ? sum(league.teams, (t) => t.gf) / gpAll : 3.05; // goals per team-game
  const pv = Object.values(prev), pLg = pv.length ? sum(pv, (t) => t.gf) / sum(pv, (t) => t.gp) : lg;
  const out = {};
  for (const t of league.teams) {
    const p = prev[t.abbrev];
    // Prior: last season's rates, regressed halfway to average (rosters change).
    const pAtt = p ? 0.6 + 0.4 * (p.gf / p.gp / pLg) : 1, pDef = p ? 0.6 + 0.4 * (p.ga / p.gp / pLg) : 1;
    const att = (t.gf + K * pAtt * lg) / ((t.gp + K) * lg);
    const def = (t.ga + K * pDef * lg) / ((t.gp + K) * lg);
    out[t.abbrev] = { att: +att.toFixed(4), def: +def.toFixed(4) };
  }
  return { lg: +lg.toFixed(4), teams: out };
}

// Seeded RNG so a build's numbers are reproducible.
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r()); }
function poisson(l, r) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }

/** One game. Returns { homeWin, ot }. */
function playGame(R, home, away, r, playoff = false) {
  const h = R.teams[home], a = R.teams[away];
  const lh = R.lg * h.att * a.def * HOME_EDGE, la = (R.lg * a.att * h.def) / HOME_EDGE;
  const gh = poisson(lh, r), ga = poisson(la, r);
  if (gh !== ga) return { homeWin: gh > ga, ot: false };
  // OT/shootout: slightly favour the better team, otherwise close to a coin flip.
  const p = 0.5 + 0.5 * (lh / (lh + la) - 0.5) * (playoff ? 1 : 0.6);
  return { homeWin: r() < p, ot: true };
}

/** Best of 7, 2-2-1-1-1, high seed at home in games 1, 2, 5, 7. Returns the winner. */
function playSeries(R, hi, lo, r) {
  let w1 = 0, w2 = 0, g = 0;
  while (w1 < 4 && w2 < 4) {
    const hiHome = [0, 1, 4, 6].includes(g++);
    const res = hiHome ? playGame(R, hi, lo, r, true) : playGame(R, lo, hi, r, true);
    if (res.homeWin === hiHome) w1++; else w2++;
  }
  return w1 === 4 ? hi : lo;
}

/** NHL format: top 3 in each division + 2 wild cards per conference. */
export function seed(teams, pts, rw, tiebreak) {
  const byConf = {};
  for (const t of teams) (byConf[t.conf] ??= []).push(t);
  const cmp = (a, b) => pts[b.abbrev] - pts[a.abbrev] || rw[b.abbrev] - rw[a.abbrev] || tiebreak[b.abbrev] - tiebreak[a.abbrev];
  const out = {};
  for (const [conf, list] of Object.entries(byConf)) {
    const divs = {};
    for (const t of list) (divs[t.div] ??= []).push(t);
    const tops = Object.entries(divs).map(([div, l]) => ({ div, top: l.sort(cmp).slice(0, 3) }));
    const inTop = new Set(tops.flatMap((d) => d.top.map((t) => t.abbrev)));
    const wc = list.filter((t) => !inTop.has(t.abbrev)).sort(cmp).slice(0, 2);
    tops.sort((a, b) => cmp(a.top[0], b.top[0]));
    // Best division winner plays WC2, the other plays WC1.
    out[conf] = tops.map((d, i) => ({ div: d.div, d1: d.top[0].abbrev, d2: d.top[1].abbrev, d3: d.top[2].abbrev, wc: wc[i === 0 ? 1 : 0]?.abbrev }));
  }
  return out;
}

export function simulate({ league, schedules, R, sims = SIMS }) {
  const r = rng(20262027);
  const teams = league.teams;
  // Remaining regular-season games (deduplicated across both teams' schedules).
  const seen = new Set(), remaining = [];
  for (const list of Object.values(schedules)) for (const g of list) {
    if (g.gameType !== 2 || seen.has(g.id)) continue;
    seen.add(g.id);
    if (!["OFF", "FINAL"].includes(g.gameState)) remaining.push([g.homeTeam.abbrev, g.awayTeam.abbrev]);
  }
  const acc = Object.fromEntries(teams.map((t) => [t.abbrev, { pts: 0, ptsList: [], playoffs: 0, div: 0, pres: 0, r2: 0, cf: 0, final: 0, cup: 0 }]));
  for (let s = 0; s < sims; s++) {
    // We never know a team's true strength exactly: each simulated season draws its own ratings.
    const Rs = { lg: R.lg, teams: Object.fromEntries(Object.entries(R.teams).map(([k, v]) => [k, { att: v.att * Math.exp(0.04 * gauss(r)), def: v.def * Math.exp(0.04 * gauss(r)) }])) };
    const pts = {}, rw = {}, tb = {};
    for (const t of teams) { pts[t.abbrev] = t.pts; rw[t.abbrev] = t.rw ?? t.w; tb[t.abbrev] = r(); }
    for (const [h, a] of remaining) {
      const g = playGame(Rs, h, a, r);
      const win = g.homeWin ? h : a, lose = g.homeWin ? a : h;
      pts[win] += 2; if (g.ot) pts[lose] += 1; else rw[win]++;
    }
    for (const t of teams) { acc[t.abbrev].pts += pts[t.abbrev]; acc[t.abbrev].ptsList.push(pts[t.abbrev]); }
    let best = teams[0].abbrev;
    for (const t of teams) if (pts[t.abbrev] > pts[best]) best = t.abbrev;
    acc[best].pres++;
    const S = seed(teams, pts, rw, tb);
    const higher = (a, b) => (pts[a] > pts[b] || (pts[a] === pts[b] && rw[a] >= rw[b]) ? [a, b] : [b, a]);
    const series = (a, b) => playSeries(Rs, ...higher(a, b), r);
    const champs = [];
    for (const conf of Object.values(S)) {
      const sideWinners = [];
      for (const d of conf) {
        acc[d.d1].div++;
        for (const x of [d.d1, d.d2, d.d3, d.wc]) acc[x].playoffs++;
        const w1 = series(d.d1, d.wc), w2 = series(d.d2, d.d3);
        acc[w1].r2++; acc[w2].r2++;
        const w = series(w1, w2);
        acc[w].cf++;
        sideWinners.push(w);
      }
      const cw = series(sideWinners[0], sideWinners[1]);
      acc[cw].final++;
      champs.push(cw);
    }
    acc[series(champs[0], champs[1])].cup++;
  }
  const out = {};
  for (const t of teams) {
    const a = acc[t.abbrev], l = a.ptsList.sort((x, y) => x - y);
    out[t.abbrev] = {
      pts: +(a.pts / sims).toFixed(1), lo: l[Math.floor(sims * 0.1)], hi: l[Math.floor(sims * 0.9)],
      playoffs: a.playoffs / sims, div: a.div / sims, pres: a.pres / sims, r2: a.r2 / sims, cf: a.cf / sims, final: a.final / sims, cup: a.cup / sims,
    };
  }
  // Projected bracket: seed by average projected points.
  const P = Object.fromEntries(teams.map((t) => [t.abbrev, out[t.abbrev].pts]));
  const zero = Object.fromEntries(teams.map((t) => [t.abbrev, 0]));
  const bracket = seed(teams, P, zero, zero);
  return { odds: out, bracket, remaining: remaining.length, sims };
}

export async function predict(league, schedules) {
  const R = await ratings(league);
  return { R, ...simulate({ league, schedules, R }) };
}
