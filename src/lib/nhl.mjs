// NHL data: teams, schedule, standings, stats, box scores, shift charts, rosters, prospects.
// All public NHL endpoints (unofficial, no key). Cached through http.mjs.
import { get, pool } from "./http.mjs";
import { analyze, keyOf } from "../core/lines.mjs";

const WEB = "https://api-web.nhle.com/v1";
const STATS = "https://api.nhle.com/stats/rest/en";
export const FINAL = new Set(["OFF", "FINAL"]);
export const LIVE = new Set(["LIVE", "CRIT"]);
const HOUR = 3600, DAY = 86400;

export const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function loadLeague() {
  const st = await get(`${WEB}/standings/now`, { ttl: 600 });
  const teams = st.standings.map((t) => ({
    abbrev: t.teamAbbrev.default,
    name: t.teamName.default,
    common: t.teamCommonName?.default ?? t.teamName.default,
    place: t.placeName?.default ?? "",
    slug: slugify(t.teamName.default),
    logo: t.teamLogo,
    logoDark: t.teamLogoDark ?? t.teamLogo,
    conf: t.conferenceName, div: t.divisionName,
    gp: t.gamesPlayed, w: t.wins, l: t.losses, otl: t.otLosses, pts: t.points,
    ptsPct: t.pointPctg, rw: t.regulationWins, gf: t.goalFor, ga: t.goalAgainst, diff: t.goalDifferential,
    l10: `${t.l10Wins}-${t.l10Losses}-${t.l10OtLosses}`, streak: t.streakCode ? `${t.streakCode}${t.streakCount}` : "",
    home: `${t.homeWins}-${t.homeLosses}-${t.homeOtLosses}`, road: `${t.roadWins}-${t.roadLosses}-${t.roadOtLosses}`,
    leagueSeq: t.leagueSequence, confSeq: t.conferenceSequence, divSeq: t.divisionSequence, wcSeq: t.wildcardSequence,
    record: `${t.wins}-${t.losses}-${t.otLosses}`,
  }));
  const seasonId = st.standings[0]?.seasonId;
  // "Today" is the hockey day in Eastern time (before 6am ET it's still last night's slate). The NHL's own "now" feed switches
  // days hours late, so ask for the date directly and only fall back to "now" if that fails.
  const etDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
  const etHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(new Date())) % 24;
  const hockeyDay = etDate(new Date(Date.now() - (etHour < 6 ? 864e5 : 0)));
  let score = await get(`${WEB}/score/${hockeyDay}`, { ttl: 0 });
  if (!score?.games) score = await get(`${WEB}/score/now`, { ttl: 0 });
  const week = await get(`${WEB}/schedule/now`, { ttl: 300 });
  return { teams, seasonId, today: score.currentDate && score.currentDate >= hockeyDay ? score.currentDate : hockeyDay, todayGames: score.games ?? [], week };
}

export async function teamSchedules(teams) {
  return Object.fromEntries(await pool(teams, 6, async (t) => {
    const s = await get(`${WEB}/club-schedule-season/${t.abbrev}/now`, { ttl: 1800 });
    return [t.abbrev, (s?.games ?? []).filter((g) => g.gameType === 2 || g.gameType === 3)];
  }));
}

export const boxscore = (id, final) => get(`${WEB}/gamecenter/${id}/boxscore`, { ttl: final ? Infinity : 60 });
export const playByPlay = (id, final) => get(`${WEB}/gamecenter/${id}/play-by-play`, { ttl: final ? Infinity : 60 });
export async function shiftChart(id, final) {
  // Shift charts finish posting a little after the final horn. Only cache forever once they look complete.
  const url = `${STATS}/shiftcharts?cayenneExp=gameId=${id}`;
  const r = await get(url, { ttl: final ? 6 * HOUR : 60 });
  return r?.data ?? [];
}

export async function analyzeGame(game) {
  const final = FINAL.has(game.gameState);
  const [box, shifts, pbp] = await Promise.all([boxscore(game.id, final), shiftChart(game.id, final), playByPlay(game.id, final)]);
  if (!box || !shifts.length) return null;
  const a = analyze({ shifts, box, plays: pbp?.plays ?? [] });
  return { box, a };
}

