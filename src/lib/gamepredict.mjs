// Game predictor ratings. Each team gets an attack and a defence rating from this season's goals and shots,
// leaning on last season (regressed toward average) while the sample is small. Goaltending is taken out of the team's
// defence and put back per game for the actual starter, so a backup or a hot goalie moves the odds.
// The same rater runs game by game through the season for the backtest, so the published record is out-of-sample.
import { DEFAULTS, rates, predictGame } from "../../public/assets/winprob.js";
import { seasonLog } from "./gamelog.mjs";
import { seasonStats } from "./nhl.mjs";

// Fitted on 2024-25 and 2025-26 (every game predicted from earlier games only, the season before as the prior),
// then checked on 2026-27 to date. Recent form matters: each game counts 10% less than the one after it (d).
// K*: how many games of last season's (regressed) level each stat starts with. w*: blend of goals, shots and xG.
// d: each new game counts a little more than older ones. Kgx: a goalie's expected goals of league-average play
// before their own results count. gs: how much of the goalie edge to trust.
export const FIT = { K: 5, Ks: 0.25, Kx: 3, wG: 0.2, wS: 0.5, wX: 0.5, r: 0.9, d: 0.9, Kgx: 160, gs: 0.6, pw: 0.5, Kg: 1500,
  // Lineups: player value = production (xG, goals, assists) and ice time per game; cA/cD = how much a stronger or weaker
  // lineup than usual moves goals for/against. Kp = games of prior per player, mT = weight on ice time, dp = player recency.
  cA: 1.5, cD: 0, Kp: 20, mT: 0.25, dp: 0.9 };

const KEYS = ["gp", "gf", "ga", "sf", "sa", "xf", "xa"];
const z = () => Object.fromEntries(KEYS.map((k) => [k, 0]));

/** Season totals per team and goalie from a game log (seasonLog rows). */
function totals(log) {
  const T = {}, G = {}, GX = {}, PL = {};
  for (const g of log) {
    for (const r of [...(g.hP ?? []), ...(g.aP ?? [])]) { const q = (PL[r[0]] ??= { n: 0, prod: 0, toi: 0, d: r[1] }); q.n++; q.prod += prodOf(r); q.toi += r[2]; }
    const h = (T[g.home] ??= z()), a = (T[g.away] ??= z());
    h.gp++; a.gp++; h.gf += g.hg; h.ga += g.ag; a.gf += g.ag; a.ga += g.hg;
    h.sf += g.hs ?? 0; h.sa += g.as ?? 0; a.sf += g.as ?? 0; a.sa += g.hs ?? 0;
    h.xf += g.hx ?? 0; h.xa += g.ax ?? 0; a.xf += g.ax ?? 0; a.xa += g.hx ?? 0;
    for (const s of [g.hG, g.aG]) for (const x of s?.all ?? []) { const q = (G[x.id] ??= { sa: 0, ga: 0 }); q.sa += x.sa; q.ga += x.ga; }
    for (const [id, q] of Object.entries(g.gx ?? {})) { const o = (GX[id] ??= { xga: 0, ga: 0 }); o.xga += q.xga; o.ga += q.ga; }
  }
  return { T, G, GX, PL };
}

/** One player-game's production: half individual xG, half actual goals, plus primary and secondary assists. */
const prodOf = (r) => 0.5 * r[3] + 0.5 * r[4] + 0.6 * r[5] + 0.3 * r[6];

