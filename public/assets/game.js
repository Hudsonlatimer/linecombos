// Gamecenter: renders a game JSON (build snapshot or live worker) and keeps it fresh during games.
(() => {
  const root = document.getElementById("gc");
  if (!root) return;
  const id = root.dataset.game, liveApi = root.dataset.liveApi?.replace(/\/$/, "");
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  const per = (n, type) => (type === "OT" || n === 4 ? "OT" : type === "SO" ? "SO" : n > 4 ? `${n - 3}OT` : `P${n}`);
  const LIVE = new Set(["LIVE", "CRIT"]), FINAL = new Set(["OFF", "FINAL"]);
  const pageData = JSON.parse(document.getElementById("page-data")?.textContent || "{}");
  const initial = pageData.snapshot, COLORS = pageData.colors ?? {};
  let G = initial;

  const pn = (pid) => {
    const p = G.players[pid];
    return p ? `<a class="pl" href="/players/${pid}/"><span class="num">${esc(p.num)}</span>${esc(p.name)}</a>` : "?";
  };
  const keyOf = (ids) => [...ids].sort((a, b) => a - b).join("-");

  const DEFAULT_SHOT = "https://assets.nhle.com/mugs/nhl/default-skater.png";
  const shot = (pid) => {
    const p = G.players[pid];
    return p ? `https://assets.nhle.com/mugs/nhl/${G.season ?? `${String(G.id).slice(0, 4)}${+String(G.id).slice(0, 4) + 1}`}/${G[p.side].abbrev}/${pid}.png` : DEFAULT_SHOT;
  };
  const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
  const card = (pid) => {
    const p = G.players[pid];
    if (!p) return `<div class="up-card"><img class="up-shot" src="${DEFAULT_SHOT}" alt="" width="52" height="52"><span class="up-name">?</span></div>`;
    const pm = p.pm ?? 0;
    return `<a class="up-card${p.g ? " scored" : ""}" href="/players/${pid}/">
      <img class="up-shot" src="${esc(shot(pid))}" alt="" width="52" height="52" loading="lazy" onerror="this.onerror=null;this.src='${DEFAULT_SHOT}'">
      <span class="up-name"><i>${esc(p.num)}</i>${esc(p.name)}</span>
      <span class="up-stats" title="This game: goals, assists, points, plus/minus"><span><b>${p.g}</b>G</span><span><b>${p.a}</b>A</span><span><b>${p.pts}</b>P</span><span class="${pm > 0 ? "up" : pm < 0 ? "down" : ""}"><b>${signed(pm)}</b></span></span></a>`;
  };

  function comboBlock(list, labels, side) {
    if (!list?.length) return `<p class="empty">No data yet.</p>`;
    const max = Math.max(...list.map((c) => c.sec), 1);
    const first = G.lines[side].byPeriod?.[1]?.map(keyOf) ?? [];
    const latestP = Math.max(...Object.keys(G.lines[side].byPeriod ?? {}).map(Number), 0);
    const latest = G.lines[side].byPeriod?.[latestP]?.map(keyOf) ?? [];
    return list.map((c, i) => {
      const k = keyOf(c.ids);
      const isTrio = c.ids.length === 3 && labels[0] === "L1";
      const newLate = isTrio && latestP > 1 && latest.includes(k) && !first.includes(k);
      const brokeUp = isTrio && latestP > 1 && first.includes(k) && !latest.includes(k);
      const gd = c.gf - c.ga;
      return `<div class="unit">
        <div class="unit-head"><span class="slot">${labels[i] ?? ""}</span><span class="bar"><span style="width:${Math.max(4, (c.sec / max) * 100)}%"></span></span><span class="toi">${mmss(c.sec)}</span></div>
        <div class="unit-players n${c.ids.length}">${c.ids.map(card).join("")}</div>
        <div class="meta"><span class="oi">SF ${c.sf}–${c.sa} · CF ${c.cf}–${c.ca} · GF ${c.gf}–${c.ga}${gd ? ` <b class="${gd > 0 ? "up" : "down"}">${signed(gd)}</b>` : ""}</span>
        ${newLate ? `<span class="pill new">New in ${per(latestP)}</span>` : ""}${brokeUp ? `<span class="pill warn">Not used in ${per(latestP)}</span>` : ""}</div>
      </div>`;
    }).join("");
  }

  const STR = { PP: ["PPG", "info"], SH: ["SHG", "warn"], EN: ["EN", "muted"], SO: ["SO", "muted"] };
  function scoring() {
    const goals = G.goals ?? [];
    const started = LIVE.has(G.state) || FINAL.has(G.state);
    if (!started) return "";
    const byP = {};
    for (const g of goals) (byP[`${g.p}|${g.type}`] ??= { n: g.p, type: g.type, list: [] }).list.push(g);
    const pens = G.penalties ?? [];
    const lastP = Math.max(G.period ?? 1, ...goals.map((g) => g.p), 1);
    const periodsShown = [];
    for (let n = 1; n <= Math.min(lastP, 3); n++) periodsShown.push(byP[`${n}|REG`] ?? { n, type: "REG", list: [] });
    for (const v of Object.values(byP)) if (v.type !== "REG") periodsShown.push(v);
    const pname = (pid, tot) => {
      const p = G.players[pid];
      return p ? `<a href="/players/${pid}/">${esc(p.name)}</a>${tot != null ? ` <span class="muted">(${tot})</span>` : ""}` : "";
    };
    const row = (g) => {
      const t = G[g.side];
      const st = STR[g.str];
      const assists = [g.a1 && pname(g.a1, g.a1Tot), g.a2 && pname(g.a2, g.a2Tot)].filter(Boolean);
      return `<div class="goal-row">
        <span class="goal-time">${esc(g.t)}</span>
        <img class="logo" src="${esc(t.logo)}" data-dark="${esc(t.darkLogo)}" width="26" height="26" alt="${esc(t.abbrev)}">
        <img class="goal-shot" src="${esc(shot(g.by))}" alt="" width="40" height="40" loading="lazy" onerror="this.onerror=null;this.src='${DEFAULT_SHOT}'">
        <span class="goal-main"><b>${pname(g.by, g.byTot)}</b>${st ? ` <span class="pill ${st[1]}">${st[0]}</span>` : ""}
          <span class="goal-ast">${assists.length ? `Assists: ${assists.join(", ")}` : g.str === "SO" ? "Shootout" : "Unassisted"}${g.shot ? ` · ${esc(g.shot)}` : ""}</span></span>
        <span class="goal-score"><span class="${g.side === "away" ? "hl" : ""}">${g.away}</span>–<span class="${g.side === "home" ? "hl" : ""}">${g.home}</span>${g.vid ? `<button type="button" class="goal-clip" data-vid="${esc(g.vid)}" aria-expanded="false" title="Watch the goal">▶</button>` : ""}</span>
      </div>${g.vid ? `<div class="goal-video" data-for="${esc(g.vid)}" hidden></div>` : ""}`;
    };
    const penRows = pens.map((p) => `<div class="pen-row"><span class="goal-time">${per(p.p, p.type)} ${esc(p.t)}</span><b>${esc(G[p.side].abbrev)}</b><span>${p.by ? pname(p.by) : "Team"}</span><span class="muted">${esc(p.what)}${p.min ? ` · ${p.min} min` : ""}</span></div>`).join("");
    return `<section class="card scoring"><h2>Scoring summary</h2>
      ${periodsShown.map((P) => `<div class="sc-period"><h3>${P.type === "SO" ? "Shootout" : P.type === "OT" || P.n === 4 ? "Overtime" : `${["1st", "2nd", "3rd"][P.n - 1] ?? `${P.n}th`} period`}</h3>
        ${P.list.length ? P.list.map(row).join("") : `<p class="empty">No goals</p>`}</div>`).join("")}
      ${pens.length ? `<details class="pens"><summary>Penalties (${pens.length})</summary>${penRows}</details>` : ""}
    </section>`;
  }

  function teamLines(side) {
    const t = G[side], L = G.lines?.[side];
    if (!L) return `<section class="card"><h2>${esc(t.name)}</h2><p class="empty">Shift data isn't posted yet. It usually appears within the first period.</p></section>`;
    return `<section class="card"${COLORS[side] ? ` style="--team:${esc(COLORS[side])}"` : ""}><h2><img class="logo" src="${esc(t.logo)}" data-dark="${esc(t.darkLogo)}" width="22" height="22" alt=""> ${esc(t.name)} <span class="stage stage-${FINAL.has(G.state) ? "actual" : "live"}">${FINAL.has(G.state) ? "Actual" : "Live"}</span></h2>
      <h3>Forward lines · 5v5 ${mmss(L.toi.es)}</h3>${comboBlock(L.lines, ["L1", "L2", "L3", "L4"], side)}
      <h3>Defence pairs</h3>${comboBlock(L.pairs, ["D1", "D2", "D3"], side)}
      <h3>Power play · ${mmss(L.toi.pp)}</h3>${comboBlock(L.pp, ["PP1", "PP2"], side)}
      <h3>Penalty kill · ${mmss(L.toi.pk)}</h3>${comboBlock(L.pk, ["PK1", "PK2"], side)}
    </section>`;
  }

  function rink() {
    const goals = G.shots.filter((s) => s.type === "goal");
    const dots = G.shots.map((s) => `<circle cx="${s.x}" cy="${-s.y}" r="${s.type === "goal" ? 2.6 : 1.7}" class="shot-${s.side}${s.type === "goal" ? " shot-goal" : ""}${s.type === "missed-shot" ? " shot-miss" : ""}" opacity="${s.type === "missed-shot" ? 0.45 : 1}"><title>${esc(G.players[s.by]?.name ?? "")} · ${esc(s.type.replace("-", " "))} · ${per(s.p)} ${esc(s.t)}${s.st ? " · " + esc(s.st) : ""}</title></circle>`).join("");
    return `<section class="card"><h2>Shot map <span class="muted small">${G.away.abbrev} attacks left · ${G.home.abbrev} attacks right</span></h2>
      <svg class="rink" viewBox="-101 -43.5 202 87" role="img" aria-label="Shot map">
        <rect class="ice" x="-100" y="-42.5" width="200" height="85" rx="28" stroke-width=".6"/>
        <line class="red" x1="0" y1="-42.5" x2="0" y2="42.5" stroke-width=".8"/>
        <line class="blue" x1="-25" y1="-42.5" x2="-25" y2="42.5" stroke-width=".8"/><line class="blue" x1="25" y1="-42.5" x2="25" y2="42.5" stroke-width=".8"/>
        <line class="red" x1="-89" y1="-40" x2="-89" y2="40" stroke-width=".4"/><line class="red" x1="89" y1="-40" x2="89" y2="40" stroke-width=".4"/>
        ${[[-69, -22], [-69, 22], [69, -22], [69, 22], [0, 0]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="15" fill="none" class="red" stroke-width=".35"/>`).join("")}
        <path d="M-89 -3 a6 6 0 0 1 0 6Z M89 -3 a6 6 0 0 0 0 6Z" fill="#7fb2ff" opacity=".35"/>
        ${dots}
      </svg>
      <div class="legend"><span><i style="border:1.5px solid var(--muted)"></i>${esc(G.away.abbrev)} shot</span><span><i style="background:var(--muted)"></i>${esc(G.away.abbrev)} goal</span><span><i style="border:1.5px solid var(--accent)"></i>${esc(G.home.abbrev)} shot</span><span><i style="background:var(--accent)"></i>${esc(G.home.abbrev)} goal</span><span>Faded = missed</span></div>
      <p class="muted small">${goals.length} goals · ${G.shots.filter((s) => s.type !== "missed-shot").length} shots on goal plotted</p></section>`;
  }

  function periods() {
    if (!G.periods.length) return "";
    const max = Math.max(...G.periods.flatMap((p) => [p.away.att, p.home.att]), 1);
    return `<section class="card"><h2>Shot attempts by period</h2>
      ${G.periods.map((p) => `<div class="pbar"><span class="slot">${per(p.n, p.type)}</span><span class="a" style="width:${(p.away.att / max) * 100}%">${p.away.att}</span><span class="h" style="width:${(p.home.att / max) * 100}%">${p.home.att}</span></div>`).join("")}
      <div class="legend"><span><i style="background:var(--muted)"></i>${esc(G.away.abbrev)}</span><span><i style="background:var(--accent)"></i>${esc(G.home.abbrev)}</span><span>SOG ${G.periods.reduce((s, p) => s + p.away.sog, 0)}–${G.periods.reduce((s, p) => s + p.home.sog, 0)}</span></div></section>`;
  }

  // Box score columns: [label, value getter, display]. Click a header to sort; each column's game leader is highlighted.
  const BOX = [
    ["G", (p) => p.g], ["A", (p) => p.a], ["P", (p) => p.pts], ["SOG", (p) => p.sog], ["+/-", (p) => p.pm, (v) => (v > 0 ? `+${v}` : `${v}`)],
    ["HIT", (p) => p.hits], ["BLK", (p) => p.blk ?? 0], ["FO%", (p) => (p.fo != null && p.fo > 0 ? p.fo : null), (v) => (v == null ? "—" : `${Math.round(v * 100)}`)],
    ["TOI", (p) => { const [m, x] = String(p.toi ?? "0:0").split(":").map(Number); return m * 60 + x; }, (v, p) => esc(p.toi)],
  ];
  const sortBy = { away: { col: 2, dir: -1 }, home: { col: 2, dir: -1 } };
  function box(side) {
    const st = sortBy[side], [, get] = BOX[st.col];
    const rows = Object.entries(G.players).filter(([, p]) => p.side === side && p.pos !== "G")
      .sort((x, y) => ((get(y[1]) ?? -1e9) - (get(x[1]) ?? -1e9)) * -st.dir || y[1].pts - x[1].pts || y[1].sog - x[1].sog);
    const lead = BOX.map(([, g]) => { const v = rows.map(([, p]) => g(p)).filter((x) => x != null); const m = Math.max(...v); return v.length && m > 0 ? m : null; });
    const gs = Object.entries(G.players).filter(([, p]) => p.side === side && p.pos === "G" && p.toi && p.toi !== "00:00");
    return `<section class="card"><h2>${esc(G[side].name)} box score <span class="muted small">tap a column to sort</span></h2><div class="table-wrap"><table class="tbl compact box-tbl" data-side="${side}"><thead><tr><th>Player</th>${BOX.map(([l], i) => `<th class="n sortable-h" data-col="${i}"${st.col === i ? ` aria-sort="${st.dir < 0 ? "descending" : "ascending"}"` : ""}>${l}</th>`).join("")}</tr></thead><tbody>
      ${rows.map(([pid, p]) => `<tr><td>${pn(pid)}</td>${BOX.map(([, g, fmt], i) => { const v = g(p); return `<td class="n${lead[i] != null && v === lead[i] ? " lead" : ""}${i === st.col ? " sorted" : ""}">${fmt ? fmt(v, p) : v}</td>`; }).join("")}</tr>`).join("")}
      ${gs.map(([pid, p]) => `<tr class="g-line"><td>${pn(pid)} <span class="muted">G</span></td><td colspan="4" class="n">${p.sv ?? 0}/${p.sa ?? 0} saves</td><td colspan="3" class="n">${p.svPct != null ? Number(p.svPct).toFixed(3).replace(/^0/, "") : ""} SV%</td><td></td><td class="n">${esc(p.toi)}</td></tr>`).join("")}
    </tbody></table></div></section>`;
  }

  function status() {
    if (FINAL.has(G.state)) return `Final${G.outcome && G.outcome !== "REG" ? ` (${G.outcome})` : ""}`;
    if (LIVE.has(G.state)) return `<span class="live-dot">${G.intermission ? `${per(G.period, G.periodType)} intermission` : `${per(G.period, G.periodType)} · ${esc(G.clock ?? "")}`}</span>`;
    return "";
  }

  const thru = (t) => (t % 1200 === 0 ? `the end of ${per(t / 1200)}` : `${per(Math.floor(t / 1200) + 1)} ${mmss(t % 1200)}`);

  function render() {
    if (!G) return;
    root.querySelector('[data-k="away-score"]').textContent = G.away.score;
    root.querySelector('[data-k="home-score"]').textContent = G.home.score;
    root.querySelector('[data-k="status"]').innerHTML = status();
    const lag = G.lines && LIVE.has(G.state) ? `<div class="source-note"><span class="stage stage-live">Live</span><span>Lines are from shift data through ${thru(G.linesThrough)} (the NHL posts shifts about 10 game minutes behind). Shots and scores are near real time. Updated <time datetime="${G.updated}" data-fmt="ago"></time>.</span></div>` : "";
    const body = document.getElementById("gc-body");
    const keep = body.querySelector(".goal-video:not([hidden])") ? body.querySelector(".scoring") : null;
    body.innerHTML = `${lag}
      <div id="gc-scoring">${scoring()}</div>
      <div class="gc-grid" style="margin-top:16px">${teamLines("away")}${teamLines("home")}</div>
      <div class="gc-grid" style="margin-top:16px">${rink()}${periods()}</div>
      <div class="gc-grid" style="margin-top:16px">${box("away")}${box("home")}</div>`;
    if (keep) body.querySelector("#gc-scoring").replaceChildren(keep);
    window.LC?.paintTimes?.();
    window.LC?.swapLogos?.();
  }
  // NHL's own Brightcove player (the one nhl.com uses), embedded inline.
  const NHL_PLAYER = "https://players.brightcove.net/6415718365001/D3UCGynRWU_default/index.html";
  document.getElementById("gc-body")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".goal-clip[data-vid]");
    if (btn) {
      const box = btn.closest(".sc-period")?.querySelector(`.goal-video[data-for="${btn.dataset.vid}"]`);
      if (!box) return;
      const open = box.hidden;
      document.querySelectorAll(".goal-video:not([hidden])").forEach((v) => { v.hidden = true; v.innerHTML = ""; });
      document.querySelectorAll(".goal-clip[aria-expanded=true]").forEach((b) => b.setAttribute("aria-expanded", "false"));
      if (open) {
        box.innerHTML = `<div class="gv-frame"><iframe src="${NHL_PLAYER}?videoId=${encodeURIComponent(btn.dataset.vid)}&autoplay=true" title="Goal video" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
        box.hidden = false; btn.setAttribute("aria-expanded", "true");
      }
      return;
    }
    const th = e.target.closest(".box-tbl th[data-col]");
    if (th) {
      const side = th.closest("table").dataset.side, col = +th.dataset.col, st = sortBy[side];
      st.dir = st.col === col ? -st.dir : -1; st.col = col;
      th.closest("section").outerHTML = box(side);
    }
  });

  // Without a worker, build the game JSON in the browser from the NHL feeds (proxied at /live/), with the same code the build uses.
  let core = null;
  async function liveFromNhl() {
    core ??= await import("/assets/core/game.mjs");
    const j = (u) => fetch(u + (u.includes("?") ? "&" : "?") + "t=" + Math.floor(Date.now() / 10000), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [box, pbp, sh] = await Promise.all([j(`/live/box/${id}/`), j(`/live/pbp/${id}/`), j(`/live/shifts/${id}/`)]);
    if (!box || ["FUT", "PRE"].includes(box.gameState)) return null;
    return core.gameJson({ box, pbp, shifts: sh?.data ?? [] });
  }

  async function refresh() {
    if (!liveApi) {
      try { const n = await liveFromNhl(); if (n) { if (G?.updated && n.updated === G.updated) return; G = n; render(); return; } } catch (e) { console.warn("live build failed", e); }
    }
    const url = liveApi ? `${liveApi}/game/${id}` : `/data/game/${id}.json?t=${Date.now()}`;
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (r.ok) { const n = await r.json(); if (n.updated && n.updated === G?.updated) return; G = n; render(); }
    } catch {}
  }

  render();
  const state = G?.state ?? root.dataset.state;
  if (!FINAL.has(state)) {
    // Live: poll the worker every 20s, or the rebuilt snapshot every 60s. Pre-game: check every 2 min.
    // Live: every 15s. Not started yet: every 45s, so the page flips to live on its own at puck drop.
    const every = LIVE.has(state) ? 15000 : 45000;
    setInterval(() => { if (!document.hidden) refresh(); }, every);
    if (LIVE.has(state)) refresh();
  }
})();