/** Per-team lines, changes, goalies, schedule context. */
export async function buildTeams(league, schedules) {
  const { teams } = league;
  const byAbbrev = Object.fromEntries(teams.map((t) => [t.abbrev, t]));
  // Box scores of each team's last 10 finished games (goalie starts).
  const recentIds = new Map();
  for (const t of teams) for (const g of schedules[t.abbrev].filter((g) => FINAL.has(g.gameState)).slice(-10)) recentIds.set(g.id, g);
  const boxes = new Map();
  await pool([...recentIds.values()], 8, async (g) => boxes.set(g.id, await boxscore(g.id, true)));

  const analyses = new Map(); // gameId → analyze result
  const toAnalyze = new Map();
  for (const t of teams) for (const g of schedules[t.abbrev].filter((g) => FINAL.has(g.gameState) || LIVE.has(g.gameState)).slice(-6)) toAnalyze.set(g.id, g); // last 5 + a live one: line depth is averaged over them
  await pool([...toAnalyze.values()], 6, async (g) => { const r = await analyzeGame(g); if (r) analyses.set(g.id, r); });

  const out = {};
  for (const t of teams) {
    const sched = schedules[t.abbrev];
    const done = sched.filter((g) => FINAL.has(g.gameState));
    const live = sched.find((g) => LIVE.has(g.gameState));
    const sideOf = (g) => (g.homeTeam.abbrev === t.abbrev ? "home" : "away");
    const summarize = (g) => {
      const r = analyses.get(g.id);
      if (!r) return null;
      const s = r.a[sideOf(g)];
      const opp = sideOf(g) === "home" ? g.awayTeam : g.homeTeam;
      const us = sideOf(g) === "home" ? r.box.homeTeam : r.box.awayTeam;
      return {
        gameId: g.id, date: g.gameDate, opp: opp.abbrev, home: sideOf(g) === "home",
        state: g.gameState, score: `${us.score ?? 0}-${(sideOf(g) === "home" ? r.box.awayTeam : r.box.homeTeam).score ?? 0}`,
        result: FINAL.has(g.gameState) ? (us.score > opp.score ? "W" : r.box.gameOutcome?.lastPeriodType === "REG" ? "L" : "OTL") : "LIVE",
        ...s,
      };
    };
    const lastTwo = done.slice(-2).map(summarize).filter(Boolean);
    const last = lastTwo.at(-1) ?? null, prev = lastTwo.length > 1 ? lastTwo[0] : null;
    const liveLines = live ? summarize(live) : null;

    // Number lines by each player's usual role, smoothed over the last 5 games he played: average depth seconds
    // (forwards 5v5 + PP, D all situations), the line's mean. One game alone is noisy: blowouts, penalties and empty
    // nets skew ice time.
    const sum = {}, n = {};
    for (const g of done.slice(-5)) for (const [id, v] of Object.entries(analyses.get(g.id)?.a[sideOf(g)]?.depthToi ?? {})) { sum[id] = (sum[id] ?? 0) + v; n[id] = (n[id] ?? 0) + 1; }
    const usual = (id, L) => (n[id] ? sum[id] / n[id] : L.depthToi?.[id] ?? 0);
    const depthOf = (ids, L) => ids.reduce((s, id) => s + usual(id, L), 0) / (ids.length || 1);
    // Forward lines: the centre (middle slot) counts double. He defines the line; wingers rotate more.
    const lineDepth = (ids, L) => (ids.length === 3 ? (usual(ids[0], L) + 2 * usual(ids[1], L) + usual(ids[2], L)) / 4 : depthOf(ids, L));
    for (const L of [last, prev, liveLines]) if (L) {
      L.lines.sort((a, b) => lineDepth(b.ids, L) - lineDepth(a.ids, L));
      L.pairs.sort((a, b) => depthOf(b.ids, L) - depthOf(a.ids, L));
    }

    let changes = null;
    if (last && prev) {
      const pl = new Set(prev.lines.map((l) => keyOf(l.ids))), pp = new Set(prev.pairs.map((l) => keyOf(l.ids)));
      const prevPP1 = prev.pp[0]?.ids ?? [], lastPP1 = last.pp[0]?.ids ?? [];
      const nameOf = (p, id) => ({ id, name: p.players[id]?.name, num: p.players[id]?.num, pos: p.players[id]?.posDetail });
      changes = {
        vsDate: prev.date, vsOpp: prev.opp,
        newLines: last.lines.map((l) => !pl.has(keyOf(l.ids))),
        newPairs: last.pairs.map((l) => !pp.has(keyOf(l.ids))),
        in: last.dressed.filter((id) => !prev.dressed.includes(id) && last.players[id]?.pos !== "G"),
        out: prev.dressed.filter((id) => !last.dressed.includes(id) && prev.players[id]?.pos !== "G").map((id) => nameOf(prev, id)),
        pp1In: lastPP1.filter((id) => !prevPP1.includes(id)),
        pp1Out: prevPP1.filter((id) => !lastPP1.includes(id)).map((id) => nameOf(prev, id)),
      };
    }

    // Goalie starts over the last 10.
    const recent = done.slice(-10);
    const starts = {}, gname = {};
    let lastStarter = null;
    for (const g of recent) {
      const b = boxes.get(g.id); if (!b) continue;
      for (const gl of b.playerByGameStats[sideOf(g) === "home" ? "homeTeam" : "awayTeam"].goalies) {
        gname[gl.playerId] = gl.name.default;
        if (gl.starter) { starts[gl.playerId] = (starts[gl.playerId] || 0) + 1; if (g === recent.at(-1)) lastStarter = gl.playerId; }
      }
    }
    const goalieList = Object.entries(gname).map(([id, name]) => ({ id: +id, name, starts: starts[id] || 0 }))
      .filter((g) => g.starts > 0).sort((a, b) => b.starts - a.starts);

    const upcoming = sched.filter((g) => !FINAL.has(g.gameState));
    const next = upcoming[0] ?? null;
    const dayMs = (d) => Date.parse(d + "T12:00:00Z");
    const b2b = !!(next && done.length && Math.round((dayMs(next.gameDate) - dayMs(done.at(-1).gameDate)) / 864e5) === 1);
    // Projected starter: the last starter, unless it's the 2nd night of a back-to-back.
    let projGoalie = lastStarter;
    if (b2b && goalieList.length > 1) projGoalie = goalieList.find((g) => g.id !== lastStarter)?.id ?? lastStarter;

    const mini = (g) => ({
      id: g.id, date: g.gameDate, startUTC: g.startTimeUTC, state: g.gameState,
      opp: sideOf(g) === "home" ? g.awayTeam.abbrev : g.homeTeam.abbrev, home: sideOf(g) === "home",
      us: (sideOf(g) === "home" ? g.homeTeam : g.awayTeam).score ?? null, them: (sideOf(g) === "home" ? g.awayTeam : g.homeTeam).score ?? null,
      outcome: g.gameOutcome?.lastPeriodType ?? null,
    });

    out[t.abbrev] = {
      ...t, last, prev: prev ? { date: prev.date, opp: prev.opp, gameId: prev.gameId } : null, changes, live: liveLines,
      goalies: { window: recent.length, lastStarter, projected: projGoalie, starts: goalieList,
        // Where the projection comes from, shown on the site: the game the last start was in, and the rule used.
        lastGame: recent.length ? mini(recent.at(-1)) : null, reason: projGoalie && projGoalie !== lastStarter ? "b2b" : "last" },
      next: next ? { ...mini(next), b2b } : null,
      results: done.slice(-5).reverse().map(mini),
      upcoming: upcoming.slice(0, 5).map(mini),
    };
  }
  // Opponent names for display.
  for (const t of Object.values(out)) for (const g of [...t.results, ...t.upcoming, ...(t.next ? [t.next] : [])]) g.oppName = byAbbrev[g.opp]?.common ?? g.opp;
  return out;
}