export function rater(prevLog = [], F = FIT) {
  const prev = totals(prevLog);
  const sum = (o, k) => Object.values(o).reduce((s, x) => s + x[k], 0);
  const pGp = sum(prev.T, "gp") || 1;
  const pLg = sum(prev.T, "gf") / pGp || 3.05, pLgS = sum(prev.T, "sf") / pGp || 28.5, pLgX = sum(prev.T, "xf") / pGp || 2.9;
  const pSv = 1 - sum(prev.G, "ga") / (sum(prev.G, "sa") || 1) || 0.9;
  const pRho = sum(prev.GX, "ga") / (sum(prev.GX, "xga") || 1) || 1;
  const prior = {};
  for (const [k, t] of Object.entries(prev.T)) prior[k] = {
    att: 1 + F.r * (t.gf / t.gp / pLg - 1), def: 1 + F.r * (t.ga / t.gp / pLg - 1),
    attS: 1 + F.r * (t.sf / t.gp / pLgS - 1), defS: 1 + F.r * (t.sa / t.gp / pLgS - 1),
    attX: t.xf ? 1 + F.r * (t.xf / t.gp / pLgX - 1) : 1, defX: t.xa ? 1 + F.r * (t.xa / t.gp / pLgX - 1) : 1,
  };
  if (!prior.UTA && prior.ARI) prior.UTA = prior.ARI; // Arizona moved to Utah in 2024
  // Average production and ice time per game by position (forward / defence), from last season.
  const avg = [0, 1].map((d) => { const ps = Object.values(prev.PL).filter((q) => q.d === d); const n = ps.reduce((s, q) => s + q.n, 0) || 1; return { prod: ps.reduce((s, q) => s + q.prod, 0) / n || (d ? 0.25 : 0.4), toi: ps.reduce((s, q) => s + q.toi, 0) / n || (d ? 1200 : 900) }; });
  const PL = {}, lineups = {};
  /** A skater's value relative to an average player at their position (1 = average). */
  function value(id, isD) {
    const c = PL[id] ?? { n: 0, prod: 0, toi: 0 }, p = prev.PL[id], A = avg[isD ? 1 : 0];
    const pP = p && p.n >= 10 ? 0.7 * (p.prod / p.n) + 0.3 * A.prod : A.prod * 0.8; // unknown players start a bit below average
    const pT = p && p.n >= 10 ? 0.7 * (p.toi / p.n) + 0.3 * A.toi : A.toi * 0.85;
    const rP = (c.prod + F.Kp * pP) / (c.n + F.Kp), rT = (c.toi + F.Kp * pT) / (c.n + F.Kp);
    return (1 - F.mT) * (rP / A.prod) + F.mT * (rT / A.toi);
  }
  const lineupVal = (list) => list.reduce((s, r) => s + value(r[0], r[1]), 0) / (list.length || 1);
  /** Tonight's lineup vs the team's recent lineups (valued with today's player values). 0 = their usual strength. */
  function lineupDelta(abbr, list) {
    const hist = lineups[abbr] ?? [];
    if (!list?.length || !hist.length) return 0;
    let w = 0, s = 0; hist.forEach((l, i) => { const k = F.d ** (hist.length - 1 - i); w += k; s += k * lineupVal(l); });
    return lineupVal(list) - s / w;
  }
  function addLineup(abbr, list) {
    if (!list?.length) return;
    (lineups[abbr] ??= []).push(list.map((r) => [r[0], r[1]]));
    if (lineups[abbr].length > 10) lineups[abbr].shift();
    for (const r of list) { const q = (PL[r[0]] ??= { n: 0, prod: 0, toi: 0 }); q.n = q.n * F.dp + 1; q.prod = q.prod * F.dp + prodOf(r); q.toi = q.toi * F.dp + r[2]; }
  }
  const cur = { T: {}, G: {}, GX: {}, gp: 0, gf: 0, sf: 0, xf: 0, sa: 0, ga: 0, gxa: 0, gga: 0 };

  function add(g) {
    const h = (cur.T[g.home] ??= z()), a = (cur.T[g.away] ??= z());
    // Older games fade a little with every new one.
    for (const t of [h, a]) for (const k of KEYS) t[k] *= F.d;
    h.gp++; a.gp++; h.gf += g.hg; h.ga += g.ag; a.gf += g.ag; a.ga += g.hg;
    cur.gp += 2; cur.gf += g.hg + g.ag;
    if (g.hs != null) { h.sf += g.hs; h.sa += g.as; a.sf += g.as; a.sa += g.hs; cur.sf += g.hs + g.as; }
    if (g.hx != null) { h.xf += g.hx; h.xa += g.ax; a.xf += g.ax; a.xa += g.hx; cur.xf += g.hx + g.ax; }
    for (const s of [g.hG, g.aG]) for (const x of s?.all ?? []) {
      const q = (cur.G[x.id] ??= { sa: 0, ga: 0, team: null }); q.sa += x.sa; q.ga += x.ga; cur.sa += x.sa; cur.ga += x.ga;
      q.team = s === g.hG ? g.home : g.away;
    }
    for (const [id, q] of Object.entries(g.gx ?? {})) {
      const o = (cur.GX[id] ??= { xga: 0, ga: 0, team: null }); o.xga += q.xga; o.ga += q.ga; cur.gxa += q.xga; cur.gga += q.ga;
      o.team = (g.hG?.all ?? []).some((x) => String(x.id) === id) ? g.home : g.away;
    }
  }

  const lgNow = () => (cur.gf + 400 * pLg) / (cur.gp + 400); // league scoring drifts; lean on last season early
  const lgS = () => (cur.sf + 400 * pLgS) / (cur.gp + 400);
  const lgX = () => (cur.xf + 400 * pLgX) / (cur.gp + 400);
  const rho = () => (cur.gga + 1000 * pRho) / (cur.gxa + 1000); // goals per xG league-wide (xG calibration drift)
  const svLg = () => 1 - (cur.ga + 20000 * (1 - pSv)) / (cur.sa + 20000);
  /** Regressed save % for a goalie (shown on the site). */
  function sv(id) {
    const c = cur.G[id] ?? { sa: 0, ga: 0 }, p = prev.G[id] ?? { sa: 0, ga: 0 }, L = svLg();
    const sa = c.sa + F.pw * p.sa, saves = c.sa - c.ga + F.pw * (p.sa - p.ga);
    return { sv: (saves + F.Kg * L) / (sa + F.Kg), shots: c.sa, gsax: gsax(id) };
  }
  /** Goals saved above expected this season (positive = better than an average goalie on the same shots). */
  function gsax(id) { const c = cur.GX[id]; return c ? c.xga * rho() - c.ga : 0; }
  /** Goalie factor: goals allowed per expected goal, this season plus half of last, pulled toward average. 1 = average. */
  function gFactor(id) {
    const c = cur.GX[id] ?? { xga: 0, ga: 0 }, p = prev.GX[id] ?? { xga: 0, ga: 0 }, R = rho();
    const ga = c.ga + F.pw * p.ga * (R / pRho), xga = c.xga + F.pw * p.xga;
    const raw = (ga + F.Kgx * R) / ((xga + F.Kgx) * R);
    return 1 + F.gs * (raw - 1);
  }
  /** The team's goaltending so far this season (weighted by expected goals faced), as a factor. */
  function teamG(abbr) {
    const gs = Object.entries(cur.GX).filter(([, q]) => q.team === abbr && q.xga > 0);
    const tot = gs.reduce((s, [, q]) => s + q.xga, 0);
    return tot ? gs.reduce((s, [id, q]) => s + gFactor(id) * q.xga, 0) / tot : 1;
  }

  function team(abbr) {
    const t = cur.T[abbr] ?? z(), p = prior[abbr] ?? { att: 1, def: 1, attS: 1, defS: 1, attX: 1, defX: 1 }, lg = lgNow(), ls = lgS(), lx = lgX();
    const attG = (t.gf + F.K * p.att * lg) / ((t.gp + F.K) * lg), defG = (t.ga + F.K * p.def * lg) / ((t.gp + F.K) * lg);
    const attS = (t.sf + F.Ks * p.attS * ls) / ((t.gp + F.Ks) * ls), defS = (t.sa + F.Ks * p.defS * ls) / ((t.gp + F.Ks) * ls);
    const attX = (t.xf + F.Kx * p.attX * lx) / ((t.gp + F.Kx) * lx), defX = (t.xa + F.Kx * p.defX * lx) / ((t.gp + F.Kx) * lx);
    const tg = teamG(abbr), W = F.wG + F.wS + F.wX;
    return {
      att: (F.wG * attG + F.wS * attS + F.wX * attX) / W, def: (F.wG * (defG / tg) + F.wS * defS + F.wX * defX) / W,
      attG, defG, attS, defS, attX, defX, teamG: tg, gp: cur.T[abbr] ? Math.round(sumGp(abbr)) : 0,
    };
  }
  const gpCount = {};
  const sumGp = (abbr) => gpCount[abbr] ?? 0;
  const add0 = add;
  function addCounted(g) { gpCount[g.home] = (gpCount[g.home] ?? 0) + 1; gpCount[g.away] = (gpCount[g.away] ?? 0) + 1; add0(g); addLineup(g.home, g.hP); addLineup(g.away, g.aP); }

  /** Rates for a matchup. hG/aG: starting goalie ids (null = the team's usual mix). */
  function matchup({ home, away, hG = null, aG = null, hB2b = false, aB2b = false, hLine = null, aLine = null }, P = DEFAULTS) {
    const H = { ...team(home) }, A = { ...team(away) };
    // Lineup: a stronger group than usual scores more and allows less.
    const hD = lineupDelta(home, hLine), aD = lineupDelta(away, aLine);
    H.lineup = hD; A.lineup = aD;
    H.att *= Math.exp(F.cA * hD); H.def *= Math.exp(-F.cD * hD); A.att *= Math.exp(F.cA * aD); A.def *= Math.exp(-F.cD * aD);
    const hg = hG ? gFactor(hG) : H.teamG, ag = aG ? gFactor(aG) : A.teamG;
    const r = { lg: lgNow(), home: { att: H.att, def: H.def, g: hg, b2b: hB2b }, away: { att: A.att, def: A.def, g: ag, b2b: aB2b } };
    return { ...rates(r, P), H, A, hg, ag, lg: r.lg, svLg: svLg() };
  }
  return { add: addCounted, team, matchup, sv, svLg, lgNow, gsax, value, lineupDelta, recent: (abbr) => lineups[abbr] ?? [] };
}

