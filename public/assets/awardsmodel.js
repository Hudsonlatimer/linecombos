// NHL awards races. Pure maths, no network: the build feeds it the league's stat rows.
//
// Two kinds of award:
//  - Stat races (Art Ross, Rocket Richard, Presidents' Trophy, Jennings): the exact leaders, with the NHL's own tiebreakers.
//  - Voted awards (Hart, Lindsay, Norris, Vezina, Calder, Selke, Byng): a model estimate of who a voter would favour.
//    It is NOT the voters' opinion or betting odds. Early in the season the rates are shrunk toward the league average
//    so a short hot streak can't lead, and players must have played a fair share of their team's games.

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))) || 1; };
const lastTeam = (s) => String(s ?? "").split(",").pop();

/** Share of the contenders' combined strength: a softmax over the scores, so the shares add to 100%. */
export function shares(scores, tau = 0.8) {
  const top = Math.max(...scores);
  const e = scores.map((s) => Math.exp((s - top) / tau));
  const t = e.reduce((s, x) => s + x, 0);
  return e.map((x) => x / t);
}

/** A player's rate (per game) pulled toward the league rate until he has `k` games of evidence. */
export const shrink = (total, gp, lg, k) => (total + k * lg) / (gp + k);

const standardise = (items, get) => {
  const v = items.map(get), m = mean(v), s = sd(v);
  return new Map(items.map((it, i) => [it, (v[i] - m) / s]));
};

/**
 * @param skaters  rows of skater/summary, each with `isRookie` (boolean) and optional `adv` ({ satRelative, takeaways, toi5v5 })
 * @param goalies  rows of goalie/summary, each with `isRookie`
 * @param teams    { [abbrev]: { gp, pts, ptsPct, rw, ga } }
 */
