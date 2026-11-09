import { esc, attr, localTime, stage, pill, page, pct } from "./html.mjs";
import { gamesTable, oddsTable, teamForecast } from "./wjc-forecast.mjs";

const short = (p) => (p ? `${p.first?.[0] ?? ""}. ${p.last}` : "—");
const code = (c) => c.toLowerCase();

function chip(p, { star = false } = {}) {
  if (!p) return `<span class="wchip empty-slot">—</span>`;
  const club = p.club ? `${p.club.league}` : p.unmatched ? "Not matched" : "";
  const tags = `${p.returnee ? '<i class="wt ret" title="Played at last year&#39;s World Juniors">R</i>' : ""}${p.camp ? '<i class="wt camp" title="Summer showcase invite">C</i>' : ""}${p.ageUnknown ? '<i class="wt unk" title="Birthdate not confirmed">?</i>' : ""}`;
  return `<span class="wchip${p.inNhl ? " nhl" : ""}${p.ageUnknown ? " unk" : ""}" title="${attr(p.reason || "")}">
    <span class="wn">${esc(short(p))}${star ? " ★" : ""}${tags}</span><span class="wc">${esc(club)}</span></span>`;
}

function gameRow(cfg, g, { focus } = {}) {
  const T = Object.fromEntries(cfg.teams.map((t) => [t.code, t]));
  const side = (c) => (c ? `<a href="/wjc/${code(c)}/" class="${c === focus ? "b" : ""}">${T[c].flag} ${esc(T[c].name)}</a>` : `<span class="muted">TBD</span>`);
  return `<tr><td>${localTime(g.utc, "datetime")}</td><td>${esc(g.round)}</td><td>${side(g.a)} <span class="muted">vs</span> ${side(g.b)}</td><td class="muted">${esc(cfg.venues[g.venue] ?? g.venue)}</td></tr>`;
}

export function wjcHub(ctx) {
  const { cfg, teams } = ctx.wjc;
  const groups = { A: [], B: [] };
  for (const t of cfg.teams) groups[t.group].push(teams[t.code]);
  const card = (t) => {
    const P = t.pool;
    const l1 = t.projection.lines[0] ?? [], g1 = P[t.projection.goalies[0]];
    const total = t.counts.F + t.counts.D + t.counts.G;
    return `<a class="card wjc-team" href="/wjc/${code(t.code)}/">
      <div class="wt-head"><span class="flag">${t.flag}</span><b>${esc(t.name)}</b>${stage(t.stage)}</div>
      ${l1.length ? `<div class="wt-line"><span class="k">L1</span>${l1.map((id) => esc(short(P[id]))).join(" – ")}</div>` : `<div class="wt-line muted">Not enough confirmed players yet</div>`}
      ${g1 ? `<div class="wt-line"><span class="k">G</span>${esc(short(g1))}</div>` : ""}
      <div class="wt-foot muted">${t.counts.returnees} returning · ${t.counts.camp ? `${t.counts.camp} camp invites · ` : ""}${total} eligible</div></a>`;
  };
  const body = `<section class="hero wjc-hero">
    <div><p class="eyebrow">IIHF World Junior Championship</p><h1>${esc(cfg.name)}</h1>
    <p class="lede">${esc(cfg.dates)} · ${esc(cfg.hosts)}. Win probability for every game, a simulated bracket, and projected lines, pairs, power plays and goalies for all 10 teams, built on public roster projections and updated as rosters and results come in.</p>
    <div class="countdown" data-until="${attr(cfg.schedule[0].utc)}"></div><p class="hero-cta"><a class="btn" href="/wjc/bracket/">Mock bracket &amp; tournament odds →</a></p></div>
  </section>
  ${Object.entries(groups).map(([g, ts]) => `<h2 class="section-h">Group ${g} <span class="muted small">${g === "A" ? "Red Deer" : "Edmonton"}</span></h2><div class="wjc-grid">${ts.map(card).join("")}</div>`).join("")}
  <h2 class="section-h">Tournament odds <span class="muted small">from ${ctx.wjc.forecast.sims.toLocaleString()} simulated tournaments · <a href="/wjc/bracket/">mock bracket</a></span></h2>
  <section class="card" id="wjc-odds">${oddsTable(ctx)}</section>
  <h2 class="section-h">Schedule &amp; win chances <span class="muted small">your local time</span></h2>
  <div class="card" id="wjc-games">${gamesTable(ctx)}
  <p class="muted small">Schedule: <a href="https://www.nhl.com/news/2027-world-junior-championship-schedule-announced" target="_blank" rel="noopener">NHL.com</a>. Playoff matchups shown are the mock bracket's projection and change as results come in.</p></div>
  <section class="card"><h2>How projections work</h2>
  <p>Each pool is every player born in 2007 or later whom a federation has already shown interest in, plus the NHL prospects and draft-ranked players who could join them:</p>
  <ul class="how">
    <li><b>Summer showcase invites</b> (Canada, USA, Finland, part of Sweden): the federation's own shortlist.</li>
    <li><b>Last year's World Juniors players</b> still young enough, checked against published birthdates.</li>
    <li><b>NHL prospects, recent draft picks and Central Scouting's ranked players.</b></li>
  </ul>
  <p>A player's country is the national team he has actually played for (U17, U18, U20), not where he was born. Players already in the NHL are listed but left out of the projection, because NHL teams rarely loan them. The score combines league-adjusted scoring, draft position, camp invites, World Juniors experience and age.</p>
  <p class="muted small"><i class="wt ret">R</i> returning player · <i class="wt camp">C</i> showcase invite · <i class="wt unk">?</i> birthdate not confirmed. Sources: <a href="https://thehockeynews.com/news/latest-news/2026-world-junior-championship-full-roster-list" target="_blank" rel="noopener">THN 2026 rosters</a>, <a href="https://www.nhl.com/news/canada-2026-world-junior-summer-showcase-roster" target="_blank" rel="noopener">NHL.com</a> and <a href="https://www.dailyfaceoff.com/news/2026-usa-world-junior-summer-showcase-roster-announced" target="_blank" rel="noopener">Daily Faceoff</a> showcase rosters, Hockey Canada roster birthdates, NHL Central Scouting.</p></section>`;
  return page({ site: ctx.site, title: "World Juniors 2027: projected lines for every team", description: "2027 World Junior Championship projected lines, D pairs, power play and goalies for Canada, USA, Sweden, Finland and every team. Schedule in your time zone.", path: "/wjc/", active: "/wjc/", body, scripts: ["/assets/wjc-live.js#module"] });
}

