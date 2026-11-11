// Full and advanced team stats: the NHL's own team reports (special teams, faceoffs by zone, 5v5 shot attempts, shooting and
// save %, hits, penalties, scoring by strength) plus expected goals from our shot model. Every stat gets a league rank.
import { get } from "./http.mjs";
import { normName } from "./moves.mjs";

const API = "https://api.nhle.com/stats/rest/en/team";
const REPORTS = ["summary", "powerplay", "penaltykill", "faceoffpercentages", "percentages", "realtime", "penalties", "scoretrailfirst", "goalsforbystrength", "goalsagainstbystrength", "shootout"];

// k key, l label, g group, f format, d direction (1 higher is better, -1 lower is better, 0 not ranked), v value from the data bag, t tooltip
const M = (k, l, g, f, d, v, t = "") => ({ k, l, g, f, d, v, t });
const per = (a, b) => (a != null && b ? a / b : null);
export const GROUPS = [
  ["overview", "Overview"], ["advanced", "Advanced (5v5 and expected goals)"], ["special", "Special teams"], ["faceoffs", "Faceoffs"],
  ["physical", "Puck and physical"], ["discipline", "Discipline"], ["situations", "Game situations"], ["strength", "Goals by strength"],
];
export const METRICS = [
  M("gp", "Games", "overview", "n0", 0, (b) => b.s.gamesPlayed),
  M("pts", "Points", "overview", "n0", 1, (b) => b.s.points),
  M("ptpct", "Points %", "overview", "p1", 1, (b) => b.s.pointPct),
  M("row", "Regulation + OT wins", "overview", "n0", 1, (b) => b.s.regulationAndOtWins),
  M("gf", "Goals for per game", "overview", "n2", 1, (b) => b.s.goalsForPerGame),
  M("ga", "Goals against per game", "overview", "n2", -1, (b) => b.s.goalsAgainstPerGame),
  M("gd", "Goal differential per game", "overview", "s2", 1, (b) => b.s.goalsForPerGame - b.s.goalsAgainstPerGame),
  M("sf", "Shots for per game", "overview", "n1", 1, (b) => b.s.shotsForPerGame),
  M("sa", "Shots against per game", "overview", "n1", -1, (b) => b.s.shotsAgainstPerGame),
  M("sd", "Shot differential per game", "overview", "s1", 1, (b) => b.s.shotsForPerGame - b.s.shotsAgainstPerGame),
  M("so", "Shutouts", "overview", "n0", 1, (b) => b.s.teamShutouts),

  M("sat", "Shot attempts % (Corsi, 5v5)", "advanced", "p1", 1, (b) => b.pc.satPct, "Share of all shot attempts, both teams, at 5v5. Above 50% means the team has the puck more."),
  M("usat", "Unblocked attempts % (Fenwick, 5v5)", "advanced", "p1", 1, (b) => b.pc.usatPct),
  M("satclose", "Shot attempts %, close games", "advanced", "p1", 1, (b) => b.pc.satPctClose, "Within a goal in the 1st or 2nd period, or tied in the 3rd. Strips out score effects."),
  M("sattied", "Shot attempts %, tied", "advanced", "p1", 1, (b) => b.pc.satPctTied),
  M("zs", "Offensive zone starts % (5v5)", "advanced", "p1", 0, (b) => b.pc.zoneStartPct5v5),
  M("gfpct", "Goals for % (5v5)", "advanced", "p1", 1, (b) => b.pc.goalsForPct),
  M("sh5", "Shooting % (5v5)", "advanced", "p1", 1, (b) => b.pc.shootingPct5v5),
  M("sv5", "Save % (5v5)", "advanced", "d3", 1, (b) => b.pc.savePct5v5),
  M("pdo", "PDO (5v5)", "advanced", "d3", 0, (b) => b.pc.shootingPlusSavePct5v5, "Shooting % plus save %. Far from 1.000 usually means luck, and it tends to drift back."),
  M("xgf", "Expected goals for per game", "advanced", "n2", 1, (b) => b.x && b.x.xgf / b.x.gp, "Our shot-quality model: the chance each unblocked shot scores, from distance, angle, type, rebounds and rushes."),
  M("xga", "Expected goals against per game", "advanced", "n2", -1, (b) => b.x && b.x.xga / b.x.gp),
  M("xgpct", "Expected goals % (all situations)", "advanced", "p1", 1, (b) => b.x && b.x.xgf / (b.x.xgf + b.x.xga)),
  M("xgf5", "Expected goals for per game (5v5)", "advanced", "n2", 1, (b) => b.x && b.x.xgf5 / b.x.gp),
  M("xga5", "Expected goals against per game (5v5)", "advanced", "n2", -1, (b) => b.x && b.x.xga5 / b.x.gp),
  M("xgpct5", "Expected goals % (5v5)", "advanced", "p1", 1, (b) => b.x && b.x.xgf5 / (b.x.xgf5 + b.x.xga5)),
  M("gax", "Goals above expected per game (offence)", "advanced", "s2", 1, (b) => b.x && (b.x.gf - b.x.xgf) / b.x.gp, "Goals scored minus the goals the shots should have scored. Positive means finishing above expectation."),
  M("gsax", "Goals saved above expected per game", "advanced", "s2", 1, (b) => b.x && (b.x.xga - b.x.ga) / b.x.gp, "Goals the team should have allowed minus goals it did allow. Credit to goaltending and defence."),
  M("xgps", "Shot quality for (xG per unblocked attempt)", "advanced", "d3", 1, (b) => b.x && b.x.xgf / b.x.ff),
  M("xgpsa", "Shot quality against (xG per unblocked attempt)", "advanced", "d3", -1, (b) => b.x && b.x.xga / b.x.fa),
  M("ff", "Unblocked attempts for per game", "advanced", "n1", 1, (b) => b.x && b.x.ff / b.x.gp),
  M("fa", "Unblocked attempts against per game", "advanced", "n1", -1, (b) => b.x && b.x.fa / b.x.gp),

  M("pp", "Power play %", "special", "p1", 1, (b) => b.s.powerPlayPct),
  M("ppnet", "Power play % (net of shorthanded goals)", "special", "p1", 1, (b) => b.s.powerPlayNetPct),
  M("ppopp", "Power plays per game", "special", "n2", 1, (b) => b.pp.ppOpportunitiesPerGame),
  M("ppg", "Power play goals per game", "special", "n2", 1, (b) => b.pp.ppGoalsPerGame),
  M("pptoi", "Power play time per game", "special", "sec", 1, (b) => b.pp.ppTimeOnIcePerGame),
  M("shga", "Shorthanded goals against", "special", "n0", -1, (b) => b.pp.shGoalsAgainst),
  M("pk", "Penalty kill %", "special", "p1", 1, (b) => b.s.penaltyKillPct),
  M("pknet", "Penalty kill % (net of shorthanded goals)", "special", "p1", 1, (b) => b.s.penaltyKillNetPct),
  M("tsh", "Times shorthanded per game", "special", "n2", -1, (b) => b.pk.timesShorthandedPerGame),
  M("ppga", "Power play goals against per game", "special", "n2", -1, (b) => b.pk.ppGoalsAgainstPerGame),
  M("pktoi", "Penalty kill time per game", "special", "sec", -1, (b) => b.pk.pkTimeOnIcePerGame),
  M("shgf", "Shorthanded goals for", "special", "n0", 1, (b) => b.pk.shGoalsFor),

  M("fo", "Faceoff %", "faceoffs", "p1", 1, (b) => b.fo.faceoffWinPct),
  M("foo", "Offensive zone faceoff %", "faceoffs", "p1", 1, (b) => b.fo.offensiveZoneFaceoffPct),
  M("fod", "Defensive zone faceoff %", "faceoffs", "p1", 1, (b) => b.fo.defensiveZoneFaceoffPct),
  M("fon", "Neutral zone faceoff %", "faceoffs", "p1", 1, (b) => b.fo.neutralZoneFaceoffPct),
  M("foev", "Even strength faceoff %", "faceoffs", "p1", 1, (b) => b.fo.evFaceoffPct),
  M("fopp", "Power play faceoff %", "faceoffs", "p1", 1, (b) => b.fo.ppFaceoffPct),
  M("fosh", "Shorthanded faceoff %", "faceoffs", "p1", 1, (b) => b.fo.shFaceoffPct),
  M("fot", "Faceoffs taken", "faceoffs", "n0", 0, (b) => b.fo.totalFaceoffs),

  M("hit", "Hits per 60", "physical", "n1", 0, (b) => b.rt.hitsPer60),
  M("blk", "Blocked shots per 60", "physical", "n1", 0, (b) => b.rt.blockedShotsPer60),
  M("give", "Giveaways per 60", "physical", "n1", -1, (b) => b.rt.giveawaysPer60),
  M("take", "Takeaways per 60", "physical", "n1", 1, (b) => b.rt.takeawaysPer60),
  M("tkgv", "Takeaway to giveaway ratio", "physical", "d2", 1, (b) => per(b.rt.takeaways, b.rt.giveaways)),
  M("miss", "Missed shots per game", "physical", "n1", 0, (b) => per(b.rt.missedShots, b.rt.gamesPlayed)),
  M("en", "Empty-net goals for", "physical", "n0", 0, (b) => b.rt.emptyNetGoals),

  M("pim", "Penalty minutes per game", "discipline", "n1", -1, (b) => per(b.pen.penaltyMinutes, b.pen.gamesPlayed)),
  M("pen60", "Penalties taken per 60", "discipline", "n2", -1, (b) => b.pen.penaltiesTakenPer60),
  M("drawn60", "Penalties drawn per 60", "discipline", "n2", 1, (b) => b.pen.penaltiesDrawnPer60),
  M("net60", "Net penalties per 60", "discipline", "s2", 1, (b) => b.pen.netPenaltiesPer60, "Drawn minus taken. Positive means the team gets more power plays than it gives."),
  M("maj", "Major penalties", "discipline", "n0", -1, (b) => b.pen.majors),

  M("wsf", "Win % when scoring first", "situations", "p1", 1, (b) => b.st.winPctScoringFirst),
  M("wtf", "Win % when trailing first", "situations", "p1", 1, (b) => b.st.winPctTrailingFirst),
  M("sfg", "Games scoring first", "situations", "n0", 0, (b) => b.st.scoringFirstGamesPlayed),
  M("sow", "Shootout wins", "situations", "n0", 0, (b) => b.so.shootoutWins),
  M("sosh", "Shootout shooting %", "situations", "p1", 1, (b) => b.so.shootoutShootingPct),
  M("sosv", "Shootout save %", "situations", "p1", 1, (b) => b.so.shootoutSavePct),

  M("gf5", "5v5 goals for", "strength", "n0", 1, (b) => b.gfs.goalsFor5On5),
  M("ga5", "5v5 goals against", "strength", "n0", -1, (b) => b.gas.goalsAgainst5On5),
  M("gfpp", "Goals for on the power play (5v4)", "strength", "n0", 1, (b) => b.gfs.goalsFor5On4),
  M("gapk", "Goals against shorthanded (4v5)", "strength", "n0", -1, (b) => b.gas.goalsAgainst4On5),
  M("gf33", "3v3 goals for", "strength", "n0", 0, (b) => b.gfs.goalsFor3On3),
  M("ga33", "3v3 goals against", "strength", "n0", 0, (b) => b.gas.goalsAgainst3On3),
  M("gfen", "Empty-net goals for", "strength", "n0", 0, (b) => b.gfs.goalsForEmptyNet),
  M("gaen", "Empty-net goals against", "strength", "n0", 0, (b) => b.gas.goalsAgainstEmptyNet),
  M("gfex", "Goals for with the goalie pulled", "strength", "n0", 0, (b) => b.gfs.goalsForExtraAttacker),
];

