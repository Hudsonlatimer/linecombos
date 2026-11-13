// Season stats for every skater and goalie, beyond the counting-stats summary:
// 5v5 shot share, on-ice percentages, scoring rates, special teams, faceoffs, hits and goalie splits.
import { get } from "./http.mjs";

const API = "https://api.nhle.com/stats/rest/en";
const SKATER_REPORTS = ["realtime", "percentages", "scoringRates", "timeonice", "faceoffpercentages", "powerplay", "penaltykill", "penalties", "goalsForAgainst"];
const GOALIE_REPORTS = ["advanced", "savesByStrength"];

// label, path (report.field), format, tooltip
const C = (l, p, f, t = "") => ({ l, p, f, t });

export const SKATER_TABS = [
  ["scoring", "Scoring", [
    C("GP", "summary.gamesPlayed", "n0"),
    C("G", "summary.goals", "n0"),
    C("A", "summary.assists", "n0"),
    C("P", "summary.points", "n0"),
    C("P/GP", "summary.pointsPerGame", "n2"),
    C("+/-", "summary.plusMinus", "s0"),
    C("PIM", "summary.penaltyMinutes", "n0"),
    C("PPG", "summary.ppGoals", "n0"),
    C("SHG", "summary.shGoals", "n0"),
    C("GWG", "summary.gameWinningGoals", "n0"),
    C("SOG", "summary.shots", "n0"),
    C("SH%", "summary.shootingPct", "p1"),
    C("TOI", "summary.timeOnIcePerGame", "sec", "Average time on ice per game"),
  ]],
  ["advanced", "Advanced", [
    C("TOI 5v5", "percentages.timeOnIcePerGame5v5", "sec"),
    C("CF%", "percentages.satPercentage", "p1", "Shot-attempt share at 5-on-5 (Corsi). Above 50% means his team shoots more while he is on the ice."),
    C("CF% rel", "percentages.satRelative", "sp1", "His Corsi compared with his teammates. Positive means the team controls play more with him on the ice."),
    C("FF%", "percentages.usatPercentage", "p1", "Unblocked shot-attempt share at 5-on-5 (Fenwick)."),
    C("CF% close", "percentages.satPercentageClose", "p1", "Corsi when the game is within a goal early or tied in the third. Strips out score effects."),
    C("OZS%", "percentages.zoneStartPct5v5", "p1", "Share of 5-on-5 zone starts that come in the offensive zone."),
    C("GF%", "goalsForAgainst.evenStrengthGoalsForPct", "p1", "Share of even-strength goals that his team scores while he is on the ice."),
    C("S% 5v5", "percentages.shootingPct5v5", "p1"),
    C("On-ice SV%", "percentages.skaterSavePct5v5", "d3", "His goalie's save percentage while he is on the ice at 5-on-5."),
    C("PDO", "percentages.skaterShootingPlusSavePct5v5", "d3", "On-ice shooting percentage plus on-ice save percentage. Far from 1.000 usually means luck."),
    C("G/60", "scoringRates.goalsPer605v5", "n2", "Goals per 60 minutes at 5-on-5."),
    C("A/60", "scoringRates.assistsPer605v5", "n2"),
    C("P/60", "scoringRates.pointsPer605v5", "n2"),
    C("A1/60", "scoringRates.primaryAssistsPer605v5", "n2", "Primary assists per 60 minutes at 5-on-5."),
  ]],
  ["special", "Special teams", [
    C("PP TOI", "powerplay.ppTimeOnIcePerGame", "sec"),
    C("PP G", "powerplay.ppGoals", "n0"),
    C("PP A", "powerplay.ppAssists", "n0"),
    C("PP P", "powerplay.ppPoints", "n0"),
    C("PP P/60", "powerplay.ppPointsPer60", "n2"),
    C("PP SH%", "powerplay.ppShootingPct", "p1"),
    C("PK TOI", "penaltykill.shTimeOnIcePerGame", "sec"),
    C("SH G", "penaltykill.shGoals", "n0"),
    C("SH P", "penaltykill.shPoints", "n0"),
    C("SH P/60", "penaltykill.shPointsPer60", "n2"),
    C("PK GA/60", "penaltykill.ppGoalsAgainstPer60", "n2", "Power-play goals against per 60 minutes while he is killing a penalty."),
  ]],
  ["physical", "Physical", [
    C("Hits", "realtime.hits", "n0"),
    C("Hits/60", "realtime.hitsPer60", "n1"),
    C("Blocks", "realtime.blockedShots", "n0"),
    C("Blk/60", "realtime.blockedShotsPer60", "n1"),
    C("Give", "realtime.giveaways", "n0"),
    C("Give/60", "realtime.giveawaysPer60", "n1"),
    C("Take", "realtime.takeaways", "n0"),
    C("Take/60", "realtime.takeawaysPer60", "n1"),
    C("Drawn/60", "penalties.penaltiesDrawnPer60", "n2"),
    C("Taken/60", "penalties.penaltiesTakenPer60", "n2"),
    C("Net/60", "penalties.netPenaltiesPer60", "s2", "Penalties drawn minus penalties taken, per 60. Positive means he draws more than he takes."),
  ]],
  ["faceoffs", "Faceoffs", [
    C("FO%", "faceoffpercentages.faceoffWinPct", "p1"),
    C("FO", "faceoffpercentages.totalFaceoffs", "n0"),
    C("OZ%", "faceoffpercentages.offensiveZoneFaceoffPct", "p1"),
    C("DZ%", "faceoffpercentages.defensiveZoneFaceoffPct", "p1"),
    C("NZ%", "faceoffpercentages.neutralZoneFaceoffPct", "p1"),
    C("EV%", "faceoffpercentages.evFaceoffPct", "p1"),
    C("PP%", "faceoffpercentages.ppFaceoffPct", "p1"),
    C("SH%", "faceoffpercentages.shFaceoffPct", "p1"),
  ]],
];

