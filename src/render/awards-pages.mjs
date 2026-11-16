// /awards/ — who is leading each trophy race, rebuilt every few minutes with the rest of the site.
import { esc, attr, page } from "./html.mjs";
import { logo, anyPlayerUrl } from "./nhl-pages.mjs";
import { AWARDS, RACES } from "../../public/assets/awardsmodel.js";

const shot = (ctx, c) => `https://assets.nhle.com/mugs/nhl/${ctx.league.seasonId}/${c.team}/${c.id}.png`;
const pctTxt = (x) => (x >= 0.995 ? "99%" : x < 0.01 ? "<1%" : `${Math.round(x * 100)}%`);

function votedCard(ctx, a, list) {
  const rows = list.map((c, i) => `<li class="aw-row${i === 0 ? " lead" : ""}">
    <span class="aw-rank">${i + 1}</span>
    ${a.coach ? `<span class="aw-shot aw-logo">${logo(ctx.T[c.team], 30)}</span>` : `<img class="aw-shot" src="${attr(shot(ctx, c))}" alt="" width="40" height="40" loading="lazy" onerror="this.style.visibility='hidden'">`}
    <span class="aw-who">${a.coach ? `<b>${esc(c.name)}</b>` : `<a href="${attr(anyPlayerUrl(ctx, c.id, c.name))}"><b>${esc(c.name)}</b></a>`} <span class="muted small">${a.coach ? `<a href="/nhl/${ctx.T[c.team]?.slug}/">${esc(ctx.T[c.team]?.common ?? c.team)}</a>` : `${esc(c.pos)} · ${logo(ctx.T[c.team], 14)} ${esc(c.team)}`}</span><span class="aw-line muted small">${esc(c.line)}</span></span>
    <span class="aw-share" title="Model's share of the contenders' combined strength, not betting odds"><span class="aw-bar"><i style="width:${Math.max(2, Math.round(c.share * 100))}%"></i></span><b>${pctTxt(c.share)}</b></span></li>`).join("");
  return `<section class="card aw-card" id="${a.k}"><h2>${esc(a.name)} <span class="muted small">${esc(a.sub)}</span></h2><ol class="aw-list">${rows}</ol><p class="muted small aw-note">${esc(a.note)}</p></section>`;
}

