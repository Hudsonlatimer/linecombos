// Live game predictions. Every [data-wp] block carries the pre-game expected goals; once a game starts this
// polls the NHL feed (proxied at /live/) and recomputes the win chance from the score, clock, power plays and
// pulled goalies. On a gamecenter it also draws how the chances moved through the game.
const W = await import(`./winprob.js${new URL(import.meta.url).search}`);

const blocks = [...document.querySelectorAll("[data-wp]")];
const chartEl = document.querySelector("[data-wp-chart]");

const P = (x) => `${Math.round(x * 100)}%`;
const FINAL = new Set(["OFF", "FINAL"]), LIVE = new Set(["LIVE", "CRIT"]);
const secs = (mmss) => { const [m, s] = String(mmss ?? "0:0").split(":").map(Number); return m * 60 + s; };
const perLabel = (n, type) => (type === "SO" ? "SO" : type === "OT" || n === 4 ? "OT" : n > 4 ? `${n - 3}OT` : `P${n}`);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function setBlock(el, ph, label) {
  const q = (k) => el.querySelector(`[data-k="${k}"]`);
  if (ph != null) {
    q("ph").textContent = P(ph); q("pa").textContent = P(1 - ph);
    q("bh").style.width = `${(ph * 100).toFixed(1)}%`; q("ba").style.width = `${((1 - ph) * 100).toFixed(1)}%`;
  }
  if (label != null) q("wp-state").innerHTML = label;
  el.classList.toggle("is-live", ph != null && !!label && label.includes("live-dot"));
}
const pre = (el) => ({ lh: +el.dataset.lh, la: +el.dataset.la, playoff: el.dataset.playoff === "1" });

/** A final game keeps its pre-game numbers, labelled with whether the pick was right. */
function finalLabel(el, hg, ag) {
  const { lh, la } = pre(el), ph = W.predictGame(lh, la).home, favH = ph >= 0.5;
  return `${(hg > ag) === favH ? "✓" : "✗"} Final ${ag}–${hg} · pre-game ${P(Math.max(ph, 1 - ph))}`;
}

// ---------- scoreboard pages: one score feed per date ----------
async function pollScores() {
  const now = Date.now();
  const dates = new Set(blocks.filter((el) => {
    const st = el.dataset.state, t = Date.parse(el.dataset.start);
    return LIVE.has(st) || (!FINAL.has(st) && t - now < 10 * 60e3 && now - t < 7 * 3600e3);
  }).map((el) => el.dataset.date));
  for (const d of dates) {
    try {
      const r = await fetch(`/live/score/${d}/?t=${Math.floor(now / 15000)}`, { cache: "no-store" });
      if (!r.ok) continue;
      const j = await r.json();
      for (const g of j.games ?? []) for (const el of blocks.filter((b) => b.dataset.wp === String(g.id))) applyScore(el, g);
    } catch {}
  }
}
/** Keep the score strip and the game card's status line in step with the feed (the page itself is a build snapshot). */
function paintStatus(g, text, cls) {
  const hg = g.homeTeam?.score ?? 0, ag = g.awayTeam?.score ?? 0, started = LIVE.has(g.gameState) || FINAL.has(g.gameState);
  const strip = document.querySelector(`a.ss-game[href="/game/${g.id}/"]`);
  if (strip) {
    strip.classList.toggle("is-live", LIVE.has(g.gameState));
    const teams = strip.querySelectorAll(".ss-team");
    [[teams[0], ag], [teams[1], hg]].forEach(([t, v]) => { if (!t || !started) return; let em = t.querySelector("em"); if (!em) t.append((em = document.createElement("em"))); em.textContent = v; });
    const st = strip.querySelector(".ss-st"); if (st) st.innerHTML = cls ? `<span class="${cls}">${text}</span>` : text;
  }
  const card = document.querySelector(`.game-card a.btn-sm[href="/game/${g.id}/"]`)?.closest(".gc-status");
  if (card && started) { const html = `${cls ? `<span class="${cls}">${FINAL.has(g.gameState) ? "" : "Live"}</span> ` : ""}${ag}–${hg}${FINAL.has(g.gameState) ? "" : ` · ${text}`}`; const span = document.createElement("span"); span.innerHTML = FINAL.has(g.gameState) ? `Final ${ag}–${hg}${g.gameOutcome?.lastPeriodType && g.gameOutcome.lastPeriodType !== "REG" ? ` (${g.gameOutcome.lastPeriodType})` : ""}` : html; [...card.childNodes].filter((n) => !(n.nodeType === 1 && n.matches("a.btn-sm"))).forEach((n) => n.remove()); card.prepend(span); }
}
function applyScore(el, g) {
  const hg = g.homeTeam?.score ?? 0, ag = g.awayTeam?.score ?? 0;
  el.dataset.state = g.gameState;
  if (FINAL.has(g.gameState)) paintStatus(g, "Final", "");
  if (FINAL.has(g.gameState)) { setBlock(el, null, finalLabel(el, hg, ag)); el.classList.add("is-final"); return; }
  if (!LIVE.has(g.gameState)) return;
  const pd = g.periodDescriptor ?? {}, c = g.clock ?? {};
  const s = { hg, ag, period: pd.number ?? g.period ?? 1, left: c.secondsRemaining ?? 1200, playoff: pre(el).playoff, shootout: pd.periodType === "SO" };
  const { lh, la } = pre(el);
  const ph = W.liveProb(lh, la, s);
  const when = c.inIntermission ? `${perLabel(s.period, pd.periodType)} int.` : `${perLabel(s.period, pd.periodType)} ${esc(c.timeRemaining ?? "")}`;
  setBlock(el, ph, `<span class="live-dot">Live</span> ${ag}–${hg} · ${when}`);
  paintStatus(g, when, "live-dot");
  document.querySelectorAll(`[data-live-status="${g.id}"]`).forEach((x) => (x.textContent = `${ag}–${hg} · ${when}`));
}