export function awardRaces({ skaters, goalies, teams }) {
  const gpTeam = Math.max(1, Math.round(mean(Object.values(teams).map((t) => t.gp))));
  const teamBoost = (abbrev) => {
    const t = teams[abbrev];
    return t ? Math.max(-1.5, Math.min(1.5, (t.ptsPct - 0.5) / 0.1)) : 0;
  };
  const pool = skaters.filter((s) => s.gamesPlayed >= Math.max(3, Math.round(gpTeam * 0.5)));
  const lgPG = mean(pool.map((s) => s.points / s.gamesPlayed));
  const rate = (s) => shrink(s.points, s.gamesPlayed, lgPG, 6);
  const zRate = standardise(pool, rate);
  const zToi = standardise(pool, (s) => s.timeOnIcePerGame ?? 0);

  const gpool = goalies.filter((g) => g.gamesPlayed >= Math.max(3, Math.round(gpTeam * 0.3)));
  const lgSv = goalies.reduce((s, g) => s + g.saves, 0) / Math.max(1, goalies.reduce((s, g) => s + g.shotsAgainst, 0));
  const svS = (g) => shrink(g.saves, g.shotsAgainst, lgSv, 400); // save % with 400 shots of league average mixed in
  const gsaa = (g) => g.saves - g.shotsAgainst * lgSv;
  const zSv = standardise(gpool, svS), zG = standardise(gpool, gsaa), zW = standardise(gpool, (g) => g.wins);
  const vezScore = (g) => 0.55 * zSv.get(g) + 0.3 * zG.get(g) + 0.15 * zW.get(g);

  const skName = (s) => s.skaterFullName, gName = (g) => g.goalieFullName;
  const sk = (s, score, line) => ({ id: s.playerId, name: skName(s), team: lastTeam(s.teamAbbrevs), pos: s.positionCode, score, line });
  const gk = (g, score, line) => ({ id: g.playerId, name: gName(g), team: lastTeam(g.teamAbbrevs), pos: "G", score, line });
  const sline = (s) => `${s.gamesPlayed} GP · ${s.goals} G · ${s.assists} A · ${s.points} P`;
  const gline = (g) => `${g.gamesPlayed} GP · ${g.wins} W · ${(g.savePct ?? 0).toFixed(3).replace(/^0/, "")} SV% · ${(g.goalsAgainstAverage ?? 0).toFixed(2)} GAA${g.shutouts ? ` · ${g.shutouts} SO` : ""}`;
  const finish = (list, n = 6) => {
    const top = list.sort((a, b) => b.score - a.score).slice(0, n);
    const sh = shares(top.map((c) => c.score));
    return top.map((c, i) => ({ ...c, share: sh[i] }));
  };

  // ---- voted awards (model estimates) ----
  const hartSk = pool.map((s) => sk(s, zRate.get(s) + 0.3 * teamBoost(lastTeam(s.teamAbbrevs)) + 0.1 * zToi.get(s), sline(s)));
  const hartG = gpool.map((g) => gk(g, 0.8 * vezScore(g) + 0.3 * teamBoost(lastTeam(g.teamAbbrevs)), gline(g)));
  const hart = finish([...hartSk, ...hartG]);
  const lindsay = finish([...pool.map((s) => sk(s, zRate.get(s) + 0.1 * zToi.get(s), sline(s))), ...gpool.map((g) => gk(g, 0.8 * vezScore(g), gline(g)))]);

  const dPool = pool.filter((s) => s.positionCode === "D");
  const dRate = standardise(dPool, rate), dToi = standardise(dPool, (s) => s.timeOnIcePerGame ?? 0);
  const norris = finish(dPool.map((s) => sk(s, 0.65 * dRate.get(s) + 0.3 * dToi.get(s) + 0.15 * teamBoost(lastTeam(s.teamAbbrevs)), `${sline(s)} · ${Math.floor((s.timeOnIcePerGame ?? 0) / 60)}:${String(Math.round((s.timeOnIcePerGame ?? 0) % 60)).padStart(2, "0")} TOI`)));

  const vezina = finish(gpool.map((g) => gk(g, vezScore(g), gline(g))));

  // Rookies need fewer games to be counted: a rookie who has played a third of the schedule is a real candidate.
  const rkS = skaters.filter((s) => s.isRookie && s.gamesPlayed >= Math.max(3, Math.round(gpTeam * 0.35)));
  const rkG = goalies.filter((g) => g.isRookie && g.gamesPlayed >= Math.max(3, Math.round(gpTeam * 0.2)));
  const calder = finish([
    ...rkS.map((s) => sk(s, (rate(s) - lgPG) / sd(pool.map(rate)) + 0.1 * teamBoost(lastTeam(s.teamAbbrevs)), sline(s))),
    ...rkG.map((g) => gk(g, 0.8 * ((svS(g) - lgSv) / sd(gpool.map(svS))), gline(g))),
  ]);

  // Selke: a forward-only proxy built from shot-share relative to his team, ice time, takeaways and faceoffs.
  const fPool = pool.filter((s) => s.positionCode !== "D" && s.positionCode !== "G" && s.adv);
  const zRel = standardise(fPool, (s) => s.adv.satRelative ?? 0), zTk = standardise(fPool, (s) => (s.adv.takeaways ?? 0) / s.gamesPlayed), zFt = standardise(fPool, (s) => s.timeOnIcePerGame ?? 0);
  const selke = finish(fPool.map((s) => sk(s, 0.4 * zRel.get(s) + 0.25 * zTk.get(s) + 0.2 * zFt.get(s) + 0.25 * (s.positionCode === "C" && s.faceoffWinPct != null ? (s.faceoffWinPct - 0.5) / 0.04 : 0) + 0.1 * teamBoost(lastTeam(s.teamAbbrevs)),
    `${s.gamesPlayed} GP · ${s.adv.satRelative != null ? `${s.adv.satRelative >= 0 ? "+" : ""}${(s.adv.satRelative * 100).toFixed(1)}% rel CF` : ""} · ${s.adv.takeaways ?? 0} TK${s.positionCode === "C" && s.faceoffWinPct != null ? ` · ${(s.faceoffWinPct * 100).toFixed(1)}% FO` : ""}`)));

  // Lady Byng: points rate, minus a penalty for penalty minutes.
  const zPim = standardise(pool, (s) => s.penaltyMinutes / s.gamesPlayed);
  const byng = finish(pool.map((s) => sk(s, zRate.get(s) - 0.9 * Math.max(0, zPim.get(s) + 0.3), `${sline(s)} · ${s.penaltyMinutes} PIM`)));

  // ---- stat races (exact) ----
  const best = (rows, cmp, n = 5) => rows.slice().sort(cmp).slice(0, n);
  const artRoss = best(skaters, (a, b) => b.points - a.points || b.goals - a.goals || a.gamesPlayed - b.gamesPlayed)
    .map((s) => ({ id: s.playerId, name: skName(s), team: lastTeam(s.teamAbbrevs), pos: s.positionCode, value: s.points, pace: Math.round((s.points / s.gamesPlayed) * 82), line: `${s.gamesPlayed} GP · ${s.goals} G · ${s.assists} A` }));
  const richard = best(skaters, (a, b) => b.goals - a.goals || a.gamesPlayed - b.gamesPlayed || b.shots - a.shots)
    .map((s) => ({ id: s.playerId, name: skName(s), team: lastTeam(s.teamAbbrevs), pos: s.positionCode, value: s.goals, pace: Math.round((s.goals / s.gamesPlayed) * 82), line: `${s.gamesPlayed} GP · ${s.shots} shots · ${((s.shootingPct ?? 0) * 100).toFixed(1)} SH%` }));
  const tl = Object.entries(teams).map(([abbrev, t]) => ({ abbrev, ...t }));
  const presidents = tl.slice().sort((a, b) => b.ptsPct - a.ptsPct || b.pts - a.pts || b.rw - a.rw).slice(0, 5)
    .map((t) => ({ team: t.abbrev, value: t.pts, pace: Math.round(t.ptsPct * 164), line: `${t.gp} GP · ${(t.ptsPct * 100).toFixed(1)}% of points` }));
  const jennings = tl.filter((t) => t.gp > 0).slice().sort((a, b) => a.ga / a.gp - b.ga / b.gp).slice(0, 5)
    .map((t) => ({ team: t.abbrev, value: +(t.ga / t.gp).toFixed(2), pace: Math.round((t.ga / t.gp) * 82), line: `${t.ga} goals against in ${t.gp} GP` }));

  return {
    gpTeam,
    voted: { hart, lindsay, norris, vezina, calder, selke, byng },
    races: { artRoss, richard, presidents, jennings },
  };
}

