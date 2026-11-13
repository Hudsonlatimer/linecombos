// Each team's roster, with scoring, advanced, special-teams, physical and faceoff tables, plus goalies.
import { esc, attr } from "./html.mjs";
import { SKATER_TABS, GOALIE_COLS, pick, fmt } from "../lib/rosterstats.mjs";

const capM = (n) => `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, "")}M`;

function bagsFor(ctx) {
  if (ctx._rosterBags) return ctx._rosterBags;
  const sk = {}, gl = {};
  for (const s of ctx.stats?.skaters ?? []) (sk[s.playerId] ??= {}).summary = s;
  for (const s of ctx.stats?.goalies ?? []) (gl[s.playerId] ??= {}).summary = s;
  for (const [id, extra] of Object.entries(ctx.rosterStats?.skaters ?? {})) Object.assign(sk[id] ??= {}, extra);
  for (const [id, extra] of Object.entries(ctx.rosterStats?.goalies ?? {})) Object.assign(gl[id] ??= {}, extra);
  ctx._rosterBags = { sk, gl };
  return ctx._rosterBags;
}

function cell(bag, col) {
  const v = pick(bag, col.p);
  return `<td class="n" data-stat="${attr(col.p)}" data-f="${col.f}" data-v="${v ?? ""}"${col.t ? ` title="${attr(col.t)}"` : ""}>${fmt(col.f, v)}</td>`;
}

function who(p) {
  return `<td class="num">${esc(p.num ?? "")}</td><td><a href="/players/${p.id}/">${esc(p.first)} ${esc(p.last)}</a></td><td>${esc(p.pos)}</td>`;
}

function table(rows, cols, { extraHead = "", extraCells = () => "" } = {}) {
  const head = `<tr><th>#</th><th>Player</th><th>Pos</th>${cols.map((c) => `<th class="n"${c.t ? ` title="${attr(c.t)}"` : ""}>${esc(c.l)}</th>`).join("")}${extraHead}</tr>`;
  const body = rows.map((p) => `<tr data-pid="${p.id}" data-kind="${p.pos === "G" ? "G" : "S"}">${who(p)}${cols.map((c) => cell(p.bag, c)).join("")}${extraCells(p)}</tr>`).join("");
  return `<div class="table-wrap"><table class="tbl sortable compact"><thead>${head}</thead><tbody>${body || `<tr><td colspan="${3 + cols.length}">No players.</td></tr>`}</tbody></table></div>`;
}

/** The roster card on a team page. Numbers refresh in the browser from /live/. */
export function rosterCard(ctx, t) {
  const roster = ctx.rosters?.[t.abbrev] ?? [];
  const { sk, gl } = bagsFor(ctx);
  const skaters = roster.filter((p) => p.pos !== "G").map((p) => ({ ...p, bag: sk[p.id] ?? {} }));
  const goalies = roster.filter((p) => p.pos === "G").map((p) => ({ ...p, bag: gl[p.id] ?? {} }));
  const Y = Math.floor(ctx.league.seasonId / 10000);
  const ageOf = (id) => {
    const b = ctx.profiles?.[id]?.birthDate;
    return b ? Math.floor((Date.parse(ctx.site.builtAt) - Date.parse(b)) / (365.25 * 864e5)) : null;
  };
  const capOf = (id) => {
    const k = ctx.profiles?.[id]?.contract?.list?.find((x) => x.startYear <= Y && +x.end.slice(0, 4) >= Y);
    return k ? { aav: k.aav, until: +k.end.slice(0, 4) + 1, exp: k.expiry } : null;
  };
  const tabs = [
    ...SKATER_TABS.map(([k, label], i) => `<button class="tab${i ? "" : " on"}" data-tab="${k}">${esc(label)}</button>`),
    `<button class="tab" data-tab="goalies">Goalies</button>`,
  ].join("");
  const panels = SKATER_TABS.map(([k], i) => {
    const cols = SKATER_TABS.find((x) => x[0] === k)[2];
    const scoring = k === "scoring";
    const html = table(skaters, cols, scoring ? {
      extraHead: `<th class="n">Age</th><th class="n">Cap hit</th>`,
      extraCells: (p) => {
        const age = ageOf(p.id);
        const c = capOf(p.id);
        const cap = c ? `<td class="n" data-v="${c.aav}" title="Through ${c.until - 1}-${String(c.until).slice(2)}${c.exp ? `, then ${c.exp}` : ""}">${capM(c.aav)}</td>` : `<td class="n muted" data-v="0">—</td>`;
        return `<td class="n" data-v="${age ?? ""}">${age ?? ""}</td>${cap}`;
      },
    } : {});
    return `<div class="tab-panel" data-panel="${k}"${i ? " hidden" : ""}>${html}</div>`;
  }).join("");
  const goaliePanel = `<div class="tab-panel" data-panel="goalies" hidden>${table(goalies, GOALIE_COLS)}</div>`;
  return `<section class="card" id="roster" data-abbr="${attr(t.abbrev)}" data-season="${attr(ctx.league.seasonId)}">
    <h2>Roster <span class="muted small">scoring, advanced, special teams</span></h2>
    <p class="src-note" id="roster-live">Season numbers from the last site build. This table refreshes from the NHL when you open the page.</p>
    <div class="tabs" role="tablist">${tabs}</div>
    ${panels}${goaliePanel}
  </section>`;
}