function raceCard(ctx, r, list) {
  const isTeam = !!list[0]?.team && list[0].id == null;
  const rows = list.map((c, i) => {
    const t = ctx.T[c.team];
    return `<tr><td class="n muted">${i + 1}</td><td>${isTeam ? `<a class="team-cell" href="/nhl/${t?.slug ?? ""}/">${logo(t, 20)}<b>${esc(t?.common ?? c.team)}</b></a>` : `<a href="${attr(anyPlayerUrl(ctx, c.id, c.name))}"><b>${esc(c.name)}</b></a> <span class="muted small">${logo(t, 14)} ${esc(c.team)}</span>`}</td><td class="n"><b>${esc(c.value)}</b></td><td class="n muted">${esc(c.pace)} ${esc(r.paceUnit)}</td><td class="muted small">${esc(c.line)}</td></tr>`;
  }).join("");
  return `<section class="card" id="${r.k}"><h2>${esc(r.name)} <span class="muted small">${esc(r.sub)}</span></h2><div class="table-wrap"><table class="tbl compact"><thead><tr><th class="n">#</th><th>${isTeam ? "Team" : "Player"}</th><th class="n">${esc(r.unit)}</th><th class="n">82-game pace</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function teamCard(ctx, title, note, slots) {
  const rows = slots.map(([slot, c]) => `<li class="aw-row"><span class="aw-rank">${esc(slot)}</span><img class="aw-shot" src="${attr(shot(ctx, c))}" alt="" width="40" height="40" loading="lazy" onerror="this.style.visibility='hidden'"><span class="aw-who"><a href="${attr(anyPlayerUrl(ctx, c.id, c.name))}"><b>${esc(c.name)}</b></a> <span class="muted small">${logo(ctx.T[c.team], 14)} ${esc(c.team)}</span><span class="aw-line muted small">${esc(c.line)}</span></span></li>`).join("");
  return `<section class="card aw-card"><h2>${esc(title)}</h2><ol class="aw-list aw-team">${rows}</ol><p class="muted small aw-note">${esc(note)}</p></section>`;
}

/** /awards/ */
export function awardsPage(ctx) {
  const A = ctx.awards;
  if (!A) return page({ site: ctx.site, title: "NHL award race: front-runners", description: "Front-runners for the NHL's major awards.", path: "/awards/", active: "/awards/", body: `<h1>Award race</h1><p class="muted">Award data is unavailable right now. It returns with the next update.</p>` });
  const lead = A.voted.hart[0], jump = [...AWARDS, ...RACES].map((a) => `<a class="pill" href="#${a.k}">${esc(a.name.replace(/ (Trophy|Award)$/, ""))}</a>`).join("");
  const body = `<section class="hero"><div><p class="eyebrow">${esc(ctx.league.seasonId.toString().replace(/(\d{4})(\d{4})/, "$1-$2"))} season · ${A.gpTeam} games in</p><h1>Award race: who's leading</h1>
    <p class="lede">The front-runners for every major trophy, recalculated with each rebuild (every few minutes on game days). ${lead ? `Right now the model's top Hart pick is <b>${esc(lead.name)}</b>.` : ""}</p>
    <p class="muted small">Stat races (Art Ross, Richard, Presidents') are exact. Voted awards are a <b>model estimate of who voters would favour</b>, not the real vote and not betting odds: it weighs production, ice time and team success, and pulls early-season rates toward the league average so one hot week can't lead. Updated <time datetime="${attr(A.builtAt)}" data-fmt="ago">${esc(A.builtAt.slice(0, 10))}</time>.</p>
    <div class="pill-row" style="margin-top:10px">${jump}</div></div></section>
    <h2 class="section-h">Voted awards <span class="muted small">model estimates</span></h2>
    <div class="grid2 aw-grid">${AWARDS.map((a) => votedCard(ctx, a, A.voted[a.k])).join("")}</div>
    <h2 class="section-h">All-Star teams <span class="muted small">if the season ended today</span></h2>
    <div class="grid2 aw-grid">${teamCard(ctx, "First All-Star Team", "The best at each position by the same score as the Hart and Lindsay.", A.teams.allStar)}${teamCard(ctx, "All-Rookie Team", "Rookies only, same method.", A.teams.allRookie)}</div>
    <h2 class="section-h">Stat races <span class="muted small">exact leaders</span></h2>
    <div class="grid2 aw-grid">${RACES.map((r) => raceCard(ctx, r, A.races[r.k])).join("")}</div>
    <section class="card" style="margin-top:20px"><h2>Awards that can't be ranked from stats</h2><ul class="plain muted small"><li><b>Conn Smythe</b> (playoff MVP) appears here once the playoffs start.</li><li><b>Bill Masterton</b> (perseverance) and <b>King Clancy</b> (leadership and community work) are decided on off-ice stories, and each team's nominee isn't published until the spring.</li><li><b>General Manager of the Year</b> is voted by GMs on roster moves; there's no data to rank it honestly, so it's left out rather than guessed.</li></ul></section>`;
  return page({ site: ctx.site, title: "NHL award race: Hart, Vezina, Norris, Calder front-runners", description: "Live NHL award front-runners: Hart, Vezina, Norris, Calder, Selke, Lindsay and Lady Byng model estimates, plus exact Art Ross, Rocket Richard and Presidents' Trophy races.", path: "/awards/", active: "/awards/", body });
}

/** Small card for the home page: the top three Hart names and the points leader. */
export function awardsTile(ctx) {
  const A = ctx.awards;
  if (!A) return "";
  const pick = (k) => A.voted[k][0];
  const row = (label, c) => (c ? `<li><span class="muted small">${esc(label)}</span> <a href="${attr(anyPlayerUrl(ctx, c.id, c.name))}"><b>${esc(c.name)}</b></a> <span class="muted small">${esc(c.team)}</span></li>` : "");
  return `<section class="card"><h2>Award race <a class="more" href="/awards/">All trophies →</a></h2><ul class="plain">${row("Hart", pick("hart"))}${row("Vezina", pick("vezina"))}${row("Norris", pick("norris"))}${row("Calder", pick("calder"))}${row("Art Ross", A.races.artRoss[0])}</ul></section>`;
}
