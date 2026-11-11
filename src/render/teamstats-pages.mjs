// Team stats: the league table (a tab per category, every team ranked) and the full stats card on each team page.
import { esc, attr, page } from "./html.mjs";
import { logo } from "./nhl-pages.mjs";
import { GROUPS, METRICS, fmt } from "../lib/teamstats.mjs";

const heat = (rank, n) => (rank ? ((n - rank) / Math.max(1, n - 1)).toFixed(2) : "0");
const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th"}`;
const byGroup = (g) => METRICS.filter((m) => m.g === g);

/** /stats/teams/ */
export function teamStatsPage(ctx) {
  const S = ctx.teamStats, teams = Object.values(ctx.T).sort((a, b) => b.pts - a.pts || b.rw - a.rw), n = S.n;
  const tabs = GROUPS.map(([k, label], i) => `<button class="tab${i ? "" : " on"}" data-tab="${k}">${esc(label.replace(/ \(.*\)/, ""))}</button>`).join("");
  const panels = GROUPS.map(([k, label], i) => {
    const ms = byGroup(k);
    const head = `<tr><th class="n">#</th><th>Team</th>${ms.map((m) => `<th class="n" title="${attr(m.t || m.l)}">${esc(m.l)}</th>`).join("")}</tr>`;
    const rows = teams.map((t, j) => `<tr><td class="n muted">${j + 1}</td><td><a class="team-cell" href="/nhl/${t.slug}/">${logo(t, 20)}<b>${esc(t.abbrev)}</b></a></td>${ms.map((m) => {
      const c = S.byAbbr[t.abbrev]?.[m.k];
      return `<td class="n ts-cell${m.d ? " ranked" : ""}" data-v="${c?.v ?? ""}" style="--h:${heat(c?.rank, n)}"${c?.rank ? ` title="${esc(m.l)}: ${ordinal(c.rank)} of ${n}"` : ""}>${fmt(m.f, c?.v)}</td>`;
    }).join("")}</tr>`).join("");
    const avgRow = `<tr class="ts-avg"><td></td><td><b>League avg</b></td>${ms.map((m) => `<td class="n">${fmt(m.f, S.avg[m.k])}</td>`).join("")}</tr>`;
    return `<div class="tab-panel" data-panel="${k}"${i ? " hidden" : ""}><h2 class="section-h">${esc(label)}</h2><div class="card"><div class="table-wrap"><table class="tbl sortable compact ts-tbl"><thead>${head}</thead><tbody>${rows}</tbody><tfoot>${avgRow}</tfoot></table></div></div></div>`;
  }).join("");
  const body = `<section class="hero"><div><p class="eyebrow"><a href="/stats/">Stats</a> · team stats</p><h1>Team stats</h1>
    <p class="lede">Every team, every stat: scoring, shot share, expected goals, special teams, faceoffs by zone, hits and giveaways, penalties and scoring by strength. Cells are shaded by league rank (green is best, red is worst). Click a column to sort, or open a team page for its full breakdown.</p></div></section>
    <div class="tabs" role="tablist">${tabs}</div>${panels}
    <section class="card" style="margin-top:20px"><h2>About these numbers</h2><ul class="plain">
      <li><b>NHL stats:</b> the league's own team reports, refreshed with every build. 5v5 shot attempts (Corsi), unblocked attempts (Fenwick), zone starts, shooting and save %.</li>
      <li><b>Expected goals (xG):</b> our own shot-quality model, fitted on over 100,000 NHL shots: the chance each unblocked shot scores from its distance, angle, type, and whether it was a rebound or a rush. It excludes empty-net shots.</li>
      <li><b>PDO</b> (shooting % plus save %) far from 1.000 usually means luck, and tends to drift back. <b>Goals above expected</b> compares goals to the xG of the shots taken.</li>
      <li>Rank 1 is best. For stats where lower is better (goals against, penalties, giveaways) the lowest value is rank 1. Hits, blocks and some counts aren't ranked: more isn't better or worse.</li></ul></section>`;
  return page({ site: ctx.site, title: "NHL team stats: advanced stats for every team", description: "Full and advanced NHL team stats: shot attempts, expected goals, PDO, special teams, faceoffs, hits, penalties and goals by strength, with league ranks.", path: "/stats/teams/", active: "/stats/", body });
}

/** The full stats card for a team page. */
export function teamStatsCard(ctx, t) {
  const S = ctx.teamStats, mine = S?.byAbbr?.[t.abbrev];
  if (!mine) return "";
  const n = S.n;
  const group = ([k, label]) => {
    const rows = byGroup(k).map((m) => {
      const c = mine[m.k];
      const chip = c?.rank ? `<span class="rk" style="--h:${heat(c.rank, n)}" title="${ordinal(c.rank)} of ${n}">${c.rank}</span>` : "";
      return `<tr><td${m.t ? ` title="${attr(m.t)}"` : ""}>${esc(m.l)}${m.t ? ' <span class="muted small">ⓘ</span>' : ""}</td><td class="n"><b>${fmt(m.f, c?.v)}</b></td><td class="n">${chip}</td><td class="n muted">${fmt(m.f, S.avg[m.k])}</td></tr>`;
    }).join("");
    return `<div class="ts-group"><h3>${esc(label)}</h3><table class="tbl compact"><thead><tr><th>Stat</th><th class="n">${esc(t.abbrev)}</th><th class="n" title="League rank, 1 is best">Rank</th><th class="n">Avg</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  };
  return `<section class="card" id="team-stats"><h2>Team stats <span class="muted small">full and advanced · rank among ${n} teams</span></h2>
    <div class="ts-grid">${GROUPS.map(group).join("")}</div>
    <p class="src-note">Source: NHL team reports, plus expected goals from our shot model. <a href="/stats/teams/">Compare all teams →</a></p></section>`;
}