/** Play through a season's log game by game, predicting each from only the games before it. */
export function backtest(prevLog, log, { F = FIT, P = DEFAULTS, b2b = true } = {}) {
  const R = rater(prevLog, F);
  const lastDay = {};
  const out = [];
  const day = (d) => Date.parse(d + "T12:00:00Z") / 864e5;
  for (const g of log) {
    const hB2b = b2b && lastDay[g.home] === day(g.date) - 1, aB2b = b2b && lastDay[g.away] === day(g.date) - 1;
    const m = R.matchup({ home: g.home, away: g.away, hG: g.hG?.id, aG: g.aG?.id, hB2b, aB2b, hLine: g.hP, aLine: g.aP }, P);
    const p = predictGame(m.lh, m.la, { P });
    out.push({ id: g.id, date: g.date, home: g.home, away: g.away, p: p.home, homeWon: g.homeWon, hg: g.hg + (g.so && g.homeWon ? 1 : 0), ag: g.ag + (g.so && !g.homeWon ? 1 : 0), ot: g.ot || g.so, lh: m.lh, la: m.la });
    R.add(g);
    lastDay[g.home] = lastDay[g.away] = day(g.date);
  }
  return out;
}

export function score(rows) {
  const n = rows.length || 1;
  let ll = 0, br = 0, right = 0;
  for (const r of rows) {
    const p = Math.min(0.99, Math.max(0.01, r.p)), y = r.homeWon ? 1 : 0;
    ll -= y * Math.log(p) + (1 - y) * Math.log(1 - p);
    br += (p - y) ** 2;
    if ((p >= 0.5) === r.homeWon) right++;
  }
  return { n: rows.length, logLoss: ll / n, brier: br / n, acc: right / n };
}