export async function rosters(teams) {
  return Object.fromEntries(await pool(teams, 6, async (t) => {
    const r = await get(`${WEB}/roster/${t.abbrev}/current`, { ttl: 12 * HOUR });
    const list = [];
    for (const grp of ["forwards", "defensemen", "goalies"]) for (const p of r?.[grp] ?? []) list.push({
      id: p.id, first: p.firstName.default, last: p.lastName.default, num: p.sweaterNumber ?? null,
      pos: p.positionCode, shoots: p.shootsCatches, headshot: p.headshot, birthDate: p.birthDate,
      birthCountry: p.birthCountry, height: p.heightInInches, weight: p.weightInPounds, team: t.abbrev,
    });
    return [t.abbrev, list];
  }));
}

export async function seasonStats(seasonId) {
  const q = (kind) => `${STATS}/${kind}/summary?limit=-1&cayenneExp=seasonId=${seasonId}%20and%20gameTypeId=2`;
  const [sk, gk] = await Promise.all([get(q("skater"), { ttl: HOUR }), get(q("goalie"), { ttl: HOUR })]);
  return { skaters: sk?.data ?? [], goalies: gk?.data ?? [] };
}

export async function leaders() {
  const [sk, gk, edge] = await Promise.all([
    get(`${WEB}/skater-stats-leaders/current?categories=points,goals,assists,plusMinus&limit=10`, { ttl: HOUR }),
    get(`${WEB}/goalie-stats-leaders/current?categories=savePctg,goalsAgainstAverage,wins,shutouts&limit=10`, { ttl: HOUR }),
    get(`${WEB}/edge/skater-landing/now`, { ttl: 6 * HOUR }),
  ]);
  return { skaters: sk ?? {}, goalies: gk ?? {}, edge: edge?.leaders ?? {} };
}

