// The mock draft: first-round order from each team's projected final points (before the lottery), with the consensus of public
// rankings and mock drafts filling the picks, and the public mocks shown side by side.
import { esc, attr, fmtDate, page } from "./html.mjs";
import { logo } from "./nhl-pages.mjs";
import { flag, nationFromHome } from "./geo.mjs";

const SHORT = { "clutch-oct31": "ClutchPoints", "thn-mock-aug": "THN", "lines-mock": "Lines.com" };

export function mockDraftPage(ctx) {
  const D = ctx.draftClass, pub = D.publicLists, T = ctx.T, odds = ctx.cup.odds;
  const order = Object.keys(T).sort((a, b) => odds[a].pts - odds[b].pts || T[a].ptsPct - T[b].ptsPct).slice(0, 32);
  const cons = D.players.filter((p) => p.consensus).sort((a, b) => a.consensus - b.consensus);
  const at = (n) => cons[n - 1];
  const club = (p) => (p.now ? `${esc(p.team)} <span class="muted">${esc(p.league)}</span>` : p.nowTeam ? esc(p.nowTeam) : p.last ? `${esc(p.last.team)} ${esc(p.last.league)}` : "");
  const mockChips = (p) => (p?.consMocks ?? []).map((m) => `<span class="mk" title="${attr(`${m.source}: pick ${m.pick}, ${m.team}`)}">${esc(SHORT[m.id] ?? m.id)} #${m.pick}</span>`).join("");
  const rows = order.map((orig, i) => {
    const owner = pub.ownedBy?.[orig] ?? orig, p = at(i + 1), t = T[owner], lot = i < 16;
    return `<tr${lot ? "" : ' class="nolot"'}><td class="n"><b>${i + 1}</b></td>
      <td><a class="team-cell" href="/nhl/${t.slug}/">${logo(t, 22)}<b>${esc(owner)}</b></a>${owner !== orig ? ` <span class="muted small">via ${esc(orig)}</span>` : ""}</td>
      <td class="n muted" title="Projected final points from the Cup predictor">${odds[orig].pts.toFixed(0)}</td>
      <td class="dc-who">${p ? `${flag(nationFromHome(p.from))} <b>${esc(p.name)}</b><small>${[p.pos, p.born, p.height].filter(Boolean).map(esc).join(" · ")}</small>` : "—"}</td>
      <td>${p ? club(p) : ""}</td><td class="n">${p?.consAvg != null ? p.consAvg.toFixed(1) : "—"}</td><td class="mocks">${mockChips(p)}</td></tr>`;
  }).join("");

  const cmp = pub.mocks.map((m) => ({ ...m, label: SHORT[m.id] ?? m.source }));
  const cmpRows = Array.from({ length: 16 }, (_, i) => `<tr><td class="n"><b>${i + 1}</b></td><td><b>${esc(at(i + 1)?.name ?? "—")}</b> <span class="muted small">${esc(order[i])}</span></td>${cmp.map((m) => `<td>${m.picks[i] ? `${esc(m.picks[i][1])} <span class="muted small">${esc(m.picks[i][0])}</span>` : ""}</td>`).join("")}</tr>`).join("");

  const top = cons.slice(0, 40);
  const rankRows = top.map((p) => `<tr><td class="n"><b>${p.consensus}</b></td><td class="dc-who">${flag(nationFromHome(p.from))} <b>${esc(p.name)}</b></td><td>${esc(p.pos ?? "")}</td><td>${club(p)}</td>
    <td class="n">${p.consAvg?.toFixed(1) ?? "—"}</td><td class="n">${p.consN ?? "—"}/${pub.count}</td><td>${p.css ? `<span class="css-grade g-${p.css.toLowerCase()}">${esc(p.css)}</span>` : ""}</td><td class="n">${p.score != null ? p.score.toFixed(2) : "—"}</td></tr>`).join("");

  const body = `<section class="hero"><div><p class="eyebrow"><a href="/prospects/">Prospects</a> · ${D.year} NHL Draft</p><h1>${D.year} mock draft</h1>
    <p class="lede">First-round order from each team's projected final points (before the lottery), with the players taken from the consensus of ${pub.count} public rankings and mock drafts. Landon DuPont goes No. 1 on every list.</p></div></section>
  <section class="card"><h2>First round <span class="muted small">best available by consensus</span></h2>
    <div class="table-wrap"><table class="tbl compact mock-tbl"><thead><tr><th class="n">Pick</th><th>Team</th><th class="n" title="Projected points">Pts</th><th>Player</th><th>Club</th><th class="n" title="Average rank across the public lists">Avg rank</th><th>Public mocks</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="src-note">Order: teams sorted by projected 2026-27 points from our Cup predictor, worst first; the lottery isn't applied (the first 16 picks aren't decided by record alone). Pick ownership follows public mocks, which show Chicago, Seattle, Philadelphia, Toronto and New Jersey holding extra firsts. Update the lists in <code>config/draft/${D.year}-public-lists.json</code>.</p></section>
  <h2 class="section-h">Public mock drafts, side by side</h2>
  <section class="card"><div class="table-wrap"><table class="tbl compact"><thead><tr><th class="n">Pick</th><th>Our mock</th>${cmp.map((m) => `<th><a href="${attr(m.url)}" target="_blank" rel="nofollow noopener">${esc(m.label)}</a> <span class="muted small">${esc(fmtDate(m.date, { month: "short", day: "numeric" }))}</span></th>`).join("")}</tr></thead><tbody>${cmpRows}</tbody></table></div>
    <p class="src-note">Each public mock uses its own draft order, so the teams differ. The Hockey News orders teams by projected finish; ClutchPoints uses the Tankathon standings of Oct 31.</p></section>
  <h2 class="section-h">Consensus ranking</h2>
  <section class="card"><div class="table-wrap"><table class="tbl sortable compact"><thead><tr><th class="n">#</th><th>Player</th><th>Pos</th><th>Club</th><th class="n">Avg rank</th><th class="n">On lists</th><th>CSS</th><th class="n">Stats index</th></tr></thead><tbody>${rankRows}</tbody></table></div></section>
  <section class="card" style="margin-top:20px"><h2>The lists behind it</h2><div class="table-wrap"><table class="tbl compact"><thead><tr><th>Source</th><th>Type</th><th>Date</th><th class="n">Weight</th><th class="n">Players</th></tr></thead><tbody>
    ${pub.sources.map((s) => `<tr><td><a href="${attr(s.url)}" target="_blank" rel="nofollow noopener">${esc(s.source)}</a></td><td>${s.kind === "mock" ? "Mock draft" : "Ranking"}</td><td>${esc(fmtDate(s.date, { month: "short", day: "numeric", year: "numeric" }))}</td><td class="n">${s.weight}</td><td class="n">${s.n}</td></tr>`).join("")}</tbody></table></div>
    <p class="muted small">A player's consensus rank is the weighted average of his rank on every list (a mock's pick number counts as a rank); a player missing from a list is ranked just below that list's last name. Newer lists weigh more. NHL Central Scouting's grades and our stats index (points per game, adjusted for league and age) are shown for context and order everyone outside the consensus.</p></section>`;
  return page({ site: ctx.site, title: `${D.year} NHL mock draft and consensus rankings`, description: `${D.year} NHL mock draft built from ${pub.count} public rankings and mock drafts, with the first-round order projected from team records.`, path: "/prospects/mock-draft/", active: "/prospects/", body });
}
