// Refresh the team roster tables from the NHL. Counting stats come from the club feed (updates during games);
// advanced, special teams, faceoffs and goalie splits come from the stats reports for this team.
(() => {
  const root = document.querySelector("#roster");
  if (!root) return;
  const abbr = root.dataset.abbr;
  const season = root.dataset.season;
  const note = document.querySelector("#roster-live");
  const skaterReports = ["summary", "realtime", "percentages", "scoringRates", "timeonice", "faceoffpercentages", "powerplay", "penaltykill", "penalties", "goalsForAgainst"];
  const goalieReports = ["summary", "advanced", "savesByStrength"];

  const fmt = (f, v) => {
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
  };
  const pick = (bag, path) => {
    const [report, field] = path.split(".");
    const v = bag?.[report]?.[field];
    return Number.isFinite(v) ? v : null;
  };
  const index = (rows, into, report) => {
    for (const row of rows ?? []) {
      if (row?.playerId == null) continue;
      (into[row.playerId] ??= {})[report] = row;
    }
  };

  async function report(kind, name) {
    const q = `seasonId=${season} and gameTypeId=2 and teamAbbrevs like "%${abbr}%"`;
    const r = await fetch(`/live/${kind}/${name}/?limit=-1&cayenneExp=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error(`${r.status} ${kind}/${name}`);
    return (await r.json()).data ?? [];
  }

  function apply(sk, gl) {
    for (const tr of root.querySelectorAll("tr[data-pid]")) {
      const bag = (tr.dataset.kind === "G" ? gl : sk)[tr.dataset.pid];
      if (!bag) continue;
      for (const td of tr.querySelectorAll("[data-stat]")) {
        const v = pick(bag, td.dataset.stat);
        if (v == null) continue;
        td.dataset.v = String(v);
        td.textContent = fmt(td.dataset.f, v);
      }
    }
  }

  function overlayClub(club, sk, gl) {
    for (const s of club.skaters ?? []) {
      const sum = ((sk[s.playerId] ??= {}).summary ??= {});
      Object.assign(sum, {
        gamesPlayed: s.gamesPlayed, goals: s.goals, assists: s.assists, points: s.points, plusMinus: s.plusMinus,
        penaltyMinutes: s.penaltyMinutes, ppGoals: s.powerPlayGoals, shGoals: s.shorthandedGoals,
        gameWinningGoals: s.gameWinningGoals, shots: s.shots, shootingPct: s.shootingPctg,
        timeOnIcePerGame: s.avgTimeOnIcePerGame, faceoffWinPct: s.faceoffWinPctg,
        pointsPerGame: s.gamesPlayed ? s.points / s.gamesPlayed : null,
      });
    }
    for (const s of club.goalies ?? []) {
      const sum = ((gl[s.playerId] ??= {}).summary ??= {});
      Object.assign(sum, {
        gamesPlayed: s.gamesPlayed, gamesStarted: s.gamesStarted, wins: s.wins, losses: s.losses,
        otLosses: s.overtimeLosses, savePct: s.savePercentage, goalsAgainstAverage: s.goalsAgainstAverage,
        shutouts: s.shutouts, shotsAgainst: s.shotsAgainst,
      });
    }
  }

  (async () => {
    if (note) note.textContent = "Refreshing roster stats from the NHL…";
    try {
      const [skRows, glRows, clubRes] = await Promise.all([
        Promise.all(skaterReports.map(async (name) => [name, await report("skater", name)])),
        Promise.all(goalieReports.map(async (name) => [name, await report("goalie", name)])),
        fetch(`/live/club/${abbr}/`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      const sk = {}, gl = {};
      for (const [name, rows] of skRows) index(rows, sk, name);
      for (const [name, rows] of glRows) index(rows, gl, name);
      if (clubRes) overlayClub(clubRes, sk, gl);
      apply(sk, gl);
      if (note) note.textContent = `Live from the NHL · ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}. Counting stats update during games; advanced numbers update when the league posts them.`;
    } catch {
      if (note) note.textContent = "Showing stats from the last site build. The live NHL refresh didn’t answer.";
    }
  })();
})();
