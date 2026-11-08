// One JSON shape for a game, built from NHL box score + play-by-play + shift chart.
// Used for build-time snapshots and by the live worker, so the page renders both the same way.
import { analyze, secs } from "./lines.mjs";

export function gameJson({ box, pbp, shifts }) {
  const a = shifts?.length ? analyze({ shifts, box, plays: pbp?.plays ?? [] }) : null;
  const team = (t) => ({
    id: t.id, abbrev: t.abbrev, name: t.commonName?.default ?? t.abbrev, place: t.placeName?.default ?? "",
    logo: t.logo, darkLogo: t.darkLogo ?? t.logo, score: t.score ?? 0, sog: t.sog ?? 0,
  });
  const away = team(box.awayTeam), home = team(box.homeTeam);
  const sideById = { [box.awayTeam.id]: "away", [box.homeTeam.id]: "home" };

  const players = {};
  for (const side of ["awayTeam", "homeTeam"]) {
    const s = box.playerByGameStats?.[side];
    if (!s) continue;
    for (const grp of ["forwards", "defense", "goalies"]) for (const p of s[grp] ?? []) {
      players[p.playerId] = {
        name: p.name?.default, num: p.sweaterNumber, pos: p.position, side: side === "homeTeam" ? "home" : "away",
        toi: p.toi, g: p.goals ?? 0, a: p.assists ?? 0, pts: p.points ?? 0, sog: p.sog ?? 0, hits: p.hits ?? 0,
        blk: p.blockedShots ?? 0, pm: p.plusMinus ?? 0, fo: p.faceoffWinningPctg ?? null,
        sa: p.shotsAgainst ?? null, sv: p.saves ?? null, svPct: p.savePctg ?? null, starter: !!p.starter,
      };
    }
  }

  // Shots for the rink map: away attacks left, home attacks right.
  const shots = [];
  const periods = {};
  for (const pl of pbp?.plays ?? []) {
    const d = pl.details ?? {};
    const n = pl.periodDescriptor?.number;
    const side = sideById[d.eventOwnerTeamId];
    if (!n || pl.periodDescriptor?.periodType === "SO") continue;
    periods[n] ??= { n, type: pl.periodDescriptor.periodType, away: { sog: 0, g: 0, att: 0 }, home: { sog: 0, g: 0, att: 0 } };
    const type = pl.typeDescKey;
    if (!["shot-on-goal", "goal", "missed-shot", "blocked-shot"].includes(type)) continue;
    const shooter = d.scoringPlayerId ?? d.shootingPlayerId;
    const shootSide = players[shooter]?.side ?? side;
    if (!shootSide) continue;
    periods[n][shootSide].att++;
    if (type === "shot-on-goal" || type === "goal") periods[n][shootSide].sog++;
    if (type === "goal") periods[n][shootSide].g++;
    if (d.xCoord == null || type === "blocked-shot") continue;
    let x = d.xCoord, y = d.yCoord ?? 0;
    if ((shootSide === "home" && x < 0) || (shootSide === "away" && x > 0)) { x = -x; y = -y; }
    shots.push({ x, y, side: shootSide, type, p: n, t: pl.timeInPeriod, by: shooter, st: d.shotType ?? null });
  }

  // Scoring and penalty summaries. situationCode = away goalie, away skaters, home skaters, home goalie.
  const goals = [], penalties = [];
  for (const pl of pbp?.plays ?? []) {
    const d = pl.details ?? {}, pd = pl.periodDescriptor ?? {};
    const side = sideById[d.eventOwnerTeamId];
    if (pl.typeDescKey === "goal" && side) {
      const c = String(pl.situationCode ?? "1551").padStart(4, "0");
      const [ag, as, hs, hg] = [...c].map(Number);
      const us = side === "away" ? as : hs, them = side === "away" ? hs : as, oppGoalie = side === "away" ? hg : ag;
      const str = pd.periodType === "SO" ? "SO" : !oppGoalie ? "EN" : us > them ? "PP" : us < them ? "SH" : "EV";
      goals.push({
        p: pd.number, type: pd.periodType, t: pl.timeInPeriod, side, str,
        by: d.scoringPlayerId, byTot: d.scoringPlayerTotal ?? null,
        a1: d.assist1PlayerId ?? null, a1Tot: d.assist1PlayerTotal ?? null, a2: d.assist2PlayerId ?? null, a2Tot: d.assist2PlayerTotal ?? null,
        shot: d.shotType ?? null, away: d.awayScore ?? 0, home: d.homeScore ?? 0, clip: d.highlightClipSharingUrl ?? null, vid: d.highlightClip ?? d.discreteClip ?? null,
      });
    } else if (pl.typeDescKey === "penalty" && side) {
      penalties.push({ p: pd.number, type: pd.periodType, t: pl.timeInPeriod, side, by: d.committedByPlayerId ?? d.servedByPlayerId ?? null, min: d.duration ?? null, what: (d.descKey ?? "").replace(/-/g, " ") });
    }
  }

  const lastPlay = pbp?.plays?.at(-1);
  return {
    id: box.id, state: box.gameState, startUTC: box.startTimeUTC, date: box.gameDate,
    venue: box.venue?.default ?? "", period: box.periodDescriptor?.number ?? null, periodType: box.periodDescriptor?.periodType ?? null,
    clock: box.clock?.timeRemaining ?? null, intermission: !!box.clock?.inIntermission, running: !!box.clock?.running,
    outcome: box.gameOutcome?.lastPeriodType ?? null,
    away, home, players,
    lines: a ? { away: strip(a.away), home: strip(a.home) } : null,
    linesThrough: a ? a.dataThrough : 0,
    playsThrough: lastPlay ? (lastPlay.periodDescriptor.number - 1) * 1200 + secs(lastPlay.timeInPeriod) : 0,
    shots, periods: Object.values(periods).sort((x, y) => x.n - y.n), goals, penalties,
    season: box.season ?? Number(`${String(box.id).slice(0, 4)}${Number(String(box.id).slice(0, 4)) + 1}`),
    updated: new Date().toISOString(),
  };
}

const strip = (t) => ({ toi: t.toi, lines: t.lines, pairs: t.pairs, pp: t.pp, pk: t.pk, extras: t.extras, byPeriod: t.byPeriod, goalie: t.goalie });
