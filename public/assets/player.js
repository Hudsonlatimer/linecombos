// /player/?id=…: a profile for any player the static build has no page for.
// Full career from the NHL API through this site's /live/ proxy (or the live worker when one is configured);
// if that fails, a bio card from NHL search (which allows browsers).
(() => {
  const root = document.getElementById("pv");
  if (!root) return;
  const qs = new URLSearchParams(location.search);
  const id = (qs.get("id") || "").replace(/\D/g, "");
  const name = qs.get("n") || "";
  const api = (root.dataset.liveApi || "").replace(/\/$/, "");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const POS = { C: "Centre", L: "Left wing", R: "Right wing", D: "Defence", G: "Goalie" };
  const dob = (d) => new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const age = (d) => Math.floor((Date.now() - Date.parse(d)) / (365.25 * 864e5));
  const season = (s) => `${String(s).slice(0, 4)}–${String(s).slice(6, 8)}`;
  const fail = (msg) => { root.innerHTML = `<section class="hero"><div><h1>Player not found</h1><p class="lede">${esc(msg)} Try the search above.</p></div></section>`; };
  if (!id) return fail("No player id in the link.");

  // A static page exists? Go there instead.
  fetch(`/players/${id}/`, { method: "HEAD" }).then((r) => { if (r.ok) location.replace(`/players/${id}/`); else load(); }).catch(load);

  async function load() {
    let l = null;
    const url = api ? `${api}/player/${id}` : `/live/player/${id}/`;
    l = await fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (l && !l.error) return full(l);
    const q = name || id;
    const hits = await fetch(`https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=20&q=${encodeURIComponent(q)}`).then((r) => r.json()).catch(() => []);
    const p = hits.find((x) => String(x.playerId) === id);
    if (!p) return fail("We couldn't load this player.");
    basic(p);
  }

  const hero = (img, first, last, sub, bio) => `<section class="p-hero"><div class="p-hero-in">
    <img class="p-shot" src="${esc(img)}" alt="" width="150" height="150" onerror="this.onerror=null;this.src='https://assets.nhle.com/mugs/nhl/default-skater.png'">
    <div class="p-id"><h1>${esc(first)} ${esc(last)}</h1><p class="p-sub">${sub}</p><ul class="p-bio">${bio.filter(Boolean).map(([k, v]) => `<li><span>${k}</span><b>${esc(v)}</b></li>`).join("")}</ul></div></div></section>`;

  function basic(p) {
    const [first, ...rest] = p.name.split(" ");
    document.title = `${p.name} · LineCombos`;
    root.innerHTML = hero(`https://assets.nhle.com/mugs/nhl/latest/${id}.png`, first, rest.join(" "), `${esc(POS[p.positionCode] ?? p.positionCode ?? "")} ${p.active ? '<span class="pill ok">Active</span>' : ""}`, [
      ["From", [p.birthCity, p.birthStateProvince, p.birthCountry].filter(Boolean).join(", ")],
      p.height && ["Size", `${p.height} · ${p.weightInPounds} lb`],
      p.sweaterNumber && ["Number", `#${p.sweaterNumber}`],
      (p.teamAbbrev || p.lastTeamAbbrev) && [p.teamAbbrev ? "Team" : "Last NHL team", p.teamAbbrev || p.lastTeamAbbrev],
    ]) + `<section class="card"><h2>Career</h2><p class="empty">Career stats couldn't be loaded right now. Try again in a minute.</p></section>`;
  }

  function full(l) {
    const first = l.firstName?.default ?? "", last = l.lastName?.default ?? "";
    const g = l.position === "G";
    document.title = `${first} ${last} · LineCombos`;
    const rows = (l.seasonTotals ?? []).filter((s) => s.gameTypeId === 2);
    const head = g ? ["Season", "Team", "League", "GP", "W", "L", "GAA", "SV%"] : ["Season", "Team", "League", "GP", "G", "A", "P", "PIM"];
    const cell = (s) => g ? [s.gamesPlayed, s.wins, s.losses, s.goalsAgainstAvg != null ? Number(s.goalsAgainstAvg).toFixed(2) : "", s.savePctg != null ? Number(s.savePctg).toFixed(3).replace(/^0/, "") : ""]
      : [s.gamesPlayed, s.goals, s.assists, s.points, s.pim];
    const d = l.draftDetails;
    const where = [l.birthCity?.default, l.birthStateProvince?.default, l.birthCountry].filter(Boolean).join(", ");
    root.innerHTML = hero(l.headshot, first, last, `${esc(POS[l.position] ?? l.position ?? "")} ${l.isActive ? '<span class="pill ok">Active</span>' : ""} ${l.fullTeamName?.default ? `· ${esc(l.fullTeamName.default)}` : ""}`, [
      l.birthDate && l.isActive && ["Age", age(l.birthDate)],
      l.birthDate && ["Born", dob(l.birthDate)],
      where && ["From", where],
      l.heightInInches && ["Size", `${Math.floor(l.heightInInches / 12)}'${l.heightInInches % 12}" · ${l.weightInPounds} lb`],
      l.shootsCatches && [g ? "Catches" : "Shoots", l.shootsCatches],
      d && ["Draft", `${d.year} · #${d.overallPick} (${d.teamAbbrev})`],
    ]) + `<section class="card"><h2>Career stats <span class="muted small">regular season</span></h2><div class="table-wrap"><table class="tbl compact"><thead><tr>${head.map((h, i) => `<th${i > 2 ? ' class="n"' : ""}>${h}</th>`).join("")}</tr></thead><tbody>
      ${rows.map((s) => `<tr${s.leagueAbbrev === "NHL" ? ' class="nhl-row"' : ""}><td>${season(s.season)}</td><td>${esc(s.teamName?.default)}</td><td>${esc(s.leagueAbbrev)}</td>${cell(s).map((v) => `<td class="n">${esc(v ?? "")}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="8" class="empty">No stats.</td></tr>`}
      </tbody></table></div></section>`;
  }
})();
