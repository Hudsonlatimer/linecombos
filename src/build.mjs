// Builds the whole static site into dist/.
//   node src/build.mjs          normal (uses cache where safe)
//   node src/build.mjs --fresh  ignore cache
import fs from "node:fs/promises";
import path from "node:path";
import { ROOT, DIST, PUBLIC, CONFIG } from "./lib/paths.mjs";
import { stats as httpStats, pool } from "./lib/http.mjs";
import * as nhl from "./lib/nhl.mjs";
import { ingest, reportedFor } from "./lib/posts.mjs";
import { goalieReports, goalieId } from "./lib/goalies.mjs";
import { dfoLines } from "./lib/dailyfaceoff.mjs";
import { buildWjc } from "./lib/wjc.mjs";
import { forecast as wjcForecast, WIKI_URL } from "./lib/wjcpredict.mjs";
import { bracketPage } from "./render/wjc-forecast.mjs";
import { gameJson } from "./core/game.mjs";
import * as P from "./render/nhl-pages.mjs";
import { wjcHub, wjcTeam } from "./render/wjc-pages.mjs";
import { page } from "./render/html.mjs";
import * as M from "./lib/moves.mjs";
import { predict } from "./lib/predict.mjs";
import { gamePredictions } from "./lib/gamepredict.mjs";
import { predictionsPage } from "./render/predict-pages.mjs";
import * as X from "./render/more-pages.mjs";
import * as C from "./lib/contracts.mjs";
import { draftClass } from "./lib/draft.mjs";
import { nhlProspectsPage } from "./render/prospect-pages.mjs";
import { mockDraftPage } from "./render/mock-draft.mjs";
import { teamStats } from "./lib/teamstats.mjs";
import { rosterStats } from "./lib/rosterstats.mjs";
import { teamStatsPage } from "./render/teamstats-pages.mjs";

const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const readJson = async (f) => JSON.parse(await fs.readFile(f, "utf8"));

/** Midnight in New York for a YYYY-MM-DD date, as an ISO string. */
function etMidnight(date) {
  const probe = new Date(`${date}T12:00:00Z`);
  const off = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" }).formatToParts(probe).find((p) => p.type === "timeZoneName").value; // "GMT-5"
  const hours = -Number(off.replace("GMT", "") || 0);
  return new Date(Date.parse(`${date}T00:00:00Z`) + hours * 3600e3).toISOString();
}

async function write(rel, content) {
  const file = path.join(DIST, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(s, d); else await fs.copyFile(s, d);
  }
}

// ---------- data ----------
const site = { ...(await readJson(path.join(CONFIG, "site.json"))), builtAt: new Date().toISOString() };
if (process.env.LIVE_API) site.liveApi = process.env.LIVE_API;

