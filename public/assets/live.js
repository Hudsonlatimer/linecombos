// A live score bar on every page (the home page has its own strip). Polls the NHL score feed through /live/.
(() => {
  if (document.querySelector(".score-strip")) return;
  const header = document.querySelector("header.top");
  if (!header) return;
  const bar = document.createElement("div");
  bar.className = "live-bar"; bar.hidden = true; bar.setAttribute("aria-label", "Live scores");
  header.after(bar);
  const LIVE = new Set(["LIVE", "CRIT"]), FINAL = new Set(["OFF", "FINAL"]);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const per = (n, t) => (t === "SO" ? "SO" : t === "OT" || n === 4 ? "OT" : n > 4 ? `${n - 3}OT` : `P${n}`);
  const time = (utc) => new Date(utc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  function chip(g) {
    const live = LIVE.has(g.gameState), fin = FINAL.has(g.gameState), pd = g.periodDescriptor ?? {}, c = g.clock ?? {};
    const st = live ? `<span class="live-dot">${c.inIntermission ? `${per(pd.number, pd.periodType)} int.` : `${per(pd.number, pd.periodType)} ${esc(c.timeRemaining ?? "")}`}</span>` : fin ? `Final${pd.periodType && pd.periodType !== "REG" ? ` ${pd.periodType}` : ""}` : time(g.startTimeUTC);
    const sc = (t) => (live || fin ? `<em>${t.score ?? 0}</em>` : "");
    return `<a class="lb-game${live ? " is-live" : ""}" href="/game/${g.id}/"><span class="lb-t"><b>${esc(g.awayTeam.abbrev)}</b>${sc(g.awayTeam)}</span><span class="lb-t"><b>${esc(g.homeTeam.abbrev)}</b>${sc(g.homeTeam)}</span><span class="lb-st">${st}</span></a>`;
  }
  async function poll() {
    try {
      const r = await fetch(`/live/scorenow/?t=${Math.floor(Date.now() / 15000)}`, { cache: "no-store" });
      if (!r.ok) return;
      const games = ((await r.json()).games ?? []).filter((g) => g.gameType === 2 || g.gameType === 3);
      if (!games.length) { bar.hidden = true; return; }
      const order = (g) => (LIVE.has(g.gameState) ? 0 : FINAL.has(g.gameState) ? 2 : 1);
      games.sort((a, b) => order(a) - order(b) || a.startTimeUTC.localeCompare(b.startTimeUTC));
      const n = games.filter((g) => LIVE.has(g.gameState)).length;
      bar.innerHTML = `<div class="wrap lb-in"><span class="lb-lbl">${n ? `<span class="live-dot">${n} live</span>` : "Today"}</span><div class="lb-scroll">${games.map(chip).join("")}</div></div>`;
      bar.hidden = false;
    } catch {}
  }
  poll();
  setInterval(() => { if (!document.hidden) poll(); }, 20000);
})();