// ---------- this week's games ----------

const pct = (x) => Math.round(x * 1000) / 10;

/**
 * Pre-game predictions for this week's games plus the season backtest.
 * Starting goalies: the confirmed/likely/projected starter for each team's next game (same as the rest of the site);
 * games further out use the team's usual goalie mix.
 */
export async function gamePredictions({ league, schedules, T, reported, stats, people, injuries = [] }) {
  const abbrs = league.teams.map((t) => t.abbrev);
  const prevId = league.seasonId - 10001;
  const [prevLog, log, prevStats] = await Promise.all([seasonLog(abbrs, prevId), seasonLog(abbrs, league.seasonId), seasonStats(prevId)]);
  const picks = backtest(prevLog, log);
  const R = rater(prevLog);
  for (const g of log) R.add(g);

  // Each team's game dates, for back-to-backs.
  const dates = {};
  for (const [abbr, list] of Object.entries(schedules)) dates[abbr] = new Set(list.map((g) => g.gameDate));
  const prevDay = (d) => new Date(Date.parse(d + "T12:00:00Z") - 864e5).toISOString().slice(0, 10);

  // Goal-scoring rates per skater: this season, leaning on last season (or a position average) early on.
  const prevSk = Object.fromEntries((prevStats.skaters ?? []).map((s) => [s.playerId, s]));
  const curSk = Object.fromEntries((stats.skaters ?? []).map((s) => [s.playerId, s]));
  function gpg(id) {
    const c = curSk[id], p = prevSk[id], pos = (c ?? p)?.positionCode ?? people[id]?.pos;
    const base = pos === "D" ? 0.06 : 0.16;
    const prior = p && p.gamesPlayed >= 15 ? 0.5 * (p.goals / p.gamesPlayed) + 0.5 * base : base;
    return ((c?.goals ?? 0) + 25 * prior) / ((c?.gamesPlayed ?? 0) + 25);
  }

  function starter(abbr, g) {
    const t = T[abbr];
    if (!t || t.next?.id !== g.id) return null;
    if (t.live?.goalie) return { id: t.live.goalie, status: "confirmed" };
    const rep = reported[abbr]?.goalie?.parsed.goalie;
    if (rep) return { id: rep, status: "confirmed" };
    if (t.goalies.projected) return { id: t.goalies.projected, status: t.goalies.reason === "likely" ? "likely" : "projected" };
    return null;
  }
  function dressed(abbr) {
    const L = reported[abbr]?.lines?.parsed, t = T[abbr];
    const ids = L ? [...L.lines.flat(), ...L.pairs.flat()] : [...(t?.last?.lines ?? []).flatMap((l) => l.ids), ...(t?.last?.pairs ?? []).flatMap((l) => l.ids)];
    return [...new Set(ids.filter((x) => typeof x === "number"))];
  }
  // Tonight's skaters for the predictor: the reported (or last game's) lineup, minus anyone on the injury list.
  const hurt = new Set(injuries.filter((i) => i.id).map((i) => i.id));
  const lineFor = (abbr) => dressed(abbr).filter((id) => !hurt.has(id)).map((id) => [id, people[id]?.pos === "D" ? 1 : 0]);
  /** Regulars (in at least 6 of the last 10 lineups) who aren't in tonight's, most valuable first. */
  function missing(abbr, line) {
    const inTonight = new Set(line.map((r) => r[0])), cnt = {};
    for (const l of R.recent(abbr)) for (const [id, d] of l) (cnt[id] ??= [0, d])[0]++;
    return Object.entries(cnt).filter(([id, [n]]) => n >= 6 && !inTonight.has(+id) && people[id]?.team === abbr).map(([id, [, d]]) => ({ id: +id, name: people[id] ? `${people[id].first} ${people[id].last}` : null, v: +R.value(+id, d).toFixed(2), hurt: hurt.has(+id) }))
      .sort((a, b) => b.v - a.v).slice(0, 4);
  }

  const week = new Map();
  for (const d of league.week.gameWeek) for (const g of d.games) if (g.gameType === 2 || g.gameType === 3) week.set(g.id, { ...g, gameDate: g.gameDate ?? d.date });
  for (const g of league.todayGames) if (g.gameType === 2 || g.gameType === 3) week.set(g.id, { ...g, gameDate: g.gameDate ?? league.today });
  const pickById = Object.fromEntries(picks.map((p) => [p.id, p]));

  const games = {};
  for (const g of week.values()) {
    const home = g.homeTeam.abbrev, away = g.awayTeam.abbrev, playoff = g.gameType === 3;
    const hS = starter(home, g), aS = starter(away, g);
    const hB2b = !!dates[home]?.has(prevDay(g.gameDate)), aB2b = !!dates[away]?.has(prevDay(g.gameDate));
    const hNext = T[home]?.next?.id === g.id, aNext = T[away]?.next?.id === g.id;
    const hLine = hNext ? lineFor(home) : null, aLine = aNext ? lineFor(away) : null;
    const q = { home, away, hG: hS?.id ?? null, aG: aS?.id ?? null, hB2b, aB2b, hLine: hLine?.length >= 15 ? hLine : null, aLine: aLine?.length >= 15 ? aLine : null };
    // A finished game keeps the prediction it had before puck drop (from the backtest: games before it only).
    const done = pickById[g.id];
    const m = R.matchup(q);
    const lh = done ? done.lh : m.lh, la = done ? done.la : m.la;
    const p = predictGame(lh, la, { playoff });
    // How much each factor moves the home team's chances (percentage points).
    const pOf = (over, P) => { const x = R.matchup({ ...q, ...over }, P); return predictGame(x.lh, x.la, { playoff }).home; };
    const swings = done ? null : {
      home: p.home - pOf({}, { ...DEFAULTS, home: 1 }),
      goalies: q.hG || q.aG ? p.home - pOf({ hG: null, aG: null }) : 0,
      b2b: hB2b || aB2b ? p.home - pOf({ hB2b: false, aB2b: false }) : 0,
      lineups: q.hLine || q.aLine ? p.home - pOf({ hLine: null, aLine: null }) : 0,
    };
    const side = (abbr, S, team, gF, b2b, lam, line) => {
      const t = T[abbr];
      const sv = S ? R.sv(S.id) : null;
      const scorers = t?.next?.id === g.id ? dressed(abbr).map((id) => {
        // Team's expected goals tonight vs its season norm scales each player's rate.
        const k = lam / (m.lg * team.att);
        return { id, name: people[id] ? `${people[id].first} ${people[id].last}` : String(id), pos: people[id]?.pos ?? "", p: 1 - Math.exp(-gpg(id) * k) };
      }).sort((a, b) => b.p - a.p).slice(0, 4).map((x) => ({ ...x, p: +x.p.toFixed(3) })) : [];
      return {
        abbr, att: +team.att.toFixed(3), def: +team.def.toFixed(3), gf: pct(team.att - 1), ga: pct(team.def - 1), gp: team.gp,
        goalie: S ? { id: S.id, name: people[S.id] ? `${people[S.id].first} ${people[S.id].last}` : null, status: S.status, sv: +sv.sv.toFixed(4), shots: sv.shots, gsax: +sv.gsax.toFixed(1), factor: +gF.toFixed(3) } : null,
        b2b, xg: +lam.toFixed(2), scorers,
        lineup: line ? { delta: +(team.lineup ?? 0).toFixed(3), effect: +(Math.exp(FIT.cA * (team.lineup ?? 0)) - 1).toFixed(3), source: reported[abbr]?.lines ? (reported[abbr].lines.stale ? "latest lines (before last game)" : "reported lines") : "last game's lineup", missing: missing(abbr, line) } : null,
      };
    };
    games[g.id] = {
      id: g.id, date: g.gameDate, start: g.startTimeUTC, state: g.gameState, playoff,
      lh: +lh.toFixed(3), la: +la.toFixed(3), home: +p.home.toFixed(4), ot: +p.ot.toFixed(3), top: p.top, over55: +p.over55.toFixed(3), over65: +p.over65.toFixed(3), homeBy2: +p.homeBy2.toFixed(3), awayBy2: +p.awayBy2.toFixed(3),
      swings: swings && Object.fromEntries(Object.entries(swings).map(([k, v]) => [k, +v.toFixed(4)])),
      h: side(home, hS, m.H, m.hg, hB2b, lh, q.hLine), a: side(away, aS, m.A, m.ag, aB2b, la, q.aLine),
      result: done ? { homeWon: done.homeWon, hg: done.hg, ag: done.ag, ot: done.ot } : null,
    };
  }

  // Season record (each game predicted from earlier games only).
  const weekAgo = new Date(Date.parse(league.today + "T12:00:00Z") - 7 * 864e5).toISOString().slice(0, 10);
  const s = score(picks), last7 = picks.filter((p) => p.date > weekAgo);
  const fav = (lo, hi) => { const r = picks.filter((p) => Math.max(p.p, 1 - p.p) >= lo && Math.max(p.p, 1 - p.p) < hi); return { n: r.length, right: r.filter((p) => (p.p >= 0.5) === p.homeWon).length, avg: r.reduce((t, p) => t + Math.max(p.p, 1 - p.p), 0) / (r.length || 1) }; };
  const homeRate = log.filter((g) => g.homeWon).length / (log.length || 1);
  const record = {
    ...s, right: picks.filter((p) => (p.p >= 0.5) === p.homeWon).length, last7: { n: last7.length, right: last7.filter((p) => (p.p >= 0.5) === p.homeWon).length },
    bands: [[0.5, 0.55], [0.55, 0.6], [0.6, 0.65], [0.65, 1]].map(([lo, hi]) => ({ lo, hi, ...fav(lo, hi) })),
    baseline: score(log.map((g) => ({ p: 0.535, homeWon: g.homeWon }))).logLoss, homeRate,
    recent: picks.slice(-40).reverse().map((p) => ({ id: p.id, date: p.date, home: p.home, away: p.away, p: +p.p.toFixed(3), homeWon: p.homeWon, hg: p.hg, ag: p.ag, ot: p.ot })),
  };
  return { games, record, params: { ...DEFAULTS }, fit: FIT, svLg: +R.svLg().toFixed(4) };
}
