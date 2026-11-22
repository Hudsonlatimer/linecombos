// Live standings: refreshes every number in the standings tables from the NHL (via the /live/ proxy)
// and re-orders the division and league tables. Wild card tables only get new numbers; their order
// comes back right on the next site build.
(() => {
  const note = document.getElementById("st-live");
  if (!note) return;
  const etDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
  const pct = (v) => (v == null ? "—" : Number(v).toFixed(3).replace(/^0/, ""));
  const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
  const set = (td, v) => {
    const s = String(v);
    if (td.textContent === s) return false;
    td.textContent = s;
    td.classList.remove("flash"); void td.offsetWidth; td.classList.add("flash");
    return true;
  };
  async function tick() {
    let data;
    try {
      const r = await fetch(`/live/standings/${etDate()}/`, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status);
      data = await r.json();
    } catch { return; }
    const by = Object.fromEntries((data.standings ?? []).map((t) => [t.teamAbbrev?.default, t]));
    if (!Object.keys(by).length) return;
    let changed = 0;
    for (const tr of document.querySelectorAll("tr[data-team]")) {
      const t = by[tr.dataset.team];
      if (!t) continue;
      const td = tr.children;
      const vals = [null, null, t.gamesPlayed, t.wins, t.losses, t.otLosses, t.points, pct(t.pointPctg), t.regulationWins, t.goalFor, t.goalAgainst, signed(t.goalDifferential),
        `${t.l10Wins}-${t.l10Losses}-${t.l10OtLosses}`, t.streakCode ? `${t.streakCode}${t.streakCount}` : ""];
      vals.forEach((v, i) => {
        if (v == null || !td[i]) return;
        const cell = i === 6 ? td[i].querySelector("b") ?? td[i] : td[i];
        if (set(cell, v)) changed++;
      });
      const d = td[11];
      if (d) { d.classList.toggle("up", t.goalDifferential > 0); d.classList.toggle("down", t.goalDifferential < 0); }
    }
    for (const table of document.querySelectorAll("table[data-seq]")) {
      if (table.querySelector("th[aria-sort]")) continue; // the reader sorted it by a column; leave their order
      const key = table.dataset.seq, body = table.tBodies[0];
      const rows = [...body.rows].sort((a, b) => (by[a.dataset.team]?.[key] ?? 99) - (by[b.dataset.team]?.[key] ?? 99));
      rows.forEach((r, i) => { body.appendChild(r); r.children[0].textContent = i + 1; });
    }
    const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    note.textContent = `Live from the NHL · checked ${time}${changed ? ` · ${changed} number${changed === 1 ? "" : "s"} changed` : ""}`;
  }
  tick();
  setInterval(() => { if (!document.hidden) tick(); }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
})();