/** Format a value by its type. */
export function fmt(f, v) {
  if (v == null || Number.isNaN(v)) return "—";
  switch (f) {
    case "n0": return String(Math.round(v));
    case "n1": return v.toFixed(1);
    case "n2": return v.toFixed(2);
    case "s1": return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
    case "s2": return `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
    case "p1": return `${(v * 100).toFixed(1)}%`;
    case "d2": return v.toFixed(2);
    case "d3": return v.toFixed(3).replace(/^0\./, ".");
    case "sec": return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`;
    default: return String(v);
  }
}

/** → { byAbbr: { abbr: { key: { v, rank } } }, avg: { key }, best: { key }, n } */
export async function teamStats(league, teamXg = {}) {
  const season = league.seasonId;
  const data = {};
  await Promise.all(REPORTS.map(async (r) => {
    const j = await get(`${API}/${r}?cayenneExp=seasonId=${season}%20and%20gameTypeId=2&limit=-1`, { ttl: 600 }).catch(() => null);
    data[r] = Object.fromEntries((j?.data ?? []).map((x) => [normName(x.teamFullName), x]));
  }));
  const bags = {};
  for (const t of league.teams) {
    const k = normName(t.name);
    bags[t.abbrev] = { s: data.summary[k] ?? {}, pp: data.powerplay[k] ?? {}, pk: data.penaltykill[k] ?? {}, fo: data.faceoffpercentages[k] ?? {}, pc: data.percentages[k] ?? {}, rt: data.realtime[k] ?? {},
      pen: data.penalties[k] ?? {}, st: data.scoretrailfirst[k] ?? {}, so: data.shootout[k] ?? {}, gfs: data.goalsforbystrength[k] ?? {}, gas: data.goalsagainstbystrength[k] ?? {}, x: teamXg[t.abbrev] ?? null };
  }
  const byAbbr = Object.fromEntries(Object.keys(bags).map((a) => [a, {}])), avg = {}, best = {};
  for (const m of METRICS) {
    const vals = Object.entries(bags).map(([a, b]) => { let v = null; try { v = m.v(b); } catch {} return [a, Number.isFinite(v) ? v : null]; });
    const ok = vals.filter(([, v]) => v != null);
    const sorted = [...ok].sort((x, y) => (m.d === -1 ? x[1] - y[1] : y[1] - x[1]));
    for (const [a, v] of vals) byAbbr[a][m.k] = { v, rank: m.d && v != null ? sorted.findIndex(([x]) => x === a) + 1 : null };
    avg[m.k] = ok.length ? ok.reduce((s, [, v]) => s + v, 0) / ok.length : null;
    best[m.k] = m.d && sorted.length ? sorted[0][1] : null;
  }
  return { byAbbr, avg, best, n: league.teams.length };
}