export function wjcTeam(ctx, t) {
  const { cfg } = ctx.wjc;
  const P = t.pool;
  const pr = t.projection;
  const total = t.counts.F + t.counts.D + t.counts.G;
  const rows = (arr, labels) => arr.map((ids, i) => `<div class="wline"><span class="slot">${labels[i]}</span>${ids.map((id) => chip(P[id])).join("")}</div>`).join("");
  const why = [...pr.lines.flat(), ...pr.pairs.flat(), ...pr.goalies.slice(0, 1)].map((id) => P[id]).filter(Boolean)
    .map((p) => `<li><b>${esc(p.first)} ${esc(p.last)}</b> <span class="muted">${esc(p.pos)}</span> · ${esc(p.reason || "no stats found")}</li>`).join("");
  const pool = Object.values(P).sort((a, b) => (a.pos === "G") - (b.pos === "G") || b.score - a.score);
  const thin = total < 18;
  const unk = t.counts.unconfirmed;
  const rep = t.reported;
  const body = `<section class="team-head">
    <span class="flag big">${t.flag}</span>
    <div class="th-main"><p class="eyebrow"><a href="/wjc/">${esc(cfg.name)}</a> · Group ${t.group}</p><h1>${esc(t.name)} projected lineup</h1>
    <p class="muted">${stage(t.stage)} ${t.roster ? `Roster: ${esc(t.roster.source ?? "")}${t.roster.url ? ` · <a href="${attr(t.roster.url)}" target="_blank" rel="noopener">source</a>` : ""}` : `${t.counts.returnees} returning from 2026${t.counts.camp ? ` · ${t.counts.camp} summer showcase invites` : ""} · ${total} eligible`}</p></div>
  </section>
  ${thin ? `<div class="alert">Only ${total} players with confirmed ages found for ${esc(t.name)}. ${unk ? `${unk} spot${unk === 1 ? " is" : "s are"} filled with players marked <i class="wt unk">?</i> whose birthdates we couldn't confirm; some may have aged out. ` : ""}Most of this team is undrafted, so the lineup firms up once the camp roster is announced.</div>` : ""}
  ${rep ? `<section class="card card-accent"><h2>Reported lines ${stage("reported")}</h2><p class="meta">${esc(rep.source ?? "")}${rep.url ? ` · <a href="${attr(rep.url)}" target="_blank" rel="noopener">source</a>` : ""}</p>
    ${(rep.lines ?? []).map((l, i) => `<div class="wline"><span class="slot">L${i + 1}</span>${l.map((n) => `<span class="wchip"><span class="wn">${esc(n)}</span></span>`).join("")}</div>`).join("")}
    ${(rep.pairs ?? []).map((l, i) => `<div class="wline"><span class="slot">D${i + 1}</span>${l.map((n) => `<span class="wchip"><span class="wn">${esc(n)}</span></span>`).join("")}</div>`).join("")}
    ${rep.goalie ? `<div class="wline"><span class="slot">G</span><span class="wchip"><span class="wn">${esc(rep.goalie)}</span></span></div>` : ""}</section>` : ""}
  <div class="layout"><div>
    ${teamForecast(ctx, t)}
    <section class="card"><h2>Projected lines ${stage(t.stage)}</h2>
      ${t.publicLines ? `<p class="src-note">Lines: <a href="${attr(t.publicLines.url)}" target="_blank" rel="nofollow noopener">${esc(t.publicLines.source)}</a>, ${esc(t.publicLines.date)}.${t.publicLines.partial ? " That projection doesn't cover every position, so the rest comes from our model." : ""}</p>` : ""}
      ${pr.lines.length ? rows(pr.lines, ["L1", "L2", "L3", "L4"]) : `<p class="empty">Not enough forwards in the pool yet.</p>`}
      <h3>Defence pairs</h3>${pr.pairs.length ? rows(pr.pairs, ["D1", "D2", "D3"]) : `<p class="empty">Not enough defencemen in the pool yet.</p>`}
      <h3>Power play</h3>${pr.pp.length ? rows(pr.pp, ["PP1", "PP2"]) : `<p class="empty">—</p>`}
      <h3>Goalies</h3><div class="wline"><span class="slot">G</span>${pr.goalies.map((id, i) => chip(P[id], { star: i === 0 })).join("") || `<span class="muted">No goalies in the pool yet.</span>`}</div>
      ${why ? `<details class="why"><summary>Why each player is where they are</summary><ul>${why}</ul></details>` : ""}
    </section>
    <section class="card" id="build"><h2>Build your own ${esc(t.name)} lineup</h2>
      <p class="muted small">Tap a player, then tap a slot (or drag on desktop). Your lineup saves on this device; share it as a link or an image.</p>
      <div id="builder" class="builder" data-team="${attr(t.code)}"></div>
    </section>
  </div><aside class="side">
    <section class="card"><h2>Schedule</h2><div class="table-wrap"><table class="tbl compact"><tbody>${cfg.schedule.filter((g) => g.a === t.code || g.b === t.code).map((g) => `<tr><td>${localTime(g.utc, "datetime")}</td><td>vs ${esc(cfg.teams.find((x) => x.code === (g.a === t.code ? g.b : g.a)).name)}</td></tr>`).join("")}</tbody></table></div></section>
    <section class="card"><h2>Other teams</h2><div class="flag-list">${cfg.teams.filter((x) => x.code !== t.code).map((x) => `<a href="/wjc/${code(x.code)}/">${x.flag} ${esc(x.name)}</a>`).join("")}</div></section>
  </aside></div>
  <section class="card"><h2>Player pool <span class="muted small">${pool.length} players</span></h2>
  <div class="table-wrap"><table class="tbl sortable"><thead><tr><th>Player</th><th>Pos</th><th>Born</th><th>Club</th><th class="n">GP</th><th class="n">P / SV%</th><th>Drafted</th><th class="n">Index</th></tr></thead><tbody>
  ${pool.map((p) => `<tr${p.inNhl ? ' class="dim"' : ""}><td>${p.linked && ctx.profiles?.[p.id] ? `<a href="/players/${p.id}/">${esc(p.first)} ${esc(p.last)}</a>` : `${esc(p.first)} ${esc(p.last)}`} ${p.returnee ? '<i class="wt ret" title="Returning">R</i>' : ""}${p.camp ? '<i class="wt camp" title="Showcase invite">C</i>' : ""}${p.ageUnknown ? '<i class="wt unk" title="Birthdate not confirmed">?</i>' : ""} ${p.inNhl ? pill("In NHL", "muted") : ""}</td><td>${esc(p.pos)}</td><td>${esc(p.birthDate ?? "?")}</td><td>${p.club ? `${esc(p.club.team)} <span class="muted">${esc(p.club.league)}</span>` : "—"}</td><td class="n">${p.club?.gp ?? "—"}</td><td class="n">${p.club ? (p.pos === "G" ? pct(p.club.svPct) : p.club.pts) : "—"}</td><td>${p.draft ? `${esc(p.draft.team)} #${p.draft.overall} (${p.draft.year})` : "—"}</td><td class="n">${(p.score * 100).toFixed(0)}</td></tr>`).join("")}
  </tbody></table></div></section>`;
  const json = { team: { code: t.code, name: t.name }, projection: pr, pool: P };
  return page({ site: ctx.site, title: `${t.name} World Juniors 2027 projected lines`, description: `${t.name}'s projected 2027 World Juniors lineup: forward lines, D pairs, power play and starting goalie, plus the full eligible player pool. Build your own lineup.`, path: `/wjc/${code(t.code)}/`, active: "/wjc/", body, scripts: ["/assets/builder.js"], json });
}
