(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  };

  // Theme
  const swapLogos = () => $$("img[data-dark]").forEach((img) => {
    img.dataset.light ??= img.getAttribute("src");
    const want = isDark() ? img.dataset.dark : img.dataset.light;
    if (img.getAttribute("src") !== want) img.setAttribute("src", want);
  });
  $("#theme")?.addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("theme", next);
    swapLogos();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", swapLogos);
  swapLogos();
  window.LC = { swapLogos, store };

  // Mobile menu
  $("#menu")?.addEventListener("click", (e) => {
    const nav = $("#nav"); nav.classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", nav.classList.contains("open"));
  });

  // Local times
  const fmtTime = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const fmtDay = (d) => d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  const ago = (d) => {
    const s = (Date.now() - d) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
    return fmtDay(d);
  };
  const paintTimes = () => $$("time[datetime][data-fmt]").forEach((t) => {
    const d = new Date(t.getAttribute("datetime"));
    if (isNaN(d)) return;
    const f = t.dataset.fmt;
    t.textContent = f === "ago" ? ago(d) : f === "datetime" ? `${fmtDay(d)}, ${fmtTime(d)}` : fmtTime(d);
    t.title = d.toLocaleString();
  });
  paintTimes();
  setInterval(paintTimes, 60000);
  window.LC.paintTimes = paintTimes;

  // Favourite team
  const fav = store.get("fav");
  $$("[data-fav]").forEach((b) => {
    const on = fav === b.dataset.fav;
    b.setAttribute("aria-pressed", on);
    b.addEventListener("click", () => {
      const now = store.get("fav") === b.dataset.fav ? "" : b.dataset.fav;
      store.set("fav", now);
      b.setAttribute("aria-pressed", now === b.dataset.fav);
    });
  });
  // On the home page, float the favourite team's game to the top.
  if (fav && document.body.dataset.path === "/") {
    const mine = $$(".game-card").find((c) => (c.dataset.teams || "").split(",").includes(fav));
    if (mine) { mine.parentNode.prepend(mine); mine.classList.add("card-accent"); }
  }

  // Search: a command palette over teams, current players and every player in NHL history.
  const pal = $("#palette"), q = $("#q"), box = $("#q-results");
  let base = null, hist = null, sel = 0, hits = [], lastOpener = null;
  const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim();
  const loadBase = () => base ??= fetch("/search.json").then((r) => r.json()).then((l) => l.map((x) => ({ ...x, t: norm(x.n) }))).catch(() => []);
  const loadHist = () => hist ??= fetch("/search-all.json").then((r) => r.json())
    .then((l) => l.map(([id, n, y, pos, gp]) => ({ n, u: `/players/${id}/`, k: "History", s: y, pos, gp, t: norm(n) }))).catch(() => []);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const score = (x, v, words) => {
    const tw = x.t.split(" ");
    if (!words.every((w) => tw.some((t) => t.startsWith(w)) || (w.length > 3 && x.t.includes(w)))) return -1;
    let s = 0;
    if (x.t === v) s += 100;
    if (x.t.startsWith(v)) s += 40;
    if (tw.at(-1).startsWith(words.at(-1))) s += 15;
    if (x.k === "Team" || x.k === "WJC") s += 30;
    else if (x.k !== "History") s += 25;
    else s += Math.min(20, Math.log10(1 + (x.gp || 0)) * 6.5);
    return s;
  };
  const initials = (n) => n.split(" ").filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const row = (x, i) => {
    const pic = x.h ? `<img src="${esc(x.h)}" alt="" loading="lazy" width="36" height="36">` : `<span class="pal-av">${esc(x.k === "Team" ? x.s : initials(x.n))}</span>`;
    const sub = x.k === "Team" ? "Team" : x.k === "WJC" ? "World Juniors" : x.k === "History" ? `${x.pos ?? ""} · NHL ${x.s || ""}${x.gp ? ` · ${x.gp} GP` : ""}` : x.k === "Live" ? (x.s || "Player") : `${x.s ? x.s + " · " : ""}${x.k}`;
    const tag = x.k === "History" ? "History" : x.k === "Team" || x.k === "WJC" || x.k === "Live" ? "" : "Now";
    return `<a href="${esc(x.u)}" role="option" id="qo-${i}" class="pal-row${i === sel ? " sel" : ""}"${x.ext ? ' target="_blank" rel="noopener"' : ""}>${pic}<span class="pal-n">${esc(x.n)}<small>${esc(sub)}</small></span>${tag ? `<span class="pal-k k-${tag.toLowerCase()}">${tag}</span>` : ""}</a>`;
  };
  const paint = (v) => {
    if (!v) {
      box.innerHTML = `<div class="pal-hint"><b>Try</b>${["Connor McDavid", "Wayne Gretzky", "Bobby Orr", "Maple Leafs", "Canada"].map((n) => `<button type="button" data-try="${esc(n)}">${esc(n)}</button>`).join("")}</div>`;
      return;
    }
    box.innerHTML = hits.length ? hits.map(row).join("") : `<div class="pal-empty">No player or team matches “${esc(v)}”.</div>`;
    q.setAttribute("aria-activedescendant", hits.length ? `qo-${sel}` : "");
  };
  let seq = 0;
  const run = async () => {
    const my = ++seq, v = norm(q.value), words = v.split(" ").filter(Boolean);
    sel = 0;
    if (v.length < 2) { hits = []; paint(""); return; }
    const pool = [...(await loadBase()), ...(v.length >= 3 || hist ? await loadHist() : [])];
    if (my !== seq) return;
    const seen = new Set();
    hits = pool.map((x) => [score(x, v, words), x]).filter(([s]) => s >= 0).sort((a, b) => b[0] - a[0])
      .map(([, x]) => x).filter((x) => !seen.has(x.u) && seen.add(x.u)).slice(0, 12);
    paint(v);
    // Not in our index (rare: a call-up from today)? Ask the NHL's own search.
    if (hits.length < 3 && v.length >= 4) {
      const r = await fetch(`https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=6&q=${encodeURIComponent(q.value.trim())}`).then((r) => r.json()).catch(() => []);
      if (my !== seq) return;
      // Every result opens on our site: the player's static page if we built one, otherwise our live profile viewer.
      const known = new Set(pool.map((x) => x.u));
      for (const p of r) {
        const t = norm(p.name), tw = t.split(" ");
        if (!words.every((w) => tw.some((x) => x.startsWith(w)))) continue;
        const page = `/players/${p.playerId}/`;
        if (hits.some((x) => x.u === page)) continue;
        hits.push({ n: p.name, u: known.has(page) ? page : `/player/?id=${p.playerId}&n=${encodeURIComponent(p.name)}`, k: "Live", s: [p.positionCode, p.teamAbbrev || p.lastTeamAbbrev, p.birthCountry].filter(Boolean).join(" · "), t });
      }
      paint(v);
    }
  };
  const open = () => {
    if (!pal) return;
    lastOpener = document.activeElement;
    pal.hidden = false; document.documentElement.classList.add("pal-open");
    q.focus(); q.select(); run();
  };
  const close = () => { pal.hidden = true; document.documentElement.classList.remove("pal-open"); lastOpener?.focus?.(); };
  $$("#q-open, [data-open-search]").forEach((b) => b.addEventListener("click", open));
  pal?.addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) close();
    const t = e.target.closest("[data-try]"); if (t) { q.value = t.dataset.try; run(); q.focus(); }
  });
  q?.addEventListener("input", run);
  q?.addEventListener("focus", () => { loadBase(); });
  q?.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!hits.length) return;
      sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length;
      $$(".pal-row", box).forEach((a, i) => a.classList.toggle("sel", i === sel));
      $(`#qo-${sel}`)?.scrollIntoView({ block: "nearest" });
      q.setAttribute("aria-activedescendant", `qo-${sel}`);
    } else if (e.key === "Enter" && hits[sel]) {
      e.preventDefault();
      hits[sel].ext ? window.open(hits[sel].u, "_blank", "noopener") : (location.href = hits[sel].u);
    }
  });
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); pal.hidden ? open() : close(); }
    else if (e.key === "Escape" && pal && !pal.hidden) close();
  });
  if (!/Mac|iPhone|iPad/.test(navigator.platform)) $$("#q-open kbd").forEach((k) => (k.textContent = "Ctrl K"));

  // Tabs
  $$(".tabs").forEach((tabs) => {
    const scope = tabs.parentElement;
    $$(".tab", tabs).forEach((b) => b.addEventListener("click", () => {
      $$(".tab", tabs).forEach((x) => x.classList.toggle("on", x === b));
      $$(":scope > .tab-panel", scope).forEach((p) => (p.hidden = p.dataset.panel !== b.dataset.tab));
    }));
  });

  // Sortable tables
  $$("table.sortable").forEach((tbl) => {
    $$("th", tbl).forEach((th, col) => th.addEventListener("click", () => {
      const body = tbl.tBodies[0];
      const dir = th.getAttribute("aria-sort") === "descending" ? "ascending" : "descending";
      $$("th", tbl).forEach((x) => x.removeAttribute("aria-sort"));
      th.setAttribute("aria-sort", dir);
      const val = (tr) => {
        const cell = tr.children[col];
        if (cell?.dataset.v != null) return Number(cell.dataset.v);
        const t = cell?.textContent.trim() ?? "";
        const n = parseFloat(t.replace(/[^0-9.+-]/g, ""));
        if (/^\d+:\d\d$/.test(t)) { const [m, s] = t.split(":").map(Number); return m * 60 + s; }
        return t !== "" && !isNaN(n) && /^[+-]?[\d.]/.test(t) ? n : t.toLowerCase();
      };
      const rows = [...body.rows].sort((a, b) => {
        const x = val(a), y = val(b);
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
        return dir === "ascending" ? c : -c;
      });
      rows.forEach((r) => body.appendChild(r));
    }));
  });

  // News filters
  $$(".filters").forEach((f) => {
    const feed = $(f.dataset.filterTarget);
    let type = "all", team = "";
    const apply = () => $$(".post", feed).forEach((p) => {
      p.hidden = (type !== "all" && !(p.dataset.type || "").split(" ").includes(type)) || (team && p.dataset.team !== team);
    });
    $$(".chip", f).forEach((c) => c.addEventListener("click", () => {
      type = c.dataset.type; $$(".chip", f).forEach((x) => x.classList.toggle("on", x === c)); apply();
    }));
    $(".team-filter", f)?.addEventListener("change", (e) => { team = e.target.value; apply(); });
  });

  // Timeline filters (player pages)
  $$(".tl-filters").forEach((f) => {
    const list = $(f.dataset.target);
    $$(".chip", f).forEach((c) => c.addEventListener("click", () => {
      $$(".chip", f).forEach((x) => x.classList.toggle("on", x === c));
      $$("[data-g]", list).forEach((li) => (li.hidden = c.dataset.g !== "all" && li.dataset.g !== c.dataset.g));
    }));
  });

  // Countdown
  $$(".countdown[data-until]").forEach((el) => {
    const until = Date.parse(el.dataset.until);
    const tick = () => {
      let s = Math.max(0, Math.floor((until - Date.now()) / 1000));
      const d = Math.floor(s / 86400); s -= d * 86400;
      const hh = Math.floor(s / 3600); s -= hh * 3600;
      const m = Math.floor(s / 60);
      el.innerHTML = until > Date.now()
        ? [[d, "days"], [hh, "hours"], [m, "min"]].map(([v, k]) => `<div><b>${v}</b><span>${k}</span></div>`).join("")
        : `<div><b>Live</b><span>Tournament on</span></div>`;
    };
    tick(); setInterval(tick, 30000);
  });
})();