// ---------- gamecenter: play-by-play, with power plays, pulled goalies and the chart ----------
function parsePbp(j) {
  const homeId = j.homeTeam?.id;
  const el = (p) => (p.periodDescriptor.number - 1) * 1200 + secs(p.timeInPeriod);
  const goals = [], pens = [];
  for (const p of j.plays ?? []) {
    const d = p.details ?? {};
    if (p.typeDescKey === "goal" && p.periodDescriptor.periodType !== "SO") goals.push({ t: el(p), side: d.eventOwnerTeamId === homeId ? "h" : "a", hg: d.homeScore, ag: d.awayScore, who: d.scoringPlayerId, code: p.situationCode });
    if (p.typeDescKey === "penalty" && ["MIN", "BEN", "MAJ"].includes(d.typeCode) && [2, 4, 5].includes(d.duration)) pens.push({ t: el(p), side: d.eventOwnerTeamId === homeId ? "h" : "a", end: el(p) + d.duration * 60, minor: d.duration !== 5 });
  }
  // A power-play goal ends the earliest minor on the shorthanded team.
  for (const g of goals) {
    const other = g.side === "h" ? "a" : "h";
    const act = (s) => pens.filter((x) => x.side === s && x.t <= g.t && x.end > g.t);
    if (act(other).length > act(g.side).length) { const m = act(other).filter((x) => x.minor).sort((x, y) => x.end - y.end)[0]; if (m) m.end = g.t; }
  }
  const names = Object.fromEntries((j.rosterSpots ?? []).map((r) => [r.playerId, `${r.firstName?.default?.[0] ?? ""}. ${r.lastName?.default ?? ""}`]));
  return { goals, pens, names };
}
function stateAt(t, D, playoff) {
  let hg = 0, ag = 0;
  for (const g of D.goals) if (g.t <= t) { hg = g.hg; ag = g.ag; }
  const act = (s) => D.pens.filter((x) => x.side === s && x.t <= t && x.end > t);
  const rem = (l) => Math.max(0, ...l.map((x) => x.end - t));
  const aH = act("h"), aA = act("a");
  const period = t >= 3600 ? 4 + Math.floor((t - 3600) / (playoff ? 1200 : 300)) : Math.floor(t / 1200) + 1;
  const left = t >= 3600 ? (playoff ? 1200 - ((t - 3600) % 1200) : 300 - (t - 3600)) : 1200 - (t % 1200);
  return { hg, ag, period, left, playoff, ppHome: aA.length > aH.length ? rem(aA) : 0, ppAway: aH.length > aA.length ? rem(aH) : 0 };
}

async function pollPbp() {
  const id = chartEl.dataset.wpChart, el = blocks.find((b) => b.dataset.wp === id);
  if (!el) return false;
  try {
    const r = await fetch(`/live/pbp/${id}/?t=${Math.floor(Date.now() / 15000)}`, { cache: "no-store" });
    if (!r.ok) return true;
    const j = await r.json();
    const { lh, la, playoff } = pre(el), D = parsePbp(j);
    const st = j.gameState, pd = j.periodDescriptor ?? {}, c = j.clock ?? {};
    const hg = j.homeTeam?.score ?? 0, ag = j.awayTeam?.score ?? 0;
    if (!LIVE.has(st) && !FINAL.has(st)) return true;
    // Current moment
    const now = FINAL.has(st) ? Math.max(3600, ...D.goals.map((g) => g.t)) : (pd.number - 1) * 1200 + ((pd.number >= 4 && !playoff ? 300 : 1200) - (c.secondsRemaining ?? 0));
    const last = (j.plays ?? []).at(-1), sit = W.situation(last?.situationCode);
    const cur = { ...stateAt(now, D, playoff), hg, ag, period: pd.number ?? 1, left: c.secondsRemaining ?? 0, shootout: pd.periodType === "SO", enHome: !sit.homeG, enAway: !sit.awayG, final: FINAL.has(st) };
    const ph = W.liveProb(lh, la, cur);
    // Score head (the build snapshot can be behind)
    const set = (k, v) => { const x = document.querySelector(`#gc [data-k="${k}"]`); if (x) x.innerHTML = v; };
    set("away-score", ag); set("home-score", hg);
    if (FINAL.has(st)) { set("status", `Final${pd.periodType && pd.periodType !== "REG" ? ` (${pd.periodType})` : ""}`); setBlock(el, null, finalLabel(el, hg, ag)); }
    else {
      const when = c.inIntermission ? `${perLabel(pd.number, pd.periodType)} intermission` : `${perLabel(pd.number, pd.periodType)} · ${esc(c.timeRemaining ?? "")}`;
      set("status", `<span class="live-dot">${when}</span>`);
      const extra = cur.ppHome ? ` · ${esc(j.homeTeam.abbrev)} PP` : cur.ppAway ? ` · ${esc(j.awayTeam.abbrev)} PP` : cur.enHome && cur.period >= 3 ? ` · ${esc(j.homeTeam.abbrev)} goalie pulled` : cur.enAway && cur.period >= 3 ? ` · ${esc(j.awayTeam.abbrev)} goalie pulled` : "";
      setBlock(el, ph, `<span class="live-dot">Live</span> ${ag}–${hg}${extra}`);
      const sub = document.querySelector('[data-k="wp-sub"]'); if (sub) sub.textContent = "updating live";
    }
    drawChart(j, D, { lh, la, playoff }, now, cur);
    return !FINAL.has(st);
  } catch { return true; }
}