export const GOALIE_COLS = [
  C("GP", "summary.gamesPlayed", "n0"),
  C("GS", "summary.gamesStarted", "n0"),
  C("W", "summary.wins", "n0"),
  C("L", "summary.losses", "n0"),
  C("OTL", "summary.otLosses", "n0"),
  C("SV%", "summary.savePct", "d3"),
  C("GAA", "summary.goalsAgainstAverage", "n2"),
  C("SO", "summary.shutouts", "n0"),
  C("SA", "summary.shotsAgainst", "n0"),
  C("QS%", "advanced.qualityStartsPct", "p1", "Share of starts that were a quality start."),
  C("EV SV%", "savesByStrength.evSavePct", "d3"),
  C("PP SV%", "savesByStrength.ppSavePct", "d3"),
  C("SH SV%", "savesByStrength.shSavePct", "d3"),
  C("SA/60", "advanced.shotsAgainstPer60", "n1"),
];

/** A number from a report bag, or null when the report or field is missing. */
export function pick(bag, path) {
  const [report, field] = path.split(".");
  const v = bag?.[report]?.[field];
  return Number.isFinite(v) ? v : null;
}

/** Format a roster stat. Ratios (shooting, Corsi, faceoffs) are 0–1. */
export function fmt(f, v) {
  if (v == null || Number.isNaN(v)) return "—";
  switch (f) {
    case "n0": return String(Math.round(v));
    case "n1": return v.toFixed(1);
    case "n2": return v.toFixed(2);
    case "s0": return `${v > 0 ? "+" : ""}${Math.round(v)}`;
    case "s2": return `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
    case "p1": return `${(v * 100).toFixed(1)}%`;
    case "sp1": return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
    case "d3": return v.toFixed(3).replace(/^0\./, ".");
    case "sec": return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`;
    default: return String(v);
  }
}

async function reports(kind, names, seasonId) {
  const out = {};
  await Promise.all(names.map(async (name) => {
    const url = `${API}/${kind}/${name}?limit=-1&cayenneExp=seasonId=${seasonId}%20and%20gameTypeId=2`;
    const j = await get(url, { ttl: 600 }).catch(() => null);
    for (const row of j?.data ?? []) (out[row.playerId] ??= {})[name] = row;
  }));
  return out;
}

/** → { skaters: { [playerId]: { report: row } }, goalies: { [playerId]: { report: row } } } */
export async function rosterStats(seasonId) {
  const [skaters, goalies] = await Promise.all([
    reports("skater", SKATER_REPORTS, seasonId),
    reports("goalie", GOALIE_REPORTS, seasonId),
  ]);
  return { skaters, goalies };
}