export const AWARDS = [
  { k: "hart", name: "Hart Trophy", sub: "Most valuable player", note: "Points rate, team success and ice time. Goalies count too." },
  { k: "vezina", name: "Vezina Trophy", sub: "Best goaltender", note: "Save % (small samples pulled to average), goals saved above average, wins." },
  { k: "norris", name: "Norris Trophy", sub: "Best defenceman", note: "Points rate, ice time and team success among defencemen." },
  { k: "calder", name: "Calder Trophy", sub: "Rookie of the year", note: "Rookies only (NHL's rookie list). Production against the whole league." },
  { k: "selke", name: "Selke Trophy", sub: "Best defensive forward", note: "A rough proxy: shot share relative to teammates, takeaways, ice time and faceoffs. Defence is hard to measure." },
  { k: "lindsay", name: "Ted Lindsay Award", sub: "Most outstanding player (players' vote)", note: "Like the Hart, without the team-success boost." },
  { k: "byng", name: "Lady Byng Trophy", sub: "Sportsmanship and ability", note: "Scoring rate, minus penalty minutes." },
];
export const RACES = [
  { k: "artRoss", name: "Art Ross Trophy", sub: "Points leader", unit: "P", paceUnit: "pts" },
  { k: "richard", name: "Maurice Richard Trophy", sub: "Goals leader", unit: "G", paceUnit: "goals" },
  { k: "presidents", name: "Presidents' Trophy", sub: "Best record", unit: "PTS", paceUnit: "pts" },
  { k: "jennings", name: "Jennings-style race", sub: "Fewest goals against per game (team)", unit: "GA/GP", paceUnit: "GA" },
];