export async function draftRankings() {
  const first = await get(`${WEB}/draft/rankings/now`, { ttl: DAY });
  if (!first) return null;
  const year = first.draftYear;
  const cats = await pool(first.categories, 4, async (c) => {
    const r = c.id === first.categoryId ? first : await get(`${WEB}/draft/rankings/${year}/${c.id}`, { ttl: DAY });
    return { id: c.id, name: c.name, rankings: r?.rankings ?? [] };
  });
  return { year, categories: cats };
}

export async function prospects(teams) {
  return Object.fromEntries(await pool(teams, 6, async (t) => {
    const r = await get(`${WEB}/prospects/${t.abbrev}`, { ttl: DAY });
    const list = [];
    for (const grp of ["forwards", "defensemen", "goalies"]) for (const p of r?.[grp] ?? []) list.push({
      id: p.id, first: p.firstName.default, last: p.lastName.default, pos: p.positionCode, shoots: p.shootsCatches,
      birthDate: p.birthDate, birthCountry: p.birthCountry, headshot: p.headshot, height: p.heightInInches, nhlTeam: t.abbrev,
    });
    return [t.abbrev, list];
  }));
}

export const playerLanding = (id) => get(`${WEB}/player/${id}/landing`, { ttl: DAY });

export async function draftPicks(year) {
  const r = await get(`${WEB}/draft/picks/${year}/all`, { ttl: 7 * DAY });
  return r?.picks ?? [];
}

/** Find a player's NHL id by name (+ optional birth country). */
export async function searchPlayer(name, country) {
  const r = await get(`https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=10&q=${encodeURIComponent(name)}`, { ttl: 30 * DAY });
  const want = slugify(name);
  const hits = (r ?? []).filter((p) => slugify(p.name) === want);
  return (hits.find((p) => !country || p.birthCountry === country) ?? hits[0]) ?? null;
}

/** Every player who has played an NHL regular-season game (about 8,800). */
export async function allTimePlayers() {
  const exp = encodeURIComponent("gameTypeId=2 and seasonId>=19171918 and seasonId<=20302031");
  const q = (kind) => get(`https://api.nhle.com/stats/rest/en/${kind}/summary?isAggregate=true&isGame=false&limit=-1&cayenneExp=${exp}`, { ttl: 7 * DAY });
  const [sk, gl] = await Promise.all([q("skater"), q("goalie")]);
  const split = (full, last) => ({ first: full.slice(0, Math.max(0, full.length - last.length)).trim() || full.split(" ")[0], last });
  return [
    ...(sk?.data ?? []).map((p) => ({ id: p.playerId, ...split(p.skaterFullName, p.lastName), pos: p.positionCode, gp: p.gamesPlayed, g: p.goals, a: p.assists, pts: p.points, pim: p.penaltyMinutes, pm: p.plusMinus, ppg: p.ppGoals, gwg: p.gameWinningGoals })),
    ...(gl?.data ?? []).map((p) => ({ id: p.playerId, ...split(p.goalieFullName, p.lastName), pos: "G", gp: p.gamesPlayed, w: p.wins, so: p.shutouts, sv: p.savePct, gaa: p.goalsAgainstAverage })),
  ];
}

/** Player pages for players no longer in the league barely change: cache them for a month. */
export const playerLandingLong = (id) => get(`${WEB}/player/${id}/landing`, { ttl: 30 * DAY });

/** All-time leaders for each current franchise (regular season, every player who suited up). */
export async function franchiseLeaders(teams) {
  const list = await get(`${STATS}/team`, { ttl: 30 * DAY });
  const fid = Object.fromEntries((list?.data ?? []).map((t) => [t.triCode, t.franchiseId]));
  return Object.fromEntries(await pool(teams, 4, async (t) => {
    const id = fid[t.abbrev];
    if (!id) return [t.abbrev, null];
    const q = (kind) => get(`${STATS}/${kind}/summary?isAggregate=true&isGame=false&limit=-1&cayenneExp=${encodeURIComponent(`franchiseId=${id} and gameTypeId=2`)}`, { ttl: 7 * DAY });
    const [sk, gl] = await Promise.all([q("skater"), q("goalie")]);
    return [t.abbrev, {
      skaters: (sk?.data ?? []).map((p) => ({ id: p.playerId, name: p.skaterFullName, pos: p.positionCode, gp: p.gamesPlayed, g: p.goals, a: p.assists, pts: p.points, pim: p.penaltyMinutes, ppg: p.ppGoals, gwg: p.gameWinningGoals })),
      goalies: (gl?.data ?? []).map((p) => ({ id: p.playerId, name: p.goalieFullName, pos: "G", gp: p.gamesPlayed, w: p.wins, so: p.shutouts, sv: p.savePct, gaa: p.goalsAgainstAverage })),
    }];
  }));
}
