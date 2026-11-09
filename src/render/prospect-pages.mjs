// NHL prospect pools: every drafted prospect on every team, with country flag, the NHL team that holds his rights,
// where he plays now, this season's stats and where he was drafted. Filter by team, country, league and position.
import { esc, attr, page } from "./html.mjs";
import { logo } from "./nhl-pages.mjs";
import { country, flag } from "./geo.mjs";

const POSG = (p) => (p === "G" ? "G" : /D/.test(p) ? "D" : "F");
const pg = (n, s) => `${n} ${s}${n === 1 ? "" : "s"}`;

export function nhlProspectsPage(ctx) {
  const season = ctx.league.seasonId, now = Date.parse(ctx.site.builtAt);
  const rows = Object.values(ctx.profiles).filter((p) => p.status === "prospect" && p.nhlTeam && ctx.T[p.nhlTeam]);
  const age = (b) => (b ? Math.floor((now - Date.parse(b)) / (365.25 * 864e5)) : null);
  const clubLeague = (c) => (c?.match(/\(([^)]+)\)\s*$/) ?? [])[1] ?? "";
  const fix = (t) => (/[ÃÂ]/.test(String(t ?? "")) ? Buffer.from(String(t), "latin1").toString("utf8") : String(t ?? "")); // feeds that double-encode UTF-8
  const clubTeam = (c) => fix(c ? c.replace(/\s*\([^)]+\)\s*$/, "") : "");
  const list = rows.map((p) => {
    const c = country(p.birthCountry), g = POSG(p.pos);
    return { p, c, g, age: age(p.birthDate), lg: clubLeague(p.club), tm: clubTeam(p.club), s: p.clubStat, cur: p.clubStat?.season === season };
  }).sort((a, b) => (b.p.draft?.year ?? 0) - (a.p.draft?.year ?? 0) || (a.p.draft?.overallPick ?? 999) - (b.p.draft?.overallPick ?? 999));

  const byCountry = {}, byLeague = {}, byTeam = {};
  for (const r of list) {
    if (r.c) (byCountry[r.p.birthCountry] ??= { c: r.c, n: 0 }).n++;
    if (r.lg) byLeague[r.lg] = (byLeague[r.lg] ?? 0) + 1;
    byTeam[r.p.nhlTeam] = (byTeam[r.p.nhlTeam] ?? 0) + 1;
  }
  const topC = Object.entries(byCountry).sort((a, b) => b[1].n - a[1].n);
  const draftTxt = (d) => (d ? `${d.year} · R${d.round} #${d.overallPick}` : "Undrafted");
  const tr = (r, i) => {
    const { p, s } = r, T = ctx.T[p.nhlTeam];
    const sk = r.g !== "G";
    return `<tr data-team="${attr(p.nhlTeam)}" data-country="${attr(p.birthCountry ?? "")}" data-lg="${attr(r.lg)}" data-pos="${r.g}" data-q="${attr(`${p.first} ${p.last} ${r.tm}`.toLowerCase())}">
      <td class="n">${i + 1}</td>
      <td class="pr-who"><a href="/players/${p.id}/">${p.headshot ? `<img class="pr-img" src="${attr(p.headshot)}" alt="" width="34" height="34" loading="lazy" onerror="this.style.visibility='hidden'">` : ""}<span><b>${esc(p.first)} ${esc(p.last)}</b><small>${r.c ? flag(r.c) : ""} ${esc(r.c?.name ?? p.birthCountry ?? "")}</small></span></a></td>
      <td>${esc(p.pos ?? "")}</td><td class="n">${r.age ?? "—"}</td>
      <td data-v="${attr(p.nhlTeam)}"><a class="team-cell" href="/nhl/${T.slug}/">${logo(T, 20)}<span>${esc(p.nhlTeam)}</span></a></td>
      <td>${p.club ? `${esc(r.tm)} <span class="muted">${esc(r.lg)}</span>` : '<span class="muted">—</span>'}</td>
      <td class="n${r.cur ? "" : " muted"}" title="${r.cur ? "This season" : "Last season with this team"}">${s?.gp ?? "—"}</td>
      <td class="n${r.cur ? "" : " muted"}">${sk ? s?.g ?? "—" : ""}</td><td class="n${r.cur ? "" : " muted"}">${sk ? s?.a ?? "—" : ""}</td>
      <td class="n${r.cur ? "" : " muted"}">${sk ? `<b>${s?.p ?? "—"}</b>` : s?.sv ? `<b>${Number(s.sv).toFixed(3).replace(/^0/, "")}</b>` : "—"}</td>
      <td data-v="${p.draft ? p.draft.year * 1000 - p.draft.overallPick : 0}">${draftTxt(p.draft)}</td></tr>`;
  };
  const opts = (items) => items.map(([v, l]) => `<option value="${attr(v)}">${esc(l)}</option>`).join("");
  const body = `<section class="hero"><div><p class="eyebrow"><a href="/prospects/">Mock draft</a> · NHL prospect pools</p><h1>Every NHL prospect, by team</h1>
    <p class="lede">${list.length.toLocaleString()} drafted prospects across all 32 teams: who holds their rights, where they play now, this season's numbers and where they were picked. Filter by team, country, league or position.</p></div></section>
    <div class="statbox slim"><div><span>Prospects</span><b>${list.length.toLocaleString()}</b></div><div><span>Countries</span><b>${topC.length}</b></div>${topC.slice(0, 5).map(([, v]) => `<div><span>${flag(v.c)} ${esc(v.c.name)}</span><b>${v.n}</b></div>`).join("")}</div>
    <section class="card pr-card"><div class="pr-filters" id="pr-filters">
      <input type="search" id="pr-q" placeholder="Search player or club" aria-label="Search prospects">
      <select id="pr-team" aria-label="NHL team"><option value="">All teams</option>${opts(Object.keys(byTeam).sort().map((t) => [t, `${ctx.T[t].name} (${byTeam[t]})`]))}</select>
      <select id="pr-country" aria-label="Country"><option value="">All countries</option>${opts(topC.map(([k, v]) => [k, `${v.c.name} (${v.n})`]))}</select>
      <select id="pr-lg" aria-label="Current league"><option value="">All leagues</option>${opts(Object.entries(byLeague).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, `${k} (${n})`]))}</select>
      <div class="chips" id="pr-pos"><button class="chip on" data-pos="">All</button><button class="chip" data-pos="F">Forwards</button><button class="chip" data-pos="D">Defence</button><button class="chip" data-pos="G">Goalies</button></div>
      <span class="muted small" id="pr-count">${list.length} shown</span></div>
    <div class="table-wrap"><table class="tbl sortable compact pr-tbl" id="pr-tbl"><thead><tr><th class="n">#</th><th>Player</th><th>Pos</th><th class="n">Age</th><th>Rights</th><th>Plays for</th><th class="n">GP</th><th class="n">G</th><th class="n">A</th><th class="n" title="Points (skaters) or save percentage (goalies)">P / SV%</th><th>Drafted</th></tr></thead>
    <tbody>${list.map(tr).join("")}</tbody></table></div>
    <p class="src-note">Source: NHL.com prospect lists and player pages. Stats are this season's with the club shown; greyed numbers are from his last season with that club. Nation is his country of birth, and a player's national team can differ.</p></section>`;
  return page({ site: ctx.site, title: "NHL prospect pools: every team's prospects", description: `All ${list.length} drafted NHL prospects with country flags, rights team, current club, stats and draft position. Filter by team, country, league and position.`, path: "/prospects/nhl/", active: "/prospects/", body, scripts: ["/assets/prospects.js"] });
}
