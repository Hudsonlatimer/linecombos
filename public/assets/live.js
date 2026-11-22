// The live layer, on every page: one shared poll of the NHL score feed (through /live/) drives the score bar (or the home
// strip), the "My teams" panel, goal / final / puck-drop alerts and the browser tab title. Favourite teams live in localStorage.
(() => {
  const LC = (window.LC ??= {});
  const LIVE = new Set(["LIVE", "CRIT"]), FINAL = new Set(["OFF", "FINAL"]);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  // ---------- favourite teams ----------
  let favs = new Set(store.get("lc-favs", []));
  const isFav = (a) => favs.has(a);
  function toggleFav(a) {
    favs.has(a) ? favs.delete(a) : favs.add(a);
    store.set("lc-favs", [...favs]);
    syncStars(); lastRender = ""; if (games.length) paint(); renderMine();
  }
  LC.favs = { has: isFav, toggle: toggleFav, list: () => [...favs] };

  const star = (a, cls = "") => `<button type="button" class="fav-btn ${cls}" data-fav="${esc(a)}" aria-pressed="false" aria-label="Follow ${esc(a)}"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8z"/></svg></button>`;
  function addStars() {
    // Team tiles on the teams index: the whole tile is a link, so the star sits inside it and swallows the click.
    for (const t of document.querySelectorAll("a.team-tile:not([data-star])")) {
      t.dataset.star = "1";
      const a = (t.querySelector("img.logo")?.getAttribute("src") ?? "").match(/\/([A-Z]{2,3})_(?:[a-z]+_)?(?:light|dark)/)?.[1];
      if (a) t.insertAdjacentHTML("beforeend", star(a, "fav-tile"));
    }
    for (const s of document.querySelectorAll(".fav-slot:not([data-star])")) { s.dataset.star = "1"; s.innerHTML = star(s.dataset.team, "fav-hero"); }
  }
  function syncStars() {
    for (const b of document.querySelectorAll(".fav-btn")) {
      const on = isFav(b.dataset.fav);
      b.setAttribute("aria-pressed", on); b.classList.toggle("on", on);
      b.title = on ? `Following ${b.dataset.fav}: tap to unfollow` : `Follow ${b.dataset.fav} for goal alerts and a pinned score`;
    }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".fav-btn");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    toggleFav(b.dataset.fav);
    if (isFav(b.dataset.fav) && alertMode === "off") setMode("fav", true);
  }, true);

  // ---------- alerts (toasts, and browser notifications when the tab is in the background) ----------
  const MODES = { fav: "My teams", all: "All games", off: "Off" };
  let alertMode = store.get("lc-alerts", "fav");
  if (!MODES[alertMode]) alertMode = "fav";
  const stack = document.createElement("div");
  stack.id = "lc-toasts"; stack.setAttribute("aria-live", "polite"); stack.setAttribute("role", "status");
  document.body.appendChild(stack);
  function toast({ kind = "info", title, body = "", href = "", img = "" }) {
    const el = document.createElement(href ? "a" : "div");
    el.className = `lc-toast lc-${kind}`; if (href) el.href = href;
    el.innerHTML = `${img ? `<img src="${esc(img)}" alt="" width="40" height="40" onerror="this.remove()">` : ""}<span class="lc-tx"><b>${esc(title)}</b>${body ? `<span>${esc(body)}</span>` : ""}</span><button type="button" class="lc-x" aria-label="Dismiss">&times;</button>`;
    el.querySelector(".lc-x").addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); el.remove(); });
    stack.prepend(el);
    while (stack.children.length > 4) stack.lastChild.remove();
    setTimeout(() => el.remove(), kind === "goal" ? 12000 : 8000);
  }
  function notify(title, body, href, tag) {
    try {
      if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        const n = new Notification(title, { body, tag, icon: "/assets/icon-192.png" });
        n.onclick = () => { focus(); if (href) location.href = href; n.close(); };
      }
    } catch {}
  }
  function alertFor(g) { return alertMode === "all" || (alertMode === "fav" && (isFav(g.awayTeam.abbrev) || isFav(g.homeTeam.abbrev))); }
  const score = (g) => `${g.awayTeam.abbrev} ${g.awayTeam.score ?? 0} – ${g.homeTeam.score ?? 0} ${g.homeTeam.abbrev}`;
  const per = (n, t) => (t === "SO" ? "SO" : t === "OT" || n === 4 ? "OT" : n > 4 ? `${n - 3}OT` : `P${n}`);
  function setMode(m, quiet) {
    alertMode = m; store.set("lc-alerts", m); paintBell();
    if (m !== "off" && "Notification" in window && Notification.permission === "default") { try { Notification.requestPermission(); } catch {} }
    if (!quiet) toast({ kind: "info", title: `Goal alerts: ${MODES[m]}`, body: m === "fav" ? (favs.size ? "You'll see goals, finals and puck drops for your teams." : "Star a team to follow it.") : m === "all" ? "Every goal in every game." : "No alerts." });
  }
  function paintBell() {
    const b = document.getElementById("lc-bell"); if (!b) return;
    b.dataset.mode = alertMode; b.setAttribute("aria-label", `Goal alerts: ${MODES[alertMode]}. Tap to change.`); b.title = `Goal alerts: ${MODES[alertMode]} (tap to change)`;
    b.querySelector(".bell-dot").hidden = alertMode === "off";
  }
  function addBell() {
    const host = document.querySelector("header.top #theme")?.parentElement; if (!host || document.getElementById("lc-bell")) return;
    const b = document.createElement("button");
    b.type = "button"; b.id = "lc-bell"; b.className = "icon-btn";
    b.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.5-2.5h-5A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5-6.7V3.5a2 2 0 0 0-4 0v.8A7 7 0 0 0 5 11v5l-2 2v1h18v-1Z"/></svg><i class="bell-dot" hidden></i>`;
    b.addEventListener("click", () => setMode(alertMode === "fav" ? "all" : alertMode === "all" ? "off" : "fav"));
    host.insertBefore(b, document.getElementById("theme"));
    paintBell();
  }

  // ---------- the shared poll ----------
  let games = [], prev = new Map(), first = true;
  const goalKey = (x) => `${x.period}|${x.timeInPeriod}|${x.playerId}`;
  function detect(list) {
    for (const g of list) {
      const was = prev.get(g.id), seen = was?.goals ?? new Set(), now = new Set((g.goals ?? []).map(goalKey));
      if (!first && was) {
        const fresh = (g.goals ?? []).filter((x) => !seen.has(goalKey(x)));
        if (alertFor(g)) {
          for (const x of fresh) {
            const ast = (x.assists ?? []).map((a) => a.name?.default).filter(Boolean);
            const t = `GOAL ${x.teamAbbrev}: ${x.name?.default ?? "Goal"}${x.goalsToDate ? ` (${x.goalsToDate})` : ""}`;
            const b = `${score(g)} · ${per(x.period, x.periodDescriptor?.periodType)} ${x.timeInPeriod}${ast.length ? ` · A: ${ast.join(", ")}` : ""}${x.strength && x.strength !== "ev" ? ` · ${x.strength.toUpperCase()}` : ""}`;
            toast({ kind: "goal", title: t, body: b, href: `/game/${g.id}/`, img: x.mugshot });
            notify(t, b, `/game/${g.id}/`, `${g.id}-${goalKey(x)}`);
          }
          if (!LIVE.has(was.state) && !FINAL.has(was.state) && LIVE.has(g.gameState)) { toast({ kind: "start", title: `Puck drop: ${g.awayTeam.abbrev} at ${g.homeTeam.abbrev}`, href: `/game/${g.id}/` }); notify(`Puck drop: ${g.awayTeam.abbrev} at ${g.homeTeam.abbrev}`, "", `/game/${g.id}/`, `${g.id}-start`); }
          if (!FINAL.has(was.state) && FINAL.has(g.gameState)) {
            const ot = g.gameOutcome?.lastPeriodType && g.gameOutcome.lastPeriodType !== "REG" ? ` (${g.gameOutcome.lastPeriodType})` : "";
            toast({ kind: "final", title: `Final${ot}: ${score(g)}`, href: `/game/${g.id}/` }); notify(`Final${ot}: ${score(g)}`, "", `/game/${g.id}/`, `${g.id}-final`);
          }
        }
      }
      prev.set(g.id, { state: g.gameState, goals: now });
    }
    first = false;
  }

  const time = (utc) => new Date(utc).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const logo = (t) => (t.logo ? `<img class="logo" src="${esc(t.logo)}" data-dark="${esc(t.darkLogo ?? t.logo)}" alt="" width="20" height="20">` : "");
  const stateTxt = (g, short) => {
    const live = LIVE.has(g.gameState), fin = FINAL.has(g.gameState), pd = g.periodDescriptor ?? {}, c = g.clock ?? {};
    if (live) return `<span class="live-dot">${c.inIntermission ? `${per(pd.number, pd.periodType)} int.` : short ? per(pd.number, pd.periodType) : `${per(pd.number, pd.periodType)} ${esc(c.timeRemaining ?? "")}`}</span>`;
    if (fin) return `Final${pd.periodType && pd.periodType !== "REG" ? ` ${pd.periodType}` : ""}`;
    return g.gameState === "PPD" ? "Postponed" : time(g.startTimeUTC);
  };
  const fav = (g) => isFav(g.awayTeam.abbrev) || isFav(g.homeTeam.abbrev);
  function chip(g) {
    const live = LIVE.has(g.gameState), fin = FINAL.has(g.gameState), sc = (t) => (live || fin ? `<em>${t.score ?? 0}</em>` : "");
    return `<a class="lb-game${live ? " is-live" : ""}${fav(g) ? " is-fav" : ""}" href="/game/${g.id}/"><span class="lb-t">${logo(g.awayTeam)}<b>${esc(g.awayTeam.abbrev)}</b>${sc(g.awayTeam)}</span><span class="lb-t">${logo(g.homeTeam)}<b>${esc(g.homeTeam.abbrev)}</b>${sc(g.homeTeam)}</span><span class="lb-st">${stateTxt(g)}</span></a>`;
  }
  function ssGame(g) {
    const live = LIVE.has(g.gameState), fin = FINAL.has(g.gameState), row = (t) => `<span class="ss-team">${logo(t)}<b>${esc(t.abbrev)}</b>${live || fin ? `<em>${t.score ?? 0}</em>` : ""}</span>`;
    return `<a class="ss-game${live ? " is-live" : ""}${fav(g) ? " is-fav" : ""}" href="/game/${g.id}/">${row(g.awayTeam)}${row(g.homeTeam)}<span class="ss-st">${stateTxt(g, true)}</span></a>`;
  }
  const order = (g) => (LIVE.has(g.gameState) ? 0 : FINAL.has(g.gameState) ? 2 : 1);
  const sorted = () => games.slice().sort((a, b) => order(a) - order(b) || (fav(b) - fav(a)) || a.startTimeUTC.localeCompare(b.startTimeUTC));

  const header = document.querySelector("header.top"), strip = document.querySelector(".score-strip");
  let bar = null, lastRender = "";
  // The scores page is its own scoreboard, so it gets no bar.
  if (header && !strip && document.body.dataset.path !== "/scores/") { bar = document.createElement("div"); bar.className = "live-bar"; bar.hidden = true; bar.setAttribute("aria-label", "Live scores"); header.after(bar); }
  function paint() {
    const list = sorted(), n = list.filter((g) => LIVE.has(g.gameState)).length;
    document.title = document.title.replace(/^\(\d+ live\) /, "");
    if (n) document.title = `(${n} live) ${document.title}`;
    if (strip) {
      const html = list.map(ssGame).join("") + `<a class="ss-game ss-all" href="/scores/"><b>Full scoreboard</b><span>Goals, shots, win odds →</span></a>`;
      if (html !== lastRender) { const left = strip.scrollLeft; strip.innerHTML = html; strip.scrollLeft = left; lastRender = html; window.LC?.swapLogos?.(); }
      return;
    }
    if (!bar) return;
    if (!list.length) { bar.hidden = true; return; }
    const html = `<span class="lb-lbl">${n ? `<span class="live-dot">${n} live</span>` : "Today"}</span><div class="lb-scroll">${list.map(chip).join("")}<a class="lb-game lb-all" href="/scores/">All scores →</a></div>`;
    if (html === lastRender) return;
    const keep = bar.querySelector(".lb-scroll")?.scrollLeft ?? 0; // a refresh shouldn't snap the strip back to the start
    bar.innerHTML = `<div class="wrap lb-in">${html}</div>`; bar.hidden = false;
    const sc = bar.querySelector(".lb-scroll"); if (sc) sc.scrollLeft = keep;
    lastRender = html; window.LC?.swapLogos?.();
  }

  async function poll() {
    try {
      // Today's NHL slate by Eastern date (the feed redirects "now" to a dated URL, which a browser can't follow across sites).
      // Before 7am ET, last night's late games are still the story, so include yesterday.
      const et = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
      const hour = +new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }).format(new Date()) % 24;
      const days = [et(new Date())]; if (hour < 7) days.push(et(new Date(Date.now() - 864e5)));
      const t = Math.floor(Date.now() / 10000);
      const feeds = await Promise.all(days.map((d) => fetch(`/live/score/${d}/?t=${t}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
      if (feeds.every((f) => !f)) return; // keep what's on screen
      const seen = new Set(), list = [];
      for (const f of feeds) for (const g of f?.games ?? []) if (!seen.has(g.id) && (g.gameType === 2 || g.gameType === 3)) { seen.add(g.id); list.push(g); }
      ingest(list);
    } catch {}
  }
  // Score bump: any team whose score went up since the last poll gets a brief flash in the strip / bar.
  let lastScores = new Map();
  function bumps() {
    for (const g of games) for (const side of ["awayTeam", "homeTeam"]) {
      const k = `${g.id}-${side}`, v = g[side].score ?? 0, was = lastScores.get(k);
      if (was != null && v > was) {
        const el = document.querySelector(`a.ss-game[href="/game/${g.id}/"], a.lb-game[href="/game/${g.id}/"]`);
        const em = el?.querySelectorAll(".ss-team em, .lb-t em")[side === "awayTeam" ? 0 : 1];
        if (el) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
        if (em) em.classList.add("bump");
      }
      lastScores.set(k, v);
    }
  }
  function ingest(list) {
    games = list; detect(list); paint(); bumps(); renderMine();
    try { dispatchEvent(new CustomEvent("lc:scores", { detail: list })); } catch {}
  }
  LC.live = { ingest, games: () => games, poll };

  // ---------- "My teams" panel on the home page ----------
  let appData = null, appAt = 0;
  async function loadApp() {
    if (appData && Date.now() - appAt < 60000) return appData;
    try { const r = await fetch("/data/app.json", { cache: "no-store" }); if (r.ok) { appData = await r.json(); appAt = Date.now(); } } catch {}
    return appData;
  }
  const mine = document.querySelector(".home-hero, section.hero")?.matches(".home-hero") ? (() => { const s = document.createElement("section"); s.id = "my-teams"; s.className = "my-teams"; document.querySelector(".home-hero").after(s); return s; })() : null;
  let lastMine = "";
  async function renderMine() {
    if (!mine) return;
    const A = await loadApp(), list = [...favs];
    let html;
    if (!list.length) html = `<div class="mt-empty"><b>My teams</b><span>Star your teams to pin their scores here and get goal alerts.</span><a class="btn" href="/nhl/">Pick your teams</a></div>`;
    else html = `<h2 class="mt-h">My teams <a class="more" href="/nhl/">Edit</a></h2><div class="mt-grid">${list.map((a) => {
      const g = games.find((x) => x.awayTeam.abbrev === a || x.homeTeam.abbrev === a), t = A?.teams?.find((x) => x.abbrev === a);
      const lg = `https://assets.nhle.com/logos/nhl/svg/${a}_light.svg`, dk = `https://assets.nhle.com/logos/nhl/svg/${a}_dark.svg`;
      let line = "";
      if (g) {
        const home = g.homeTeam.abbrev === a, opp = home ? g.awayTeam : g.homeTeam, me = home ? g.homeTeam : g.awayTeam, live = LIVE.has(g.gameState), fin = FINAL.has(g.gameState);
        line = `<a class="mt-game${live ? " is-live" : ""}" href="/game/${g.id}/"><span class="mt-sc">${live || fin ? `${me.score ?? 0}<i>–</i>${opp.score ?? 0}` : ""}</span><span>${home ? "vs" : "at"} ${esc(opp.abbrev)}</span><span class="mt-st">${stateTxt(g, true)}</span></a>`;
      } else if (t?.next) line = `<span class="mt-game"><span>${t.next.home ? "vs" : "at"} ${esc(t.next.opp)}</span><span class="mt-st">${new Date(t.next.start).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}, ${time(t.next.start)}</span></span>`;
      const slug = t ? t.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "";
      return `<div class="mt-card"><a class="mt-top" href="${slug ? `/nhl/${slug}/` : "/nhl/"}"><img class="logo" src="${lg}" data-dark="${dk}" alt="" width="34" height="34"><span><b>${esc(t?.common ?? a)}</b><small>${t ? `${t.w}-${t.l}-${t.otl} · ${t.pts} pts · ${esc(t.streak ?? "")}` : ""}</small></span></a>${line}</div>`;
    }).join("")}</div>`;
    if (html === lastMine) return;
    lastMine = html; mine.innerHTML = html; window.LC?.swapLogos?.();
  }

  // ---------- go ----------
  addStars(); syncStars(); addBell(); renderMine();
  new MutationObserver(() => { addStars(); syncStars(); }).observe(document.body, { childList: true, subtree: true });
  poll();
  // Faster while a game is on, slower when nothing is live.
  (function loop() { setTimeout(() => { if (!document.hidden) poll(); loop(); }, games.some((g) => LIVE.has(g.gameState)) ? 10000 : 25000); })();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
  function focus() { try { window.focus(); } catch {} }
})();
