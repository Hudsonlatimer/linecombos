// Live World Juniors forecast. Pulls finished games from Wikipedia's tournament page every minute, runs the same simulation
// the build uses, and re-draws the odds, bracket and game win chances. You can also enter scores and nudge team ratings
// to see how the tournament changes; your edits stay on this device.
const S = await import("/assets/wjcsim.js");

const $ = (id) => document.getElementById(id);
const odds$ = $("wjc-odds"), games$ = $("wjc-games"), bracket$ = $("wjc-bracket"), tiles$ = $("wjc-tiles"), ctl$ = $("wjc-ctl");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pc = (x, d = 0) => (x > 0 && x < 0.005 && d === 0 ? "<1%" : `${(x * 100).toFixed(d)}%`);
const KEY = "lc-wjc-whatif";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? { scores: {}, adj: {} }; } catch { return { scores: {}, adj: {} }; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

async function start() {
  let D;
  try { D = await fetch("/data/wjc-live.json", { cache: "no-store" }).then((r) => r.json()); } catch { return; }
  const T = Object.fromEntries(D.cfg.teams.map((t) => [t.code, t]));
  const codes = new Set(D.cfg.teams.map((t) => t.code));
  const groupGames = D.cfg.schedule.filter((g) => /^Group/.test(g.round));
  let user = load(), feed = { results: {}, playoffResults: {}, games: 0, at: null, ok: null }, timer = null;

  const tl = (c, link = true) => (c ? `${link ? `<a href="/wjc/${c.toLowerCase()}/">` : ""}<span class="flag">${T[c].flag}</span> ${esc(T[c].name)}${link ? "</a>" : ""}` : `<span class="muted">TBD</span>`);
  const bar = (pa, a, b) => `<span class="wb" role="img" aria-label="${esc(`${T[a].name} ${pc(pa)}, ${T[b].name} ${pc(1 - pa)}`)}"><b class="wb-p">${pc(pa)}</b><span class="wb-t"><i style="width:${(pa * 100).toFixed(1)}%;background:var(--wjc-a,#3b82f6)"></i><i style="width:${((1 - pa) * 100).toFixed(1)}%;background:var(--wjc-b,#ef4444)"></i></span><b class="wb-p">${pc(1 - pa)}</b></span>`;
  const local = (utc) => new Date(utc).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  function effective() {
    const results = { ...D.results, ...feed.results };
    for (const [n, v] of Object.entries(user.scores)) { if (v && Number.isInteger(v.a) && Number.isInteger(v.b)) results[n] = v; else delete results[n]; }
    const ratings = Object.fromEntries(Object.entries(D.ratings).map(([c, r]) => [c, r.rating + (user.adj[c] ?? 0)]));
    return { results, playoffResults: { ...D.playoffResults, ...feed.playoffResults }, ratings };
  }

  function render(sim) {
    const B = sim.bracket, proj = { 21: B.relegation, 22: B.qf[0], 23: B.qf[1], 24: B.qf[2], 25: B.qf[3], 26: B.sf[0], 27: B.sf[1], 28: B.bronze, 29: B.final };
    if (odds$) {
      const rows = Object.values(sim.odds).sort((a, b) => b.gold - a.gold || b.medal - a.medal), max = Math.max(...rows.map((o) => o.gold), 0.01);
      const tb = rows.map((o) => `<tr><td><a class="team-cell" href="/wjc/${o.code.toLowerCase()}/"><span class="flag">${T[o.code].flag}</span><b>${esc(T[o.code].name)}</b></a></td><td class="n muted">${o.group}</td>
        <td class="n">${o.rating >= 0 ? "+" : ""}${o.rating.toFixed(2)}</td><td class="n">${pc(o.winGroup)}</td><td class="n">${pc(o.qf)}</td><td class="n">${pc(o.sf)}</td><td class="n">${pc(o.final)}</td>
        <td class="n gold-cell"><span class="gold-bar"><i style="width:${(o.gold / max) * 100}%"></i></span><b>${pc(o.gold, 1)}</b></td><td class="n">${pc(o.medal)}</td><td class="n ${o.rel >= 0.15 ? "down" : "muted"}">${pc(o.rel)}</td></tr>`).join("");
      const tbl = odds$.querySelector("tbody");
      if (tbl) tbl.innerHTML = tb;
    }
    if (games$) {
      const rows = D.cfg.schedule.map((g) => {
        const f = sim.games[g.n], pj = proj[g.n];
        if (f) {
          const res = f.result, mid = res ? `<b class="wscore">${res.a}–${res.b}${res.ot ? ` ${esc(res.ot)}` : ""}</b>` : bar(f.pa, g.a, g.b), sub = res ? `<span class="muted small">Final</span>` : `<span class="muted small">Projected ${f.la.toFixed(1)}–${f.lb.toFixed(1)} · OT ${pc(f.ot)}</span>`;
          return `<tr><td>${local(g.utc)}</td><td class="muted">${esc(g.round.replace("Group ", "Gp "))}</td><td class="wg">${tl(g.a)}<span class="muted"> vs </span>${tl(g.b)}</td><td class="wp-cell">${mid}${sub}</td></tr>`;
        }
        const fin = pj?.result, mid = fin ? `<b class="wscore">${fin.a ?? "?"}–${fin.b ?? "?"}${fin.ot ? ` ${esc(fin.ot)}` : ""}</b>` : pj ? bar(pj.pa, pj.a, pj.b) : `<span class="muted">Set after the group stage</span>`;
        const lbl = pj ? `<span class="muted small">${fin ? "Final" : "Projected matchup"}: ${tl(pj.a, false)} vs ${tl(pj.b, false)}</span>` : '<span class="muted">TBD</span>';
        return `<tr class="tbd"><td>${local(g.utc)}</td><td class="muted">${esc(g.round)}</td><td class="wg">${lbl}</td><td class="wp-cell">${mid}</td></tr>`;
      }).join("");
      const tb = games$.querySelector("tbody"); if (tb) tb.innerHTML = rows;
    }
    if (bracket$) {
      const card = (m, tag) => {
        const row = (c, p, s) => `<div class="bk-t${m.win === c ? " win" : ""}"><span class="bk-s">${s ?? ""}</span><span class="flag">${T[c].flag}</span><b>${esc(T[c].name)}</b><em>${m.result ? (c === m.a ? m.result.a : m.result.b) ?? "" : pc(p)}</em></div>`;
        return `<div class="bk-m"><div class="bk-h"><span>${esc(m.label)}</span><span class="muted">${m.result ? "Final" : `${m.la}–${m.lb}`}</span></div>${row(m.a, m.pa, tag?.[0])}${row(m.b, 1 - m.pa, tag?.[1])}</div>`;
      };
      const seeds = [["A1", "B4"], ["B2", "A3"], ["B1", "A4"], ["A2", "B3"]];
      bracket$.querySelector(".bk").innerHTML = `<div class="bk-col"><h3>Quarterfinals</h3>${B.qf.map((m, i) => card(m, seeds[i])).join("")}</div>
        <div class="bk-col mid"><h3>Semifinals</h3>${B.sf.map((m) => card(m)).join("")}</div>
        <div class="bk-col end"><h3>Gold medal</h3>${card(B.final)}<h3 class="sub">Bronze medal</h3>${card(B.bronze)}<h3 class="sub">Relegation game</h3>${card(B.relegation, ["5A", "5B"])}</div>`;
    }
    if (tiles$) {
      const rel = B.relegation.a === B.relegation.win ? B.relegation.b : B.relegation.a, t = (c, k) => `<div class="tile-stat"><b>${T[c].flag} ${esc(T[c].name)}</b><span>${k}</span></div>`;
      tiles$.innerHTML = t(B.champion, `Projected gold · ${pc(sim.odds[B.champion].gold)} to win it`) + t(B.silver, "Projected silver") + t(B.bronzeWinner, "Projected bronze") + t(rel, "Projected relegation");
    }
  }

  function recompute() {
    const e = effective();
    const sim = S.simulate({ teams: D.cfg.teams, schedule: D.cfg.schedule, ratings: e.ratings, results: e.results, playoffResults: e.playoffResults, T: D.T, sims: 8000, seed: 20261226 });
    render(sim);
    status();
  }

  // ----- controls
  function status() {
    const el = $("wl-status"); if (!el) return;
    const edits = Object.keys(user.scores).length + Object.values(user.adj).filter(Boolean).length;
    const n = Object.keys({ ...D.results, ...feed.results }).length;
    el.innerHTML = `${feed.ok === false ? "Couldn't reach Wikipedia, using the last build's results" : feed.at ? `Results from <a href="${esc(D.wikiPage)}" target="_blank" rel="noopener">Wikipedia</a> checked ${feed.at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Checking for results…"} · ${n} of ${groupGames.length} group games played${edits ? ` · <b>${edits} of your changes applied</b>` : ""}`;
  }
  function buildControls() {
    if (!ctl$) return;
    const rows = groupGames.map((g) => {
      const u = user.scores[g.n], fr = { ...D.results, ...feed.results }[g.n], v = u ?? fr ?? {};
      return `<tr data-n="${g.n}"><td class="muted small">${local(g.utc)}</td><td class="r">${tl(g.a, false)}</td><td><input type="number" min="0" max="20" inputmode="numeric" data-s="a" value="${v.a ?? ""}" ${fr && !u ? "class=\"from-feed\"" : ""}> – <input type="number" min="0" max="20" inputmode="numeric" data-s="b" value="${v.b ?? ""}" ${fr && !u ? "class=\"from-feed\"" : ""}></td><td>${tl(g.b, false)}</td>
        <td><select data-s="ot" aria-label="Decided in"><option value="">Reg.</option><option value="OT"${v.ot === "OT" ? " selected" : ""}>OT</option><option value="SO"${v.ot === "SO" ? " selected" : ""}>SO</option></select></td></tr>`;
    }).join("");
    const sliders = D.cfg.teams.map((t) => `<label class="adj"><span>${t.flag} ${esc(t.name)} <b data-adj-v="${t.code}">${fmtAdj(user.adj[t.code] ?? 0)}</b></span><input type="range" min="-1.5" max="1.5" step="0.05" value="${user.adj[t.code] ?? 0}" data-adj="${t.code}"><small class="muted">base ${D.ratings[t.code].rating >= 0 ? "+" : ""}${D.ratings[t.code].rating.toFixed(2)}</small></label>`).join("");
    ctl$.innerHTML = `<section class="card wjc-ctl"><div class="wjc-ctl-head"><span class="live-dot">Live</span><span id="wl-status" class="muted small"></span><span class="sp"></span><button type="button" class="btn-sm" id="wl-refresh">Check now</button><button type="button" class="btn-sm" id="wl-reset">Reset my changes</button></div>
      <details><summary>What if? Change results and team ratings</summary>
        <p class="muted small">Enter a score to lock a game in; leave it empty to simulate it. Numbers from the live feed are tinted. Drag a rating to make a team stronger or weaker (goals per game vs an average team). Everything updates instantly and stays on this device.</p>
        <div class="wjc-edit"><div><h4>Group games</h4><div class="table-wrap"><table class="tbl compact wjc-scores"><tbody>${rows}</tbody></table></div></div><div><h4>Team ratings</h4><div class="adjs">${sliders}</div></div></div></details></section>`;
    $("wl-refresh").addEventListener("click", () => poll(true));
    $("wl-reset").addEventListener("click", () => { user = { scores: {}, adj: {} }; save(user); buildControls(); recompute(); });
  }
  const fmtAdj = (v) => (v ? `${v > 0 ? "+" : ""}${v.toFixed(2)}` : "0");
  function onInput(e) {
    const t = e.target;
    if (t.dataset.adj) { const v = +t.value; if (v) user.adj[t.dataset.adj] = v; else delete user.adj[t.dataset.adj]; const out = ctl$.querySelector(`[data-adj-v="${t.dataset.adj}"]`); if (out) out.textContent = fmtAdj(v); }
    else if (t.dataset.s) {
      const tr = t.closest("tr"), n = tr.dataset.n, a = tr.querySelector('[data-s="a"]').value, b = tr.querySelector('[data-s="b"]').value, ot = tr.querySelector('[data-s="ot"]').value || null;
      if (a !== "" && b !== "" && +a !== +b) user.scores[n] = { a: +a, b: +b, ot }; else if (a === "" && b === "") delete user.scores[n]; else return;
    } else return;
    save(user); clearTimeout(timer); timer = setTimeout(recompute, 150);
  }

  // ----- live results from Wikipedia
  async function poll(force) {
    try {
      const j = await fetch(`${D.wikiApi}&origin=*`, { cache: "no-store" }).then((r) => r.json());
      const parsed = S.parseWiki(j?.parse?.wikitext ?? "", codes);
      const m = S.matchResults(parsed, D.cfg.schedule);
      const changed = JSON.stringify(m) !== JSON.stringify({ results: feed.results, playoffResults: feed.playoffResults });
      feed = { results: m.results, playoffResults: m.playoffResults, games: parsed.length, at: new Date(), ok: true };
      if (changed || force) { if (!ctl$.querySelector("details[open]")) buildControls(); recompute(); } else status();
    } catch { feed.ok = false; status(); }
  }

  buildControls();
  ctl$?.addEventListener("input", onInput);
  const first = Object.keys(D.results).length || Object.keys(user.scores).length || Object.values(user.adj).some(Boolean);
  if (first) recompute(); else status();
  poll();
  setInterval(() => { if (!document.hidden) poll(); }, 60000);
}

if (odds$ || games$ || bracket$) start();