function drawChart(j, D, R, now, cur) {
  const pts = [];
  const at = (t) => W.liveProb(R.lh, R.la, stateAt(t, D, R.playoff));
  for (let t = 0; t < now; t += 20) pts.push([t, at(t)]);
  for (const g of D.goals) if (g.t <= now) { pts.push([g.t - 0.5, at(g.t - 1)]); pts.push([g.t, at(g.t)]); }
  pts.sort((a, b) => a[0] - b[0]);
  pts.push([now, W.liveProb(R.lh, R.la, cur)]);
  const end = Math.max(3600, now), X = (t) => 36 + (t / end) * 556, Y = (p) => 12 + (1 - p) * 140;
  const line = pts.map(([t, p], i) => `${i ? "L" : "M"}${X(t).toFixed(1)} ${Y(p).toFixed(1)}`).join("");
  const area = `${line}L${X(now).toFixed(1)} ${Y(0.5)}L${X(0)} ${Y(0.5)}Z`;
  const H = j.homeTeam.abbrev, A = j.awayTeam.abbrev, last = pts.at(-1)[1];
  const marks = D.goals.filter((g) => g.t <= now).map((g) => `<circle cx="${X(g.t).toFixed(1)}" cy="${Y(at(g.t)).toFixed(1)}" r="4" class="wpc-goal ${g.side}"><title>${esc(D.names[g.who] ?? "Goal")} (${g.side === "h" ? H : A}) · ${g.ag}–${g.hg}</title></circle>`).join("");
  const per = [1200, 2400, 3600].filter((t) => t < end).map((t) => `<line x1="${X(t)}" x2="${X(t)}" y1="12" y2="152" class="wpc-per"/>`).join("");
  const labels = ["P1", "P2", "P3", ...(end > 3600 ? ["OT"] : [])].map((l, i) => `<text x="${X(i * 1200 + (i < 3 ? 600 : (end - 3600) / 2))}" y="166" class="wpc-t" text-anchor="middle">${l}</text>`).join("");
  chartEl.hidden = false;
  chartEl.innerHTML = `<svg viewBox="0 0 600 172" role="img" aria-label="${esc(`Win chance through the game: ${H} ${P(last)} now`)}">
    <clipPath id="wpc-top"><rect x="0" y="0" width="600" height="${Y(0.5)}"/></clipPath><clipPath id="wpc-bot"><rect x="0" y="${Y(0.5)}" width="600" height="200"/></clipPath>
    <path d="${area}" class="wpc-area h" clip-path="url(#wpc-top)"/><path d="${area}" class="wpc-area a" clip-path="url(#wpc-bot)"/>
    ${per}<line x1="36" x2="592" y1="${Y(0.5)}" y2="${Y(0.5)}" class="wpc-mid"/>
    <path d="${line}" class="wpc-line"/>${marks}
    <text x="2" y="22" class="wpc-t b">${esc(H)}</text><text x="2" y="150" class="wpc-t b">${esc(A)}</text>
    <text x="2" y="${Y(0.5) + 4}" class="wpc-t">50%</text>${labels}
  </svg>`;
}

function start() {
  if (chartEl) {
    const el = blocks.find((b) => b.dataset.wp === chartEl.dataset.wpChart);
    const st = el?.dataset.state, t = Date.parse(el?.dataset.start ?? "");
    const tick = async () => {
      if (document.hidden || Date.now() < t - 10 * 60e3) return;
      const keep = await pollPbp();
      if (!keep) clearInterval(iv);
    };
    // Final games draw the chart once; live or soon-to-start games keep polling.
    const iv = setInterval(tick, 20000);
    if (FINAL.has(st)) { clearInterval(iv); pollPbp(); }
    else if (LIVE.has(st) || Date.now() > t - 10 * 60e3) tick();
    return;
  }
  pollScores();
  setInterval(() => { if (!document.hidden) pollScores(); }, 30000);
}

if (blocks.length) start();
