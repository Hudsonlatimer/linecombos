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
  const logo = (t) => (t.logo ? `<img class="logo" src="${esc(t.logo)}" data-dark="${esc(t.darkLogo ?? t.logo)}" alt="" width="20" height="20">` : "");
  function chip(g) {
    const live = LIVE.has(g.gameState), fin = FINAL.has(g.gameState), pd = g.periodDescriptor ?? {}, c = g.clock ?? {};
    const st = live ? `<span class="live-dot">${c.inIntermission ? `${per(pd.number, pd.periodType)} int.` : `${per(pd.number, pd.periodType)} ${esc(c.timeRemaining ?? "")}`}</span>` : fin ? `Final${pd.periodType && pd.periodType !== "REG" ? ` ${pd.periodType}` : ""}` : time(g.startTimeUTC);
    const sc = (t) => (live || fin ? `<em>${t.score ?? 0}</em>` : "");
    return `<a class="lb-game${live ? " is-live" : ""}" href="/game/${g.id}/"><span class="lb-t">${logo(g.awayTeam)}<b>${esc(g.awayTeam.abbrev)}</b>${sc(g.awayTeam)}</span><span class="lb-t">${logo(g.homeTeam)}<b>${esc(g.homeTeam.abbrev)}</b>${sc(g.homeTeam)}</span><span class="lb-st">${st}</span></a>`;
  }
  async function poll() {
    try {
      // Today's NHL slate by Eastern date (the feed redirects "now" to a dated URL, which a browser can't follow across sites).
      // Before 7am ET, last night's late games are still the story, so include yesterday.
      const et = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
      const hour = +new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(new Date()) % 24;
      const days = [et(new Date())]; if (hour < 7) days.push(et(new Date(Date.now() - 864e5)));
      const t = Math.floor(Date.now() / 15000);
      const feeds = await Promise.all(days.map((d) => fetch(`/live/score/${d}/?t=${t}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
      const seen = new Set(), games = [];
      for (const f of feeds) for (const g of f?.games ?? []) if (!seen.has(g.id) && (g.gameType === 2 || g.gameType === 3)) { seen.add(g.id); games.push(g); }
      if (!games.length) { bar.hidden = true; return; }
      const order = (g) => (LIVE.has(g.gameState) ? 0 : FINAL.has(g.gameState) ? 2 : 1);
      games.sort((a, b) => order(a) - order(b) || a.startTimeUTC.localeCompare(b.startTimeUTC));
      const n = games.filter((g) => LIVE.has(g.gameState)).length;
      bar.innerHTML = `<div class="wrap lb-in"><span class="lb-lbl">${n ? `<span class="live-dot">${n} live</span>` : "Today"}</span><div class="lb-scroll">${games.map(chip).join("")}</div></div>`;
      bar.hidden = false;
      window.LC?.swapLogos?.();
    } catch {}
  }
  poll();
  setInterval(() => { if (!document.hidden) poll(); }, 20000);
})();
