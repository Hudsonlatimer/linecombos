// /awards/ — who is leading each trophy race, rebuilt every few minutes with the rest of the site.
import { esc, attr, page } from "./html.mjs";
import { logo, anyPlayerUrl } from "./nhl-pages.mjs";
import { AWARDS, RACES } from "../../public/assets/awardsmodel.js";

const shot = (ctx, c) => `https://assets.nhle.com/mugs/nhl/${ctx.league.seasonId}/${c.team}/${c.id}.png`;
const pctTxt = (x) => (x >= 0.995 ? "99%" : x < 0.01 ? "<1%" : `${Math.round(x * 100)}%`);

function votedCard(ctx, a, list) {
  const rows = list.map((c, i) => `<li class="aw-row${i === 0 ? " lead" : ""}">
    <span class="aw-rank">${i + 1}</span>
    <img class="aw-shot" src="${attr(shot(ctx, c))}" alt="" width="40" height="40" loading="lazy" onerror="this.style.visibility='hidden'">
    <span class="aw-who"><a href="${attr(anyPlayerUrl(ctx, c.id, c.name))}"><b>${esc(c.name)}</b></a> <span class="muted small">${esc(c.pos)} · ${logo(ctx.T[c.team], 14)} ${esc(c.team)}</span><span class="aw-line muted small">${esc(c.line)}</span></span>
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
    <h2 class="section-h">Stat races <span class="muted small">exact leaders</span></h2>
    <div class="grid2 aw-grid">${RACES.map((r) => raceCard(ctx, r, A.races[r.k])).join("")}</div>
    <section class="card" style="margin-top:20px"><h2>Not covered</h2><p class="muted small">The Conn Smythe (playoffs only), Masterton, King Clancy and Jack Adams aren't shown: they depend on stories, off-ice character or coach data this site doesn't have, and a made-up ranking would be worse than none.</p></section>`;
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
