// The /scores/ page: every game on a date, live. Today's games ride the site-wide poll in live.js (the "lc:scores" event),
// so there is no second poll; other dates fetch their own feed (and keep polling only while a game on them is live).
// Win chances come from the pre-game expected goals in data/predictions.json, recomputed from the score, clock,
// power plays and pulled goalies with the same maths as the gamecenter (winprob.js).
const W = await import(`./winprob.js${new URL(import.meta.url).search}`);

const DATA = JSON.parse(document.getElementById("page-data")?.textContent ?? "{}");
const TEAMS = DATA.teams ?? {};
const LIVE = new Set(["LIVE", "CRIT"]), FINAL = new Set(["OFF", "FINAL"]);
const $ = (s) => document.querySelector(s);
const grid = $("#sb-grid"), daysEl = $("#sb-days"), sumEl = $("#sb-sum"), dateIn = $("#sb-date"), title = $("#sb-title");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const etDate = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(d);
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const nice = (d, o = { weekday: "long", month: "long", day: "numeric" }) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { ...o, timeZone: "UTC" });
const per = (n, t) => (t === "SO" ? "SO" : t === "OT" || n === 4 ? "OT" : n > 4 ? `${n - 3}OT` : `P${n}`);
const P = (x) => `${Math.round(x * 100)}%`;
const dark = () => document.documentElement.dataset.theme === "dark" || (document.documentElement.dataset.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
const logo = (abbr, size = 40) => { const t = TEAMS[abbr]; const src = t ? (dark() ? t.dark : t.logo) : `https://assets.nhle.com/logos/nhl/svg/${abbr}_light.svg`; return `<img class="logo" src="${esc(src)}" data-dark="${esc(t?.dark ?? src)}" alt="" width="${size}" height="${size}">`; };
const favs = () => window.LC?.favs?.list?.() ?? [];

let date = new URLSearchParams(location.search).get("d") || etDate();
let games = [], week = [], preds = {}, timer = 0, prevScores = new Map(), loaded = false;

async function loadPreds() {
  try { const r = await fetch("/data/predictions.json", { cache: "no-store" }); if (r.ok) preds = (await r.json()).games ?? {}; } catch {}
}

// ---------- win chance ----------
function winChance(g) {
  const pr = preds[g.id];
  if (!pr || !(pr.lh > 0) || !(pr.la > 0)) return null;
  const hg = g.homeTeam?.score ?? 0, ag = g.awayTeam?.score ?? 0;
  if (FINAL.has(g.gameState)) {
    const pre = pr.home ?? W.predictGame(pr.lh, pr.la).home, favH = pre >= 0.5;
    return { ph: pre, label: `Pre-game odds · ${(hg > ag) === favH ? "✓ called it" : "✗ upset"}` };
  }
  if (!LIVE.has(g.gameState)) {
    const ph = pr.home ?? W.predictGame(pr.lh, pr.la).home;
    return { ph, label: `Pre-game · expected goals ${pr.la.toFixed(1)}–${pr.lh.toFixed(1)}` };
  }
  const pd = g.periodDescriptor ?? {}, c = g.clock ?? {}, sit = g.situation ?? {};
  const code = W.situation(sit.situationCode), left = sit.secondsRemaining ?? 0;
  const s = { hg, ag, period: pd.number ?? g.period ?? 1, left: c.secondsRemaining ?? 1200, playoff: !!pr.playoff, shootout: pd.periodType === "SO",
    ppHome: code.home > code.away ? left || 60 : 0, ppAway: code.away > code.home ? left || 60 : 0, enHome: !code.homeG, enAway: !code.awayG };
  return { ph: W.liveProb(pr.lh, pr.la, s), label: "Live chance to win" };
}

// ---------- rendering ----------
function status(g) {
  const pd = g.periodDescriptor ?? {}, c = g.clock ?? {};
  if (LIVE.has(g.gameState)) return `<span class="live-dot">${c.inIntermission ? `${per(pd.number, pd.periodType)} intermission` : `${per(pd.number, pd.periodType)} · ${esc(c.timeRemaining ?? "")}`}</span>`;
  if (FINAL.has(g.gameState)) { const t = g.gameOutcome?.lastPeriodType; return `Final${t && t !== "REG" ? `/${t}` : ""}`; }
  if (g.gameState === "PPD") return "Postponed";
  return new Date(g.startTimeUTC).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function teamRow(g, side, other) {
  const t = g[side], o = g[other], info = TEAMS[t.abbrev] ?? {}, started = LIVE.has(g.gameState) || FINAL.has(g.gameState);
  const sit = g.situation?.[side] ?? {}, code = W.situation(g.situation?.situationCode);
  const pp = LIVE.has(g.gameState) && (sit.situationDescriptions ?? []).includes("PP");
  const en = LIVE.has(g.gameState) && g.situation?.situationCode && (side === "homeTeam" ? !code.homeG : !code.awayG);
  const lose = FINAL.has(g.gameState) && (t.score ?? 0) < (o.score ?? 0);
  return `<a class="sb-team${lose ? " lose" : ""}" href="${esc(info.url ?? "/nhl/")}">${logo(t.abbrev)}
    <span class="sb-name"><b>${esc(info.n ?? t.name?.default ?? t.abbrev)}</b><small>${esc(info.rec ?? "")}${pp ? ` <span class="sb-pp">PP ${esc(g.situation?.timeRemaining ?? "")}</span>` : ""}${en ? ` <span class="sb-en">EMPTY NET</span>` : ""}</small></span>
    <span class="sb-sog">${started && t.sog != null ? `${t.sog} SOG` : ""}</span>
    <span class="sb-sc" data-sc="${g.id}-${side}">${started ? t.score ?? 0 : ""}</span></a>`;
}
function goalsList(g) {
  const list = (g.goals ?? []).filter((x) => x.periodDescriptor?.periodType !== "SO");
  if (!list.length) return "";
  return `<ol class="sb-goals">${list.map((x) => {
    const ast = (x.assists ?? []).map((a) => a.name?.default).filter(Boolean);
    const str = x.strength && x.strength !== "ev" ? `<span class="str">${esc(x.strength.toUpperCase())}</span>` : x.goalModifier === "empty-net" ? `<span class="str">EN</span>` : "";
    return `<li><span class="t">${per(x.period, x.periodDescriptor?.periodType)} ${esc(x.timeInPeriod)}</span>${logo(x.teamAbbrev, 18)}<span class="who"><b>${esc(x.name?.default ?? "")}</b>${x.goalsToDate ? ` (${x.goalsToDate})` : ""}${str}${ast.length ? ` <small>${esc(ast.join(", "))}</small>` : ""}</span><span class="sc">${x.awayScore}–${x.homeScore}</span></li>`;
  }).join("")}</ol>`;
}
function wpBlock(g) {
  const w = winChance(g);
  if (!w) return "";
  const ca = TEAMS[g.awayTeam.abbrev]?.c || "var(--muted)", ch = TEAMS[g.homeTeam.abbrev]?.c || "var(--accent)";
  return `<div class="sb-wp"><div class="sb-wp-row"><span>${P(1 - w.ph)}</span><span class="sb-wp-bar"><i style="width:${((1 - w.ph) * 100).toFixed(1)}%;background:${esc(ca)}"></i><i style="width:${(w.ph * 100).toFixed(1)}%;background:${esc(ch)}"></i></span><span>${P(w.ph)}</span></div>
    <div class="sb-wp-lbl"><span>${esc(g.awayTeam.abbrev)}</span><span>${esc(w.label)}</span><span>${esc(g.homeTeam.abbrev)}</span></div></div>`;
}
function card(g) {
  const live = LIVE.has(g.gameState), fin = FINAL.has(g.gameState), pre = !live && !fin;
  const fav = favs().some((a) => a === g.awayTeam.abbrev || a === g.homeTeam.abbrev);
  const tv = (g.tvBroadcasts ?? []).map((b) => b.network).filter(Boolean).slice(0, 4).join(" · ");
  const links = [`<a class="btn-sm" href="/game/${g.id}/">${live ? "Live gamecenter" : fin ? "Box score & lines" : "Preview & lines"}</a>`];
  if (g.threeMinRecap) links.push(`<a class="btn-sm" href="https://www.nhl.com${esc(g.threeMinRecap)}" target="_blank" rel="noopener">Recap ↗</a>`);
  if (pre) links.push(`<a class="btn-sm" href="/goalies/">Starting goalies</a>`);
  return `<article class="sb-card${live ? " is-live" : ""}${pre ? " is-pre" : ""}${fav ? " is-fav" : ""}" data-id="${g.id}">
    <div class="sb-st"><span>${status(g)}</span><span class="sb-tv">${esc(tv)}</span></div>
    <div class="sb-teams">${teamRow(g, "awayTeam", "homeTeam")}${teamRow(g, "homeTeam", "awayTeam")}</div>
    ${wpBlock(g)}${goalsList(g)}
    <div class="sb-foot">${links.join("")}</div></article>`;
}
const order = (g) => (LIVE.has(g.gameState) ? 0 : FINAL.has(g.gameState) ? 2 : 1);
let lastHtml = "";
function paint() {
  const f = favs();
  const list = games.slice().sort((a, b) => order(a) - order(b) || (f.includes(b.awayTeam.abbrev) || f.includes(b.homeTeam.abbrev)) - (f.includes(a.awayTeam.abbrev) || f.includes(a.homeTeam.abbrev)) || a.startTimeUTC.localeCompare(b.startTimeUTC));
  const html = list.length ? list.map(card).join("") : `<div class="sb-empty card"><b>No NHL games on ${esc(nice(date))}.</b><br>Pick another day above.</div>`;
  if (html !== lastHtml) {
    grid.innerHTML = html; lastHtml = html;
    // Goal flash: any score that went up since the last paint
    for (const g of list) {
      for (const side of ["awayTeam", "homeTeam"]) {
        const k = `${g.id}-${side}`, v = g[side].score ?? 0, was = prevScores.get(k);
        if (was != null && v > was) { grid.querySelector(`[data-sc="${k}"]`)?.classList.add("bump"); grid.querySelector(`[data-id="${g.id}"]`)?.classList.add("goal"); }
        prevScores.set(k, v);
      }
    }
  }
  const n = { live: list.filter((g) => LIVE.has(g.gameState)).length, fin: list.filter((g) => FINAL.has(g.gameState)).length };
  const today = date === etDate();
  title.textContent = today ? "Today's scores" : date === addDays(etDate(), -1) ? "Yesterday's scores" : date === addDays(etDate(), 1) ? "Tomorrow" : nice(date, { weekday: "long", month: "short", day: "numeric" });
  sumEl.innerHTML = list.length ? `<span>${esc(nice(date))}</span><span>·</span><span>${list.length} game${list.length === 1 ? "" : "s"}</span>${n.live ? `<span>·</span><span class="live-dot">${n.live} live</span>` : ""}${n.fin ? `<span>·</span><span>${n.fin} final</span>` : ""}${today ? `<span>·</span><span>updates on its own</span>` : ""}` : "";
}
function paintDays() {
  const days = week.length ? week : [-3, -2, -1, 0, 1, 2, 3].map((k) => ({ date: addDays(date, k) }));
  const today = etDate();
  daysEl.innerHTML = days.map((d) => `<button type="button" class="sb-day${d.date === date ? " on" : ""}${d.date === today ? " today" : ""}" data-date="${d.date}"><small>${d.date === today ? "Today" : nice(d.date, { weekday: "short" })}</small><b>${+d.date.slice(8)}</b><i>${d.numberOfGames != null ? `${d.numberOfGames} game${d.numberOfGames === 1 ? "" : "s"}` : nice(d.date, { month: "short" })}</i></button>`).join("");
  daysEl.querySelector(".on")?.scrollIntoView?.({ inline: "center", block: "nearest" });
  dateIn.value = date;
}

// ---------- data ----------
async function fetchDay(d) {
  try {
    const r = await fetch(`/live/score/${d}/?t=${Math.floor(Date.now() / 10000)}`, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
async function load(d, { quiet = false } = {}) {
  if (!quiet) { grid.innerHTML = `<div class="sb-skel"></div><div class="sb-skel"></div><div class="sb-skel"></div>`; lastHtml = ""; prevScores = new Map(); }
  const j = await fetchDay(d);
  if (d !== date) return; // the reader moved on
  if (!j) { if (!loaded) grid.innerHTML = `<div class="sb-empty card">Couldn't reach the NHL feed. Trying again shortly…</div>`; schedule(20000); return; }
  loaded = true;
  games = (j.games ?? []).filter((g) => g.gameType === 2 || g.gameType === 3 || g.gameType === 1);
  week = (j.gameWeek ?? []).map((w) => ({ date: w.date, numberOfGames: w.numberOfGames }));
  paintDays(); paint(); window.LC?.swapLogos?.();
  schedule();
}
function schedule(ms) {
  clearTimeout(timer);
  const isToday = date === etDate();
  const live = games.some((g) => LIVE.has(g.gameState));
  // Today: live.js already polls and hands us its games. Elsewhere, poll only while something is live.
  if (ms) timer = setTimeout(() => load(date, { quiet: true }), ms);
  else if (!isToday && live) timer = setTimeout(() => load(date, { quiet: true }), 12000);
  else if (isToday) timer = setTimeout(() => load(date, { quiet: true }), 120000); // safety refresh (gameWeek, records)
}
// Site-wide poll (live.js): today's games, every 10 s while live
addEventListener("lc:scores", (e) => {
  if (date !== etDate() || !loaded) return;
  const fresh = new Map((e.detail ?? []).map((g) => [g.id, g]));
  let hit = false;
  games = games.map((g) => { const f = fresh.get(g.id); if (f) { hit = true; return { ...g, ...f }; } return g; });
  if (hit) { paint(); window.LC?.swapLogos?.(); }
});

function go(d, push = true) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
  date = d;
  if (push) history.pushState({ d }, "", d === etDate() ? "/scores/" : `/scores/?d=${d}`);
  week = week.some((w) => w.date === d) ? week : [];
  paintDays(); load(d);
}
document.querySelector(".sb-nav").addEventListener("click", (e) => {
  const b = e.target.closest("[data-step]"); if (!b) return;
  const k = +b.dataset.step; go(k === 0 ? etDate() : addDays(date, k));
});
daysEl.addEventListener("click", (e) => { const b = e.target.closest("[data-date]"); if (b) go(b.dataset.date); });
dateIn.addEventListener("change", () => go(dateIn.value));
addEventListener("popstate", () => go(new URLSearchParams(location.search).get("d") || etDate(), false));
addEventListener("keydown", (e) => { if (e.target.closest("input, textarea, select, [contenteditable]")) return; if (e.key === "ArrowLeft") go(addDays(date, -1)); if (e.key === "ArrowRight") go(addDays(date, 1)); });
document.addEventListener("visibilitychange", () => { if (!document.hidden && date !== etDate()) load(date, { quiet: true }); });

paintDays();
await loadPreds();
load(date);