log("NHL: league, schedule");
const league = await nhl.loadLeague();
const schedules = await nhl.teamSchedules(league.teams);
log("NHL: lines from shift charts");
const T = await nhl.buildTeams(league, schedules);
// Team colours (ESPN). Near-black primaries fall back to the alternate so they read on dark backgrounds.
{
  const { get } = await import("./lib/http.mjs");
  const r = await get("https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/teams", { ttl: 30 * 86400 });
  const lum = (h) => { const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  for (const { team: e } of r?.sports?.[0]?.leagues?.[0]?.teams ?? []) {
    const t = T[M.fixAbbr(e.abbreviation)];
    if (!t || !e.color) continue;
    t.color = "#" + e.color; t.color2 = e.alternateColor ? "#" + e.alternateColor : t.color;
    const alt = e.alternateColor ? lum(e.alternateColor) : 0;
    t.accent = lum(e.color) < 0.16 && alt > 0.2 && alt < 0.9 ? t.color2 : t.color;
  }
}
log("NHL: rosters, stats, leaders, draft rankings, prospects");
const [rosters, stats, leaders, draft, prospects] = await Promise.all([
  nhl.rosters(league.teams), nhl.seasonStats(league.seasonId), nhl.leaders(), nhl.draftRankings(), nhl.prospects(league.teams),
]);
log("World Juniors: pool + projections");
const wjc = await buildWjc({ prospectsByTeam: prospects, rostersByTeam: rosters });
log("World Juniors: simulating the tournament");
wjc.forecast = await wjcForecast(wjc);
log(`World Juniors forecast: ${Object.values(wjc.forecast.odds).sort((a, b) => b.gold - a.gold).slice(0, 3).map((o) => `${o.code} ${(o.gold * 100).toFixed(0)}%`).join(", ")} lead for gold`);

// People: NHL roster players (each gets a page).
const people = {};
for (const [abbr, list] of Object.entries(rosters)) for (const p of list) people[p.id] = { ...p, name: `${p.first[0]}. ${p.last}`, team: abbr };

log("News: Bluesky + X inbox");
const tags = await readJson(path.join(CONFIG, "team-tags.json"));
const aliases = {};
for (const t of league.teams) aliases[t.abbrev] = [t.common, t.name, ...(t.place && !["New York", "Los Angeles"].includes(t.place) ? [t.place] : []), ...(tags[t.abbrev] ?? [])];
for (const c of wjc.cfg.teams) aliases[c.code] = [`Team ${c.name}`, `${c.name} WJC`, `#WorldJuniors ${c.name}`];
const parsePlayers = [
  ...Object.values(people).map((p) => ({ id: p.id, first: p.first, last: p.last, team: p.team, pos: p.pos })),
  ...Object.values(wjc.teams).flatMap((t) => Object.values(t.pool).filter((p) => !people[p.id]).map((p) => ({ id: p.id, first: p.first, last: p.last, team: t.code, pos: p.pos }))),
];
const posts = await ingest({ players: parsePlayers, teamAliases: aliases });
const since = etMidnight(league.today);
const reported = {};
for (const t of league.teams) reported[t.abbrev] = reportedFor(posts, t.abbrev, since);
// Starting-goalie reports (Daily Faceoff's page, which links each reporter's post). "Confirmed" → the Confirmed starter;
// "Likely" → replaces our own guess as the projection. Both keep the original reporter as the visible source.
// A goalie from a parsed post must actually be on that team (a post can be filed under the wrong team).
for (const [abbr, r] of Object.entries(reported)) if (r.goalie && people[r.goalie.parsed.goalie]?.team !== abbr) r.goalie = null;
const goalieRep = await goalieReports();
for (const [abbr, r] of Object.entries(goalieRep)) {
  const id = goalieId(r.name, abbr, people);
  if (!id || !reported[abbr] || !T[abbr]) continue;
  const post = { parsed: { goalie: id, type: "goalie", team: abbr }, url: r.url, author: r.author, createdAt: r.createdAt, text: r.text, via: r.via, viaUrl: r.viaUrl };
  if (r.status === "confirmed") reported[abbr].goalie = post;
  else {
    if (reported[abbr].goalie?.parsed.goalie !== id) reported[abbr].goalie = null; // a reporter's "likely" outranks our own post parsing
    T[abbr].goalies.projected = id; T[abbr].goalies.reason = "likely"; T[abbr].goalies.likely = post;
  }
}
log(`Goalies: ${Object.values(goalieRep).filter((r) => r.status === "confirmed").length} confirmed, ${Object.values(goalieRep).filter((r) => r.status === "likely").length} likely`);
// Lines: Daily Faceoff's latest combinations per team, each credited to the reporter/team post it came from.
// "Reported" when posted after the team's last game (i.e. for the next one); older ones still show, as Projected.
const dfo = await dfoLines(league.teams, people);
for (const [abbr, d] of Object.entries(dfo)) {
  if (!reported[abbr] || d.lines.length < 3) continue;
  const lastNight = T[abbr]?.last ? Date.parse(`${T[abbr].last.date}T12:00:00Z`) + 18 * 3600e3 : 0;
  reported[abbr].lines = {
    parsed: { type: "lines", team: abbr, lines: d.lines, pairs: d.pairs, pp: d.pp, pk: d.pk, goalies: d.goalies },
    out: d.out,
    url: d.url, author: d.author, createdAt: d.createdAt, via: d.via, viaUrl: d.viaUrl, kind: d.kind, lastGame: d.lastGame,
    // Only a reporter's post made after the last game is "Reported"; last-game copies and DFO's own guesses are Projected.
    stale: d.kind !== "report" || (!!d.createdAt && Date.parse(d.createdAt) < lastNight),
  };
}
const unmatched = Object.entries(dfo).filter(([, d]) => d.unmatched.length).map(([a, d]) => `${a}: ${d.unmatched.join(", ")}`);
log(`Lines: Daily Faceoff for ${Object.keys(dfo).length} teams, ${Object.values(reported).filter((r) => r.lines && !r.lines.stale).length} posted since their last game${unmatched.length ? `; unmatched names ${unmatched.join(" | ")}` : ""}`);
log(`News: ${posts.length} posts, ${posts.filter((p) => p.parsed.type === "lines").length} with lines`);

log("Injuries, transactions, suspensions");
const [injuries, tx, discipline] = await Promise.all([M.injuries(league.teams, rosters), M.transactions(2014), M.discipline(league.teams)]);
log(`Player safety: ${discipline.length} suspensions and fines`);
const scratches = M.scratches(T, rosters, injuries);

log("Cup predictor: simulating seasons");
const cup = await predict(league, schedules);
log("Game predictor: ratings, starters, backtest");
const preds = await gamePredictions({ league, schedules, T, reported, stats, people, injuries });
log(`Game predictor: ${Object.keys(preds.games).length} games this week · season record ${preds.record.right}-${preds.record.n - preds.record.right} (${(preds.record.acc * 100).toFixed(1)}%), log loss ${preds.record.logLoss.toFixed(3)} vs ${preds.record.baseline.toFixed(3)} baseline`);

// Player profiles: every NHL roster player, every team's prospects, the World Juniors pool, and injured players.
log("Player profiles");
const base = new Map();
for (const p of Object.values(people)) base.set(p.id, { ...p, status: "roster" });
for (const [abbr, list] of Object.entries(prospects)) for (const p of list) if (!base.has(p.id)) base.set(p.id, { ...p, nhlTeam: abbr, team: null, status: "prospect" });
for (const t of Object.values(wjc.teams)) for (const p of Object.values(t.pool)) if (!base.has(p.id)) base.set(p.id, { id: p.id, first: p.first, last: p.last, pos: p.pos, birthDate: p.birthDate, team: null, nhlTeam: p.draft?.team ?? null, status: "wjc" });
for (const i of injuries) if (i.id && !base.has(i.id)) base.set(i.id, { id: i.id, first: i.name.split(" ")[0], last: i.name.split(" ").slice(1).join(" "), pos: i.pos, team: i.team, status: "injured" });
// Everyone who has ever played in the NHL. Skipped with NO_HISTORY=1 for quick local builds.
const allTime = await nhl.allTimePlayers();
const alumni = process.env.NO_HISTORY ? [] : allTime;
for (const p of alumni) if (!base.has(p.id)) base.set(p.id, { ...p, team: null, nhlTeam: null, status: "alumni" });
log(`All-time players: ${alumni.length}`);
// Current players first, so a retired namesake never steals their transactions.
const txBy = M.txByPlayer(tx, [...base.values()].filter((p) => p.status !== "alumni"));
Object.assign(txBy, Object.fromEntries(Object.entries(M.txByPlayer(tx, [...base.values()].filter((p) => p.status === "alumni"))).filter(([id]) => !txBy[id])));
const teamsByAbbr = Object.fromEntries(league.teams.map((t) => [t.abbrev, t]));
const injById = Object.fromEntries(injuries.filter((i) => i.id).map((i) => [i.id, i]));
const profiles = {};
// First and last NHL season plus the NHL teams a player suited up for, in order.
function nhlSpan(l) {
  const rows = (l.seasonTotals ?? []).filter((s) => s.leagueAbbrev === "NHL" && s.gameTypeId === 2);
  if (!rows.length) return { yrs: null, nhlTeams: [] };
  const y = (s) => String(s).slice(0, 4);
  const a = y(rows[0].season), b = String(rows.at(-1).season).slice(4);
  // Still playing: "2005–active", not the current season's end year.
  return { yrs: l.isActive ? `${a}–active` : a === String(Number(b) - 1) ? `${a}-${b.slice(2)}` : `${a}–${b}`, nhlTeams: [...new Set(rows.map((s) => s.teamName?.default).filter(Boolean))] };
}
// National teams a player has represented ("Canada U18" counts as Canada).
const INTL_LG = /^(wjc|wc|wc-|og|olympics|4 nations|wcup|whc|wjac|u-?1d|u-?2d|hlinka|5 nations|eht)/i;
function nationsOf(l) {
  const out = [];
  for (const s of l.seasonTotals ?? []) if (INTL_LG.test(s.leagueAbbrev ?? "")) {
    const n = String(s.teamName?.default ?? "").replace(/s+(U-?d+|Ud+|Jr.?|Junior|National Team|Olympic Team)$/i, "").trim();
    const nn = n.replace(/^Team\s+/i, "");
    if (nn && !/north america|europe|world|all-?star/i.test(nn) && !out.includes(nn)) out.push(nn);
  }
  return out;
}
let done = 0;
await pool([...base.values()], 10, async (b) => {
  const l = b.status === "alumni" ? await nhl.playerLandingLong(b.id) : await nhl.playerLanding(b.id);
  if (++done % 1000 === 0) log(`  ${done} / ${base.size}`);
  if (!l) return;
  const team = b.status === "roster" ? b.team : b.status === "injured" ? (l.currentTeamAbbrev ?? b.team) : null;
  const club = (l.seasonTotals ?? []).filter((s) => s.gameTypeId === 2).at(-1);
  // Moves are matched by name, so a namesake's moves can land on the wrong player (a 2021 prospect named Bobby Orr
  // is not the Bobby Orr). Keep only moves from the player's own career: age 16+, and not after a retired player's last season.
  {
    const born = +String(l.birthDate ?? "").slice(0, 4), lastSeason = (l.seasonTotals ?? []).at(-1)?.season;
    const end = !l.isActive && lastSeason ? +String(lastSeason).slice(4) : null;
    const ok = (m) => (!born || m.date >= `${born + 16}`) && (!end || m.date <= `${end}-10-31`);
    const mine = txBy[b.id] ?? [];
    for (const m of mine.filter((x) => !ok(x))) for (const t of tx) if (t.date === m.date && t.text === m.text && t.ids) t.ids = t.ids.filter((x) => x !== b.id);
    if (mine.some((x) => !ok(x))) txBy[b.id] = mine.filter(ok);
  }
  profiles[b.id] = {
    id: b.id, first: l.firstName?.default ?? b.first, last: l.lastName?.default ?? b.last, pos: l.position ?? b.pos,
    num: l.sweaterNumber ?? b.num ?? null, team: team && T[team] ? team : null, nhlTeam: b.nhlTeam ?? null, status: b.status,
    headshot: l.headshot ?? b.headshot, hero: l.heroImage ?? null, birthDate: l.birthDate, birthCity: l.birthCity?.default,
    birthCountry: l.birthCountry, birthState: l.birthStateProvince?.default ?? null, nations: nationsOf(l), height: l.heightInInches, weight: l.weightInPounds, shoots: l.shootsCatches, draft: l.draftDetails ?? null,
    club: club ? `${club.teamName?.default} (${club.leagueAbbrev})` : null,
    clubStat: club ? { season: club.season, gp: club.gamesPlayed ?? 0, g: club.goals ?? 0, a: club.assists ?? 0, p: club.points ?? 0, sv: club.savePctg ?? null, gaa: club.goalsAgainstAvg ?? null } : null,
    active: !!l.isActive, ...nhlSpan(l),
    car: M.career(l, { tx: txBy[b.id] ?? [], injury: injById[b.id] ?? null, posts: posts.filter((x) => x.parsed.players.includes(b.id) && ["injury", "roster"].includes(x.parsed.type)).slice(0, 4), teams: teamsByAbbr }),
  };
});
log(`Player profiles: ${Object.keys(profiles).length}`);

// Contracts and cap space (CapWages), matched to NHL ids by name + birthdate.
log("Contracts: CapWages team pages");
const cw = await C.capwages(league.teams);
const contractById = C.matchContracts(cw, Object.values(profiles).filter((p) => p.status !== "alumni"));
for (const [id, c] of Object.entries(contractById)) profiles[id].contract = { terms: c.terms, termsDetails: c.termsDetails, acquired: c.acquired, team: c.team, group: c.group, list: c.contracts };
for (const t of tx) if (t.kind === "sign" || /signed|agreed to terms/i.test(t.text)) for (const id of t.ids ?? []) {
  const mine = (txBy[id] ?? []).find((x) => x.date === t.date && x.text === t.text && x.kind === "sign");
  const k = mine && C.contractForSigning(contractById[id], mine);
  if (k) { (t.money ??= []).push({ id, aav: k.aav, len: k.len, total: k.total, expiry: k.expiry, elc: k.elc, ext: k.ext }); mine.money = t.money.at(-1); }
}
log(`Contracts: ${Object.keys(contractById).length} matched of ${cw.players.length}; ${tx.filter((t) => t.money).length} signings with money`);

// Records: franchise leaders for each team, all-time NHL leaders, and each player's place in both.
log("Records: franchise + all-time leaders");
const franchise = await nhl.franchiseLeaders(league.teams);
const REC = { skaters: [["pts", "points"], ["g", "goals"], ["a", "assists"], ["gp", "games"]], goalies: [["w", "wins"], ["so", "shutouts"], ["gp", "games"]] };
const rankInto = (list, kind, scope) => {
  for (const [k, label] of REC[kind]) [...list].sort((a, b) => (b[k] ?? 0) - (a[k] ?? 0)).slice(0, 100).forEach((p, i) => {
    if (!profiles[p.id] || !(p[k] > 0)) return;
    (profiles[p.id].records ??= []).push({ scope, stat: label, rank: i + 1, value: p[k] });
  });
};
const allSk = allTime.filter((p) => p.pos !== "G"), allG = allTime.filter((p) => p.pos === "G");
rankInto(allSk, "skaters", "NHL"); rankInto(allG, "goalies", "NHL");
for (const [abbr, f] of Object.entries(franchise)) if (f) { rankInto(f.skaters, "skaters", abbr); rankInto(f.goalies, "goalies", abbr); }
const records = { allSk, allG, franchise };
const injByTeam = {};
for (const i of injuries) (injByTeam[i.team] ??= []).push(i);
const txByTeam = {};
for (const m of tx) (txByTeam[m.team] ??= []).push(m);

log("Draft class: CHL + USHL feeds");
const dc = await draftClass(Math.floor(league.seasonId / 10000) + 1).catch((e) => (console.warn("draft class:", e.message), null));
log(`Draft class: ${dc?.players.length ?? 0} eligible players`);
log("Team stats: NHL reports + expected goals");
const teamStatsData = await teamStats(league, preds.teamXg);
log("Roster stats: advanced skater and goalie reports");
const rosterStatsData = await rosterStats(league.seasonId);
const ctx = { rosterStats: rosterStatsData, teamStats: teamStatsData, draftClass: dc, records, capTeams: cw.teams, site, league, T, rosters, stats, leaders, draft, wjc, people, posts, reported, injuries, injByTeam, injById, scratches, tx, txByTeam, discipline, cup, preds, profiles };

// ---------- pages ----------
log("Rendering");
// Clear the previous build but keep the Vercel project link (.vercel/) and its ignore file, so `vercel deploy` keeps working.
const KEEP = new Set([".vercel", ".vercelignore"]);
for (const f of await fs.readdir(DIST).catch(() => [])) if (!KEEP.has(f)) await fs.rm(path.join(DIST, f), { recursive: true, force: true });
await copyDir(PUBLIC, DIST);
// The gamecenter builder runs in the browser too (same code as the build), so game pages can go live without a rebuild.
await fs.mkdir(path.join(DIST, "assets/core"), { recursive: true });
for (const f of ["game.mjs", "lines.mjs"]) await fs.copyFile(path.join(ROOT, "src/core", f), path.join(DIST, "assets/core", f));
const urls = [];
const put = async (url, html) => { urls.push(url); await write(url.replace(/^\//, "") + "index.html", html); };

await put("/", X.homePage2(ctx));
await put("/injuries/", X.injuriesPage(ctx));
await put("/moves/", X.movesPage(ctx));
await put("/cup/", X.cupPage(ctx));
await put("/predictions/", predictionsPage(ctx));
await write("data/predictions.json", JSON.stringify({ builtAt: site.builtAt, params: preds.params, games: preds.games }));
await put("/nhl/", P.teamsIndex(ctx));
for (const t of Object.values(T)) await put(`/nhl/${t.slug}/`, P.teamPage(ctx, t));
await put("/goalies/", P.goaliesPage(ctx));
await put("/news/", P.newsPage(ctx));
await put("/standings/", P.standingsPage(ctx));
await put("/schedule/", P.schedulePage(ctx));
await put("/stats/", P.statsPage(ctx));
await put("/stats/teams/", teamStatsPage(ctx));
await put("/records/", X.recordsPage(ctx));
await write("player/index.html", X.viewerPage(ctx));
// The mock draft replaces the old prospects page at /prospects/ (the old page is only a fallback if the public lists are missing).
await put("/prospects/", dc?.publicLists ? mockDraftPage(ctx) : P.prospectsPage(ctx));
await put("/prospects/nhl/", nhlProspectsPage(ctx));
// Old mock draft address: send visitors to the new home.
await write("prospects/mock-draft/index.html", `<!doctype html><meta charset="utf-8"><title>Moved</title><link rel="canonical" href="${site.url.replace(/\/$/, "")}/prospects/"><meta http-equiv="refresh" content="0; url=/prospects/"><p><a href="/prospects/">The mock draft is now at /prospects/</a></p>`);
await put("/about/", P.aboutPage(ctx));
for (const p of Object.values(profiles)) await put(`/players/${p.id}/`, X.profilePage(ctx, p));
await put("/wjc/", wjcHub(ctx));
await put("/wjc/bracket/", bracketPage(ctx));
await write("data/wjc-live.json", JSON.stringify({ built: wjc.forecast.built, wikiApi: WIKI_URL, wikiPage: wjc.forecast.resultsSource?.url ?? "https://en.wikipedia.org/wiki/2027_World_Junior_Ice_Hockey_Championships", T: wjc.forecast.T,
  cfg: { teams: wjc.cfg.teams.map((t) => ({ code: t.code, name: t.name, group: t.group, flag: t.flag })), schedule: wjc.cfg.schedule },
  ratings: Object.fromEntries(Object.entries(wjc.forecast.ratings).map(([c, r]) => [c, { rating: r.rating, prior: r.prior, roster: r.roster }])), results: wjc.forecast.results, playoffResults: wjc.forecast.playoffResults }));
await write("data/wjc-forecast.json", JSON.stringify({ built: wjc.forecast.built, sims: wjc.forecast.sims, odds: wjc.forecast.odds, games: wjc.forecast.games, bracket: wjc.forecast.bracket }));
for (const t of Object.values(wjc.teams)) await put(`/wjc/${t.code.toLowerCase()}/`, wjcTeam(ctx, t));

// Gamecenters for every game played this season plus this week's schedule; snapshots for started games.
// Finished games are cached for good, so only the first build pays for them.
const gameById = new Map();
for (const list of Object.values(schedules)) for (const g of list) if (nhl.FINAL.has(g.gameState) && [2, 3].includes(g.gameType)) gameById.set(g.id, g);
for (const g of league.week.gameWeek.flatMap((d) => d.games)) gameById.set(g.id, g);
const weekGames = [...gameById.values()];
log(`Gamecenters: ${weekGames.length}`);
await pool(weekGames, 6, async (g) => {
  let snap = null;
  if (!["FUT", "PRE"].includes(g.gameState)) {
    const final = nhl.FINAL.has(g.gameState);
    const [box, pbp, shifts] = await Promise.all([nhl.boxscore(g.id, final), nhl.playByPlay(g.id, final), nhl.shiftChart(g.id, final)]);
    if (box) snap = gameJson({ box, pbp, shifts });
    if (snap) await write(`data/game/${g.id}.json`, JSON.stringify(snap));
  }
  await put(`/game/${g.id}/`, P.gamePage(ctx, g, snap));
});

// Search index, 404, robots, sitemap.
const search = [
  ...Object.values(T).map((t) => ({ n: t.name, s: t.abbrev, u: `/nhl/${t.slug}/`, k: "Team" })),
  ...wjc.cfg.teams.map((c) => ({ n: `${c.name} (World Juniors)`, s: c.code, u: `/wjc/${c.code.toLowerCase()}/`, k: "WJC" })),
  ...Object.values(profiles).filter((p) => p.status !== "alumni").map((p) => ({ n: `${p.first} ${p.last}`, s: p.team ?? p.nhlTeam ?? "", u: `/players/${p.id}/`, k: p.team ? p.pos : "Prospect", h: p.headshot ?? "" })),
  { n: "Stanley Cup predictor", s: "", u: "/cup/", k: "Team" },
  { n: "Team stats", s: "", u: "/stats/teams/", k: "Team" },
  { n: "NHL prospect pools", s: "", u: "/prospects/nhl/", k: "Team" },
  { n: "2027 NHL mock draft", s: "", u: "/prospects/", k: "Team" },
  { n: "Game predictions", s: "", u: "/predictions/", k: "Team" },
  { n: "World Juniors mock bracket and predictions", s: "WJC", u: "/wjc/bracket/", k: "WJC" },
  { n: "Injuries & scratches", s: "", u: "/injuries/", k: "Team" },
];
await write("search.json", JSON.stringify(search));
await write("version.json", JSON.stringify({ builtAt: site.builtAt }));
// Every player in NHL history, compact: [id, name, years, position, games]. Most-played first so ties rank sensibly.
await write("search-all.json", JSON.stringify(Object.values(profiles).filter((p) => p.status === "alumni").map((p) => [p.id, `${p.first} ${p.last}`, p.yrs ?? "", p.pos, p.car?.regular?.gamesPlayed ?? 0]).sort((a, b) => b[4] - a[4])));
await write("404.html", page({ site, title: "Not found", path: "/404", body: `<section class="hero"><div><h1>Off the ice</h1><p class="lede">That page doesn't exist. Try <a href="/">tonight's games</a> or search above.</p></div></section>` }));
await write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${site.url.replace(/\/$/, "")}/sitemap.xml\n`);
await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${site.url.replace(/\/$/, "")}${u}</loc><lastmod>${site.builtAt.slice(0, 10)}</lastmod></url>`).join("\n")}\n</urlset>\n`);
await write("_headers", `/assets/*\n  Cache-Control: public, max-age=3600\n/data/*\n  Cache-Control: public, max-age=30\n/*\n  Cache-Control: public, max-age=120\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n`);
// Same caching rules for Vercel (which ignores _headers). Later rules win, so the catch-all goes first.
const cc = (v) => [{ key: "Cache-Control", value: `public, max-age=${v}` }];
await write("vercel.json", JSON.stringify({
  cleanUrls: false, trailingSlash: true,
  // Live game data for the browser (the NHL API doesn't allow cross-site requests), proxied through this site.
  rewrites: [
    { source: "/live/score/:date/", destination: "https://api-web.nhle.com/v1/score/:date" },
    { source: "/live/pbp/:id/", destination: "https://api-web.nhle.com/v1/gamecenter/:id/play-by-play" },
    { source: "/live/player/:id/", destination: "https://api-web.nhle.com/v1/player/:id/landing" },
    { source: "/live/box/:id/", destination: "https://api-web.nhle.com/v1/gamecenter/:id/boxscore" },
    { source: "/live/shifts/:id/", destination: "https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=:id" },
    { source: "/live/scorenow/", destination: "https://api-web.nhle.com/v1/score/now" },
    { source: "/live/standings/", destination: "https://api-web.nhle.com/v1/standings/now" },
    { source: "/live/club/:abbr/", destination: "https://api-web.nhle.com/v1/club-stats/:abbr/now" },
    { source: "/live/skater/:report/", destination: "https://api.nhle.com/stats/rest/en/skater/:report" },
    { source: "/live/goalie/:report/", destination: "https://api.nhle.com/stats/rest/en/goalie/:report" },
  ],
  headers: [
    { source: "/(.*)", headers: [...cc(120), { key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }] },
    { source: "/assets/(.*)", headers: cc(3600) },
    { source: "/data/(.*)", headers: cc(30) },
    { source: "/version.json", headers: cc(0) },
    { source: "/live/(.*)", headers: cc(10) },
  ],
}, null, 2));

log(`Done: ${urls.length} pages · requests: ${httpStats.network} network, ${httpStats.cached} cached, ${httpStats.failed} failed`);
