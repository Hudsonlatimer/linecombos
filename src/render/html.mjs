// Tiny HTML helpers + the page shell.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const attr = esc;
export const h = (strings, ...vals) => strings.reduce((out, s, i) => out + s + (i < vals.length ? flat(vals[i]) : ""), "");
const flat = (v) => (Array.isArray(v) ? v.map(flat).join("") : v == null || v === false ? "" : String(v));

export const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
export const pct = (v, d = 3) => (v == null ? "—" : Number(v).toFixed(d).replace(/^0/, ""));
export const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
export const fmtDate = (d, opts = { weekday: "short", month: "short", day: "numeric" }) =>
  new Date(d.length === 10 ? d + "T12:00:00Z" : d).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

/** A time that the browser rewrites into the viewer's local time. */
export const localTime = (utc, fmt = "time") => utc ? `<time datetime="${attr(utc)}" data-fmt="${fmt}">${esc(new Date(utc).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }))} ET</time>` : "";
export const ago = (iso) => `<time datetime="${attr(iso)}" data-fmt="ago">${esc(fmtDate(iso.slice(0, 10)))}</time>`;

export const STAGES = {
  actual: { label: "Actual", tip: "From real ice time (NHL shift data)" },
  live: { label: "Live", tip: "From shift data during the game, about 10 minutes behind" },
  public: { label: "Public projection", tip: "Lines published by a reporter's roster projection (linked at the source)" },
  reported: { label: "Reported", tip: "Reported by a reporter or team account today" },
  confirmed: { label: "Confirmed", tip: "Official lineup or confirmed by the team" },
  projected: { label: "Projected", tip: "Our projection; not reported yet" },
  camp: { label: "Camp roster", tip: "Projected from the announced selection camp roster" },
  roster: { label: "Roster set", tip: "Projected from the final announced roster" },
};
export const stage = (key, extra = "") => `<span class="stage stage-${key}" title="${attr(STAGES[key]?.tip ?? "")}">${esc(STAGES[key]?.label ?? key)}${extra ? ` <span class="stage-x">${esc(extra)}</span>` : ""}</span>`;
export const pill = (text, cls = "") => `<span class="pill ${cls}">${esc(text)}</span>`;

const NAV = [
  ["/", "Home"], ["/nhl/", "Lineups"], ["/goalies/", "Goalies"], ["/injuries/", "Injuries"], ["/news/", "News"], ["/moves/", "Moves"], ["/standings/", "Standings"], ["/predictions/", "Predictions"], ["/cup/", "Cup odds"],
  ["/schedule/", "Schedule"], ["/stats/", "Stats"], ["/records/", "Records"], ["/prospects/", "Mock draft"], ["/wjc/", "World Juniors"],
];

// Cache-busting version for /assets: changes on every build.
const V = (site) => site.builtAt.replace(/\D/g, "").slice(2, 12);

export function page({ site, title, description, path, body, active, scripts = [], head = "", json = null }) {
  const full = title ? `${title} · ${site.name}` : `${site.name} · ${site.tagline}`;
  const canonical = site.url.replace(/\/$/, "") + path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${attr(description ?? site.tagline)}">
<link rel="canonical" href="${attr(canonical)}">
<meta property="og:title" content="${attr(full)}">
<meta property="og:description" content="${attr(description ?? site.tagline)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${attr(canonical)}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#070b12">
<link rel="icon" href="/assets/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..800&family=JetBrains+Mono:wght@500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/style.css?v=${V(site)}">
<script>try{const t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch{}</script>
${head}
</head>
<body data-path="${attr(path)}">
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <div class="wrap top-row">
    <a class="brand" href="/" aria-label="${attr(site.name)} home"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>${esc(site.name)}</a>
    <button class="search-btn" id="q-open" type="button" aria-haspopup="dialog" aria-controls="palette">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
      <span>Search any player, ever</span><kbd>⌘K</kbd>
    </button>
    <button class="icon-btn" id="theme" aria-label="Toggle dark mode" title="Toggle dark mode"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 3a9 9 0 1 0 9 9c0-.5 0-1-.1-1.4A5.5 5.5 0 0 1 13.4 3.1 9 9 0 0 0 12 3Z"/></svg></button>
    <button class="icon-btn menu-btn" id="menu" aria-label="Menu" aria-expanded="false"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg></button>
  </div>
  <nav class="wrap nav" id="nav" aria-label="Main">
    ${NAV.map(([href, label]) => `<a href="${href}"${active === href ? ' aria-current="page"' : ""}${href === "/wjc/" ? ' class="nav-hot"' : ""}>${label}</a>`).join("")}
  </nav>
</header>
<div class="palette" id="palette" role="dialog" aria-modal="true" aria-label="Search" hidden>
  <div class="pal-backdrop" data-close></div>
  <div class="pal-box">
    <div class="pal-in"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
      <input id="q" type="search" placeholder="Search 10,000+ players, every team…" autocomplete="off" spellcheck="false" aria-label="Search players and teams" aria-controls="q-results">
      <button class="pal-esc" data-close type="button">Esc</button></div>
    <div id="q-results" class="pal-results" role="listbox"></div>
    <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span>Every NHL player since 1917</span></div>
  </div>
</div>
<main id="main" class="wrap">
${body}
</main>
<footer class="foot">
  <div class="wrap foot-row">
    <div><strong>${esc(site.name)}</strong> · ${esc(site.tagline)}</div>
    <div class="muted">Data: NHL public stats, shift charts and box scores · reporters on Bluesky and X (linked at every item) · IIHF / NHL.com for World Juniors. Not affiliated with the NHL, NHLPA or IIHF. <a href="/about/">How it works</a></div>
    <div class="muted">Updated <time datetime="${attr(site.builtAt)}" data-fmt="ago">${esc(site.builtAt)}</time></div>
  </div>
</footer>
${json ? `<script type="application/json" id="page-data">${JSON.stringify(json).replace(/</g, "\\u003c")}</script>` : ""}
<script src="/assets/app.js?v=${V(site)}" defer></script>
<script src="/assets/live.js?v=${V(site)}" defer></script>
<script src="/assets/fresh.js?v=${V(site)}" defer></script>
${scripts.map((s) => s.endsWith("#module") ? `<script type="module" src="${s.slice(0, -7)}?v=${V(site)}"></script>` : `<script src="${s}?v=${V(site)}" defer></script>`).join("")}
</body>
</html>`;
}
