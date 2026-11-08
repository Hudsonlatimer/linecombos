// Player profiles, injuries & scratches, transactions, Stanley Cup predictor, and the homepage.
import { esc, attr, mmss, pct, signed, fmtDate, localTime, stage, pill, page } from "./html.mjs";
import { logo, pname, onIce, homeCards, newsItem, anyPlayerUrl } from "./nhl-pages.mjs";
import { TX_LABEL } from "../lib/moves.mjs";
import { fmtMoney, contractForSigning } from "../lib/contracts.mjs";
import { country, countryByName, flag } from "./geo.mjs";

const ord = (n) => `${n}${["th", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th"}`;
const dob = (d) => fmtDate(d, { month: "short", day: "numeric", year: "numeric" });
/** "$12.5M × 2 yrs" chip for a signing. */
export const moneyChip = (k) => k ? `<span class="money" title="${attr(`${fmtMoney(k.total, { short: false })} total${k.expiry ? `, ${k.expiry} at expiry` : ""}`)}"><b>${fmtMoney(k.aav)}</b> × ${k.len} yr${k.len === 1 ? "" : "s"}${k.elc ? " · ELC" : ""}</span>` : "";

/** Where a player ranks on his team and in the league this season. */
function rankCard(ctx, p, t) {
  if (!t) return "";
  const ids = new Set((ctx.rosters[t.abbrev] ?? []).map((x) => x.id));
  const goalie = p.pos === "G";
  const all = goalie ? ctx.stats.goalies : ctx.stats.skaters;
  const me = all.find((x) => x.playerId === p.id);
  if (!me) return "";
  const maxGp = Math.max(...all.map((x) => x.gamesPlayed));
  const qual = goalie ? (x) => x.gamesPlayed >= Math.max(3, maxGp * 0.3) : () => true;
  const cats = goalie
    ? [["Wins", "wins"], ["Save %", "savePct", (v) => pct(v), true], ["GAA", "goalsAgainstAverage", (v) => Number(v).toFixed(2), true, true], ["Shutouts", "shutouts"]]
    : [["Points", "points"], ["Goals", "goals"], ["Assists", "assists"], ["+/-", "plusMinus", signed], ["PP points", "ppPoints"], ["Shots", "shots"], ["TOI / game", "timeOnIcePerGame", mmss]];
  const rows = cats.map(([label, k, fmt = (v) => v, rate = false, low = false]) => {
    const better = (x) => (low ? x[k] < me[k] : x[k] > me[k]);
    const pool = (list) => list.filter((x) => x[k] != null && (!rate || qual(x)));
    const team = pool(all.filter((x) => ids.has(x.playerId) || x.playerId === p.id));
    const lg = pool(goalie ? all : all.filter((x) => (x.positionCode === "D") === (p.pos === "D")));
    const tr = 1 + team.filter(better).length, lr = 1 + lg.filter(better).length;
    const okRate = !rate || qual(me);
    return `<div class="rk-row"><span class="rk-label">${label}</span><b class="rk-val">${esc(fmt(me[k]))}</b><span class="rk-badge${okRate && tr === 1 ? " gold" : okRate && tr <= 3 ? " top" : ""}">${okRate ? `${ord(tr)} on ${esc(t.abbrev)}` : "—"}</span><span class="rk-lg muted">${okRate ? `#${lr} ${goalie ? "NHL" : p.pos === "D" ? "NHL D" : "NHL F"}` : "min. GP"}</span></div>`;
  }).join("");
  return `<section class="card"><h2>Where he ranks <span class="muted small">this season</span></h2><div class="rk">${rows}</div><p class="muted small">Team rank among current ${esc(t.common)}; league rank among all ${goalie ? "goalies (rate stats need 30% of the leader's GP)" : p.pos === "D" ? "defencemen" : "forwards"}.</p></section>`;
}

function recordsCard(ctx, p) {
  const list = (p.records ?? []).filter((r) => r.rank <= (r.scope === "NHL" ? 100 : 50)).sort((a, b) => a.rank - b.rank || (a.scope === "NHL" ? -1 : 1)).slice(0, 8);
  if (!list.length) return "";
  return `<section class="card"><h2>Records &amp; rankings <span class="muted small">all-time, regular season</span></h2><ul class="rec-list">${list.map((r) => {
    const t = ctx.T[r.scope];
    return `<li><span class="rec-rank${r.rank <= 10 ? " top" : ""}">#${r.rank}</span><span class="rec-what">${t ? `${logo(t, 18)} ${esc(t.common)} history` : "All-time NHL"}<b>${esc(r.stat)}</b></span><span class="rec-val">${r.value.toLocaleString("en-US")}</span></li>`;
  }).join("")}</ul><a class="more" href="/records/">All-time records →</a></section>`;
}

function contractCard(ctx, p) {
  const ct = p.contract;
  if (!ct?.list?.length) return "";
  const Y = Math.floor(ctx.league.seasonId / 10000);
  const cur = ct.list.find((k) => k.startYear <= Y && +k.end.slice(0, 4) >= Y) ?? null;
  const next = ct.list.find((k) => k.startYear > Y) ?? null;
  const k = cur ?? next;
  if (!k) return "";
  const ends = +k.end.slice(0, 4) + 1;
  const slug = `${p.first} ${p.last}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const clauses = (ct.terms || "").split(/,\s*/).filter(Boolean);
  return `<section class="card contract-card"><h2>Contract <span class="muted small">${esc(k.elc ? "Entry-level" : k.ext ? "Extension" : k.twoWay ? "Two-way" : "Standard")}</span></h2>
    <div class="ct-top"><div class="ct-big"><b>${fmtMoney(k.aav)}</b><span>cap hit${cur ? "" : ` from ${esc(k.start)}`}</span></div>
      <div class="ct-grid"><div><span>Term</span><b>${k.len} yr${k.len === 1 ? "" : "s"}</b></div><div><span>Total</span><b>${fmtMoney(k.total)}</b></div><div><span>Expires</span><b>${ends}${k.expiry ? ` · ${esc(k.expiry)}` : ""}</b></div></div></div>
    ${clauses.length ? `<p class="ct-clauses">${clauses.map((c) => pill(c, "warn")).join(" ")} <span class="muted small">${esc(ct.termsDetails && ct.termsDetails !== ct.terms ? ct.termsDetails : "")}</span></p>` : ""}
    <div class="table-wrap"><table class="tbl compact ct-years"><thead><tr><th>Season</th><th class="n">Cap hit</th><th class="n">Salary</th><th class="n">Bonus</th></tr></thead><tbody>
      ${ct.list.filter((x) => x === cur || x === next).flatMap((x) => x.years).map((y) => `<tr${+y.season.slice(0, 4) === Y ? ' class="now"' : ""}><td>${esc(y.season)}${y.clause ? ` <span class="muted small">${esc(y.clause)}</span>` : ""}</td><td class="n"><b>${fmtMoney(y.cap)}</b></td><td class="n">${fmtMoney(y.base)}</td><td class="n">${y.bonus ? fmtMoney(y.bonus) : "—"}</td></tr>`).join("")}
    </tbody></table></div>
    ${cur && next ? `<div class="alert ok"><b>Extension signed:</b> ${fmtMoney(next.aav)} × ${next.len} from ${esc(next.start)} (${fmtMoney(next.total)} total).</div>` : ""}
    <p class="muted small">${ct.acquired ? `Acquired: ${esc(ct.acquired)}. ` : ""}Source: <a href="https://capwages.com/players/${slug}" target="_blank" rel="noopener">CapWages</a>.</p></section>`;
}

const teamUrl = (t) => `/nhl/${t.slug}/`;
const playerUrl = (id) => `/players/${id}/`;
const P100 = (x, d = 0) => (x == null ? "—" : x >= 0.995 && x < 1 ? ">99%" : x > 0 && x < 0.005 && d === 0 ? "<1%" : `${(x * 100).toFixed(d)}%`);
const injClass = (s = "") => (/day/i.test(s) ? "warn" : "bad");
const INJ_SHORT = { "Injured Reserve": "IR", "Day-To-Day": "Day-to-day", Out: "Out", "Long-Term Injured Reserve": "LTIR" };

function plink(ctx, id, name) {
  return id ? `<a href="${anyPlayerUrl(ctx, id, name)}">${esc(name)}</a>` : esc(name);
}

// ---------- team page extras ----------
export function teamExtras(ctx, t) {
  const inj = ctx.injByTeam?.[t.abbrev] ?? [];
  const scr = (ctx.scratches?.[t.abbrev] ?? []).filter((s) => !s.injury);
  const moves = (ctx.txByTeam?.[t.abbrev] ?? []).slice(0, 5);
  const odds = ctx.cup?.odds?.[t.abbrev];
  return `${odds ? `<a class="card odds-card" href="/cup/"><span class="eyebrow">Cup predictor</span><div class="odds-row"><div><b>${P100(odds.playoffs)}</b><span>Playoffs</span></div><div><b>${P100(odds.cup, 1)}</b><span>Stanley Cup</span></div><div><b>${odds.pts}</b><span>Proj. points</span></div></div></a>` : ""}
  <section class="card"><h2>Injuries &amp; scratches</h2>
    ${inj.map((i) => `<div class="inj-row"><span class="pill ${injClass(i.status)}">${esc(INJ_SHORT[i.status] ?? i.status)}</span><div><b>${plink(ctx, i.id, i.name)}</b> <span class="muted small">${esc(i.pos)}${i.body ? ` · ${esc(i.body)}` : ""}</span><div class="muted small">${esc(i.short)}</div></div></div>`).join("")}
    ${scr.length ? `<h3>Scratched last game</h3><p class="small">${scr.map((s) => plink(ctx, s.id, `${s.first} ${s.last}`)).join(", ")}</p>` : ""}
    ${!inj.length && !scr.length ? `<p class="empty">No injuries reported.</p>` : ""}
    <a class="more" href="/injuries/">All teams →</a></section>
  ${moves.length ? `<section class="card"><h2>Recent moves</h2>${moves.map((m) => txRow(m)).join("")}<a class="more" href="/moves/">All moves →</a></section>` : ""}`;
}

const txRow = (m, team = null) => `<div class="tx-row"><span class="pill tx-${m.kind}">${esc(TX_LABEL[m.kind])}</span><div>${team ? `<b>${esc(team)}</b> · ` : ""}${esc(m.text)} ${(m.money ?? []).map(moneyChip).join(" ")}<div class="muted small">${esc(fmtDate(m.date, { month: "short", day: "numeric", year: "numeric" }))}</div></div></div>`;

// ---------- player profile ----------
const TL_GROUP = { born: "milestone", debut: "milestone", draft: "milestone", award: "milestone", club: "team", team: "team", intl: "team", sign: "contract", release: "contract", retire: "contract", trade: "move", waivers: "move", recall: "move", assign: "move", other: "move", injury: "health", return: "health", "injury-now": "health", suspension: "health", news: "news" };
const TL_LABEL = { milestone: "Milestones", team: "Teams", contract: "Contracts", move: "Trades & moves", health: "Injuries", news: "News" };

function careerChart(rows, goalie) {
  const by = new Map();
  for (const r of rows.filter((r) => r.league === "NHL")) {
    const x = by.get(r.season) ?? { season: r.season, v: 0, gp: 0 };
    x.v += (goalie ? r.w : r.p) ?? 0; x.gp += r.gp ?? 0; by.set(r.season, x);
  }
  const list = [...by.values()];
  if (list.length < 2) return "";
  const max = Math.max(...list.map((x) => x.v), 1), W = 640, H = 170, bw = Math.min(42, (W - 20) / list.length - 6);
  const step = (W - 20) / list.length;
  return `<section class="card"><h2>NHL career arc <span class="muted small">${goalie ? "Wins" : "Points"} by season</span></h2>
    <svg class="arc" viewBox="0 0 ${W} ${H + 34}" role="img" aria-label="${goalie ? "Wins" : "Points"} by season">
      ${list.map((x, i) => { const h = (x.v / max) * H, cx = 10 + i * step + step / 2; return `<g><rect x="${cx - bw / 2}" y="${H - h + 14}" width="${bw}" height="${Math.max(h, 1)}" rx="4"><title>${x.season}: ${x.v} ${goalie ? "wins" : "points"} in ${x.gp} GP</title></rect><text x="${cx}" y="${H - h + 9}" class="v">${x.v}</text><text x="${cx}" y="${H + 30}" class="s">${x.season.slice(2)}</text></g>`; }).join("")}
    </svg></section>`;
}

function careerTable(rows, goalie, caption) {
  if (!rows.length) return "";
  const head = goalie ? ["Season", "Team", "League", "GP", "W", "L", "GAA", "SV%", "SO"] : ["Season", "Team", "League", "GP", "G", "A", "P", "PIM", "+/-"];
  return `<h3>${caption}</h3><div class="table-wrap"><table class="tbl compact"><thead><tr>${head.map((x, i) => `<th${i > 2 ? ' class="n"' : ""}>${x}</th>`).join("")}</tr></thead><tbody>
  ${rows.map((r) => `<tr${r.league === "NHL" ? ' class="nhl-row"' : ""}><td>${esc(r.season)}</td><td>${esc(r.team)}</td><td>${esc(r.league)}</td><td class="n">${r.gp ?? ""}</td>${goalie
    ? `<td class="n">${r.w ?? ""}</td><td class="n">${r.l ?? ""}</td><td class="n">${r.gaa != null ? Number(r.gaa).toFixed(2) : ""}</td><td class="n">${r.sv != null ? Number(r.sv).toFixed(3).replace(/^0/, "") : ""}</td><td class="n">${r.so ?? ""}</td>`
    : `<td class="n">${r.g ?? ""}</td><td class="n">${r.a ?? ""}</td><td class="n"><b>${r.p ?? ""}</b></td><td class="n">${r.pim ?? ""}</td><td class="n">${r.pm != null && r.league === "NHL" ? signed(r.pm) : ""}</td>`}</tr>`).join("")}
  </tbody></table></div>`;
}

function goalieNote(t, id) {
  const g = t.goalies, n = g.starts.find((x) => x.id === id)?.starts ?? 0;
  const tags = [g.lastStarter === id && pill("Started last game", "ok"), g.projected === id && pill("Projected to start next", "info")].filter(Boolean).join(" ");
  return `<p><b>${n}</b> start${n === 1 ? "" : "s"} in the team's last ${g.window} games.</p>${tags ? `<p>${tags}</p>` : ""}<p class="muted small"><a href="/goalies/">All starting goalies →</a></p>`;
}

export function profilePage(ctx, p) {
  const t = p.team ? ctx.T[p.team] : null;
  const owner = !t && p.nhlTeam ? ctx.T[p.nhlTeam] : null;
  const c = p.car;
  const goalie = p.pos === "G";
  const inj = ctx.injById?.[p.id] ?? null;
  const scratched = !inj && (ctx.scratches?.[p.team] ?? []).some((s) => s.id === p.id);
  const age = p.birthDate ? Math.floor((Date.parse(ctx.site.builtAt) - Date.parse(p.birthDate)) / (365.25 * 864e5)) : null;
  const ht = p.height ? `${Math.floor(p.height / 12)}'${p.height % 12}"` : "";
  const d = p.draft;
  const status = inj ? `<span class="pill ${injClass(inj.status)}">${esc(inj.status)}${inj.body ? ` · ${esc(inj.body)}` : ""}</span>`
    : scratched ? `<span class="pill warn">Scratched last game</span>`
    : t ? `<span class="pill ok">Active roster</span>` : owner ? `<span class="pill info">${esc(owner.common)} prospect</span>`
    : p.status === "alumni" ? `<span class="pill muted">${p.active ? "Not on an NHL roster" : "Retired"}</span>` : "";
  const alum = p.status === "alumni";

  // Current NHL deployment (from the last game's shift data).
  const L = t?.last;
  const where = [];
  if (L) for (const [k, list] of [["L", L.lines], ["D", L.pairs], ["PP", L.pp], ["PK", L.pk]]) list.forEach((u, i) => u.ids.includes(p.id) && where.push({ k: `${k}${i + 1}`, c: u }));
  const s = ctx.stats.skaters.find((x) => x.playerId === p.id);
  const gs = ctx.stats.goalies.find((x) => x.playerId === p.id);
  const statBox = s ? [["GP", s.gamesPlayed], ["G", s.goals], ["A", s.assists], ["P", s.points], ["+/-", signed(s.plusMinus)], ["PPP", s.ppPoints], ["SOG", s.shots], ["TOI", mmss(s.timeOnIcePerGame)]]
    : gs ? [["GP", gs.gamesPlayed], ["GS", gs.gamesStarted], ["W", gs.wins], ["L", gs.losses], ["OTL", gs.otLosses], ["SV%", pct(gs.savePct)], ["GAA", Number(gs.goalsAgainstAverage).toFixed(2)], ["SO", gs.shutouts]]
    : c?.regular ? (goalie
      ? [["NHL GP", c.regular.gamesPlayed], ["W", c.regular.wins], ["L", c.regular.losses], ["SV%", c.regular.savePctg != null ? Number(c.regular.savePctg).toFixed(3).replace(/^0/, "") : "—"], ["GAA", c.regular.goalsAgainstAvg != null ? Number(c.regular.goalsAgainstAvg).toFixed(2) : "—"], ["SO", c.regular.shutouts]]
      : [["NHL GP", c.regular.gamesPlayed], ["G", c.regular.goals], ["A", c.regular.assists], ["P", c.regular.points], ["+/-", signed(c.regular.plusMinus ?? 0)], ["Playoff P", c.playoffs?.points ?? 0]]) : [];
  const statLabel = s || gs ? "This season" : c?.regular ? "NHL career" : "";

  const born = country(p.birthCountry);
  const nats = (p.nations?.length ? p.nations.map(countryByName) : born ? [born] : []).filter(Boolean);
  const place = [p.birthCity, p.birthState, born?.name].filter(Boolean).join(", ");
  const Y = Math.floor(ctx.league.seasonId / 10000);
  const curK = p.contract?.list?.find((k) => k.startYear <= Y && +k.end.slice(0, 4) >= Y) ?? null;
  // Facts are [label, plain text, optional html].
  const facts = [
    ["Age", age != null && !(alum && !p.active) ? String(age) : null],
    ["Date of birth", p.birthDate ? dob(p.birthDate) : null],
    ["Birthplace", place || null, place ? `${flag(born)} ${esc(place)}` : null],
    ["Citizenship", nats.length ? nats.map((n) => n.name).join(", ") : null, nats.length ? nats.map((n) => `${flag(n)} ${esc(n.name)}`).join("<br>") : null],
    ["NHL seasons", p.yrs ?? null],
    ["NHL teams", p.nhlTeams?.length ? p.nhlTeams.join(", ") : null],
    ["Size", ht ? `${ht}, ${p.weight} lb` : null],
    [goalie ? "Catches" : "Shoots", p.shoots],
    ["Draft", d ? `${d.year} · Round ${d.round}, #${d.overallPick} overall (${ctx.T[d.teamAbbrev]?.name ?? d.teamAbbrev})` : p.birthDate && +p.birthDate.slice(0, 4) < +ctx.site.builtAt.slice(0, 4) - 18 ? "Undrafted" : null],
    ["Before the NHL", c?.before ? `${c.before.team} (${c.before.league}), ${c.before.season}` : null],
    ["NHL debut", c?.firstNhl ? `${c.firstNhl} season` : null],
    ["Cap hit", curK ? `${fmtMoney(curK.aav)} through ${curK.end}${curK.expiry ? ` (${curK.expiry})` : ""}` : null],
    ["Last contract", !curK && c?.contract ? `${c.contract.term ? c.contract.term.replace(/^\w/, (x) => x.toUpperCase()) + " " : ""}${c.contract.elc ? "entry-level deal" : c.contract.ext ? "extension" : "contract"}, signed ${fmtDate(c.contract.date, { month: "short", year: "numeric" })}` : null],
  ].filter(([, v]) => v);

  const groups = [...new Set((c?.timeline ?? []).map((e) => TL_GROUP[e.kind] ?? "move"))];
  const timeline = c?.timeline?.length ? `<div class="chips tl-filters" data-target="#tl"><button class="chip on" data-g="all">All</button>${Object.keys(TL_LABEL).filter((g) => groups.includes(g)).map((g) => `<button class="chip" data-g="${g}">${TL_LABEL[g]}</button>`).join("")}</div>
    <ol class="timeline" id="tl">${c.timeline.map((e) => { const g = TL_GROUP[e.kind] ?? "move"; return `<li class="tl tl-${g}" data-g="${g}"><span class="tl-dot"></span><div class="tl-when">${esc(/^\d{4}-\d\d-\d\d$/.test(e.when) ? fmtDate(e.when, { month: "short", day: "numeric", year: "numeric" }) : e.when)}</div><div class="tl-body"><b>${esc(e.title)}</b>${e.kind === "sign" ? " " + moneyChip(contractForSigning({ contracts: p.contract?.list }, { date: e.sort, sentence: e.text })) : ""}${e.text ? `<div class="muted">${esc(e.text)}</div>` : ""}${e.url ? `<a class="src" href="${attr(e.url)}" target="_blank" rel="nofollow noopener">Source post</a>` : ""}</div></li>`; }).join("")}</ol>` : `<p class="empty">No career history available.</p>`;

  const capSlug = `${p.first} ${p.last}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const contracts = `<section class="card"><h2>Contract history</h2>
      ${c?.signings?.length ? `<ol class="sign-list">${c.signings.map((x) => `<li><span class="muted small">${esc(fmtDate(x.date, { month: "short", day: "numeric", year: "numeric" }))}</span>${esc(x.text)} ${moneyChip(contractForSigning({ contracts: p.contract?.list }, { date: x.date, sentence: x.text }))}</li>`).join("")}</ol>` : `<p class="empty">No signings on record${t || owner ? "" : " with an NHL team"}.</p>`}
      <p class="muted small">Signings come from team transaction logs; dollar figures from <a href="https://capwages.com/players/${capSlug}" target="_blank" rel="noopener">CapWages</a> for current deals.</p></section>`;
  const moves = (c?.timeline ?? []).filter((e) => ["trade", "waivers", "recall", "assign", "injury", "return", "suspension", "release", "other"].includes(e.kind));

  const tc = (t ?? owner)?.accent;
  const body = `<section class="p-hero${p.hero ? " has-hero" : ""}" style="${p.hero ? `--hero:url('${attr(p.hero)}');` : ""}${tc ? `--team:${attr(tc)}` : ""}">
    <div class="p-hero-in">
      <img class="p-shot" src="${attr(p.headshot || "https://assets.nhle.com/mugs/nhl/default-skater.png")}" alt="" width="150" height="150">
      <div class="p-id">
        <p class="eyebrow">${t ? `<a href="${teamUrl(t)}">${logo(t, 18)} ${esc(t.name)}</a>` : owner ? `<a href="${teamUrl(owner)}">${logo(owner, 18)} ${esc(owner.name)} prospect</a>` : alum && p.yrs ? `NHL ${esc(p.yrs)}${p.nhlTeams?.length ? ` · ${esc(p.nhlTeams.slice(0, 3).join(", "))}${p.nhlTeams.length > 3 ? ` +${p.nhlTeams.length - 3}` : ""}` : ""}` : esc(p.club ?? "")}</p>
        <h1>${esc(p.first)} ${esc(p.last)} ${p.num ? `<span class="p-num">#${esc(p.num)}</span>` : ""}</h1>
        <p class="p-sub">${esc({ C: "Centre", L: "Left wing", R: "Right wing", D: "Defence", G: "Goalie" }[p.pos] ?? p.pos)} ${status}</p>
        <ul class="p-bio">${[
          age != null && !(alum && !p.active) && `<li><span>Age</span><b>${age}</b></li>`,
          p.birthDate && `<li><span>Born</span><b>${esc(dob(p.birthDate))}</b></li>`,
          place && `<li><span>From</span><b>${flag(born)} ${esc([p.birthCity, born?.name].filter(Boolean).join(", "))}</b></li>`,
          ht && `<li><span>Size</span><b>${ht} · ${p.weight} lb</b></li>`,
          p.shoots && `<li><span>${goalie ? "Catches" : "Shoots"}</span><b>${esc(p.shoots)}</b></li>`,
          curK && `<li><span>Cap hit</span><b>${fmtMoney(curK.aav)}</b></li>`,
        ].filter(Boolean).join("")}</ul>
      </div>
    </div>
  </section>
  ${statBox.length ? `<div class="statbox" data-label="${attr(statLabel)}">${statBox.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join("")}</div>` : ""}
  <div class="layout"><div>
    <div class="tabs"><button class="tab on" data-tab="tl">Timeline</button><button class="tab" data-tab="stats">Career stats</button><button class="tab" data-tab="moves">Contracts &amp; moves</button></div>
    <div class="tab-panel" data-panel="tl"><section class="card"><h2>Career timeline</h2>${timeline}</section></div>
    <div class="tab-panel" data-panel="stats" hidden>
      ${careerChart(c?.table ?? [], goalie)}
      <section class="card"><h2>Career stats</h2>
        ${c?.regular ? `<div class="statbox slim">${(goalie ? [["NHL GP", c.regular.gamesPlayed], ["W", c.regular.wins], ["SV%", c.regular.savePctg != null ? Number(c.regular.savePctg).toFixed(3).replace(/^0/, "") : "—"], ["SO", c.regular.shutouts], ["Playoff GP", c.playoffs?.gamesPlayed ?? 0]] : [["NHL GP", c.regular.gamesPlayed], ["G", c.regular.goals], ["A", c.regular.assists], ["P", c.regular.points], ["Playoff P", c.playoffs?.points ?? 0]]).map(([k, v]) => `<div><span>${k}</span><b>${esc(v ?? "—")}</b></div>`).join("")}</div>` : ""}
        ${careerTable(c?.table ?? [], goalie, "Club teams, regular season")}
        ${careerTable(c?.intl ?? [], goalie, "International")}
        ${!c?.table?.length ? `<p class="empty">No stats yet.</p>` : ""}
      </section>
      ${c?.awards?.length ? `<section class="card"><h2>Awards</h2><ul class="awards">${c.awards.map((a) => `<li><b>${esc(a.name)}</b><span class="muted">${a.seasons.map(esc).join(", ")}</span></li>`).join("")}</ul></section>` : ""}
    </div>
    <div class="tab-panel" data-panel="moves" hidden>
      ${contractCard(ctx, p)}
      ${contracts}
      <section class="card"><h2>Trades, waivers &amp; call-ups</h2>${moves.length ? moves.map((m) => `<div class="tx-row"><span class="pill tx-${m.kind}">${esc(TX_LABEL[m.kind] ?? "Move")}</span><div>${esc(m.text)}<div class="muted small">${esc(fmtDate(m.sort, { month: "short", day: "numeric", year: "numeric" }))}${m.team && ctx.T[m.team] ? ` · ${esc(ctx.T[m.team].name)}` : ""}</div></div></div>`).join("") : `<p class="empty">No transactions on record.</p>`}</section>
    </div>
  </div><aside class="side">
    ${rankCard(ctx, p, t)}
    ${recordsCard(ctx, p)}
    <section class="card"><h2>Bio</h2><dl class="facts">${facts.map(([k, v, html]) => `<dt>${k}</dt><dd>${html ?? esc(v)}</dd>`).join("")}</dl></section>
    ${inj ? `<section class="card card-warn"><h2>Injury</h2><p><span class="pill ${injClass(inj.status)}">${esc(inj.status)}</span> <span class="muted small">updated ${esc(fmtDate(inj.date.slice(0, 10), { month: "short", day: "numeric" }))}</span></p><p class="small">${esc(inj.long || inj.short)}</p><p class="muted small">Source: ESPN injury report.</p></section>` : ""}
    ${t ? `<section class="card"><h2>Current deployment ${L ? stage("actual") : ""}</h2>
      ${where.length ? where.map((w) => `<div class="combo"><div class="slot">${w.k}</div><div class="combo-main"><div class="names">${w.c.ids.map((id) => pname(ctx, id, L.players, { cls: id === p.id ? "is-me" : "" })).join("")}</div><div class="meta">${onIce(w.c)}</div></div><div class="toi">${mmss(w.c.sec)}</div></div>`).join("")
        : goalie ? goalieNote(t, p.id)
        : `<p class="empty">${L ? (scratched ? "Didn't dress in the last game." : `Not in a regular unit last game.`) : "No recent shift data."}</p>`}
      ${L ? `<p class="muted small">Last game: ${esc(fmtDate(L.date))} ${L.home ? "vs" : "@"} ${esc(L.opp)}. <a href="${teamUrl(t)}">Full lineup →</a></p>` : ""}</section>` : ""}
    ${alum && !ctx.posts.some((x) => x.parsed.players.includes(p.id)) ? "" : `<section class="card"><h2>News</h2>${ctx.posts.filter((x) => x.parsed.players.includes(p.id)).slice(0, 5).map((x) => newsItem(ctx, x, { compact: true })).join("") || `<p class="empty">No recent posts.</p>`}</section>`}
  </aside></div>`;
  return page({
    site: ctx.site, title: alum ? `${p.first} ${p.last}: NHL career stats${p.yrs ? ` (${p.yrs})` : ""}` : `${p.first} ${p.last}: stats, timeline, contract & line`,
    description: `${p.first} ${p.last} career timeline: teams before the NHL, draft, signings, trades, injuries, career stats${t ? ` and current line with the ${t.name}` : ""}.`,
    path: playerUrl(p.id), active: "/nhl/", body,
  });
}

// ---------- injuries & scratches ----------
export function injuriesPage(ctx) {
  const teams = Object.values(ctx.T).sort((a, b) => a.name.localeCompare(b.name));
  const all = ctx.injuries;
  const count = (re) => all.filter((i) => re.test(i.status)).length;
  const body = `<h1>Injuries &amp; scratches</h1>
  <p class="lede">Every NHL injury from the league-wide report, plus the healthy players who sat out each team's last game. Players not on the ice last game who aren't on the injury report are listed as scratches.</p>
  <div class="statbox slim"><div><span>Injured</span><b>${all.length}</b></div><div><span>Injured reserve</span><b>${count(/reserve/i)}</b></div><div><span>Day-to-day</span><b>${count(/day/i)}</b></div><div><span>Scratched last game</span><b>${Object.values(ctx.scratches).flat().filter((s) => !s.injury).length}</b></div></div>
  <div class="filters"><select class="team-jump" aria-label="Jump to team" onchange="location.hash=this.value"><option value="">Jump to team</option>${teams.map((t) => `<option value="${t.abbrev}">${esc(t.name)}</option>`).join("")}</select></div>
  <div class="inj-grid">${teams.map((t) => {
    const inj = ctx.injByTeam[t.abbrev] ?? [], scr = (ctx.scratches[t.abbrev] ?? []).filter((s) => !s.injury);
    return `<section class="card" id="${t.abbrev}"><h2><a href="${teamUrl(t)}">${logo(t, 22)} ${esc(t.name)}</a> <span class="muted small">${inj.length} injured</span></h2>
      ${inj.map((i) => `<div class="inj-row"><span class="pill ${injClass(i.status)}">${esc(INJ_SHORT[i.status] ?? i.status)}</span><div><b>${plink(ctx, i.id, i.name)}</b> <span class="muted small">${esc(i.pos)}${i.body ? ` · ${esc(i.body)}` : ""} · ${esc(fmtDate(i.date.slice(0, 10), { month: "short", day: "numeric" }))}</span><div class="muted small">${esc(i.short)}</div></div></div>`).join("") || `<p class="empty">No injuries reported.</p>`}
      ${scr.length ? `<h3>Scratched last game${t.last ? ` (${esc(fmtDate(t.last.date, { month: "short", day: "numeric" }))} ${t.last.home ? "vs" : "@"} ${esc(t.last.opp)})` : ""}</h3><p class="small">${scr.map((s) => `${plink(ctx, s.id, `${s.first} ${s.last}`)} <span class="muted">${esc(s.pos)}</span>`).join(" · ")}</p>` : ""}
    </section>`;
  }).join("")}</div>
  <p class="muted small">Injury data: ESPN's public injury report, refreshed every build. Scratches: worked out from each team's roster vs. who dressed in their last game.</p>`;
  return page({ site: ctx.site, title: "NHL injuries & scratches", description: "Every NHL injury and healthy scratch by team: injured reserve, day-to-day, and who sat out last game.", path: "/injuries/", active: "/injuries/", body });
}

// ---------- transactions ----------
export function movesPage(ctx) {
  const cut = new Date(Date.parse(ctx.site.builtAt) - 120 * 864e5).toISOString().slice(0, 10);
  const list = ctx.tx.filter((t) => t.date >= cut);
  const teams = Object.values(ctx.T).sort((a, b) => a.name.localeCompare(b.name));
  const kinds = ["trade", "sign", "waivers", "recall", "assign", "injury", "return"];
  const body = `<h1>Trades, signings &amp; moves</h1>
  <p class="lede">Every NHL transaction from the last four months: trades, contract signings and extensions, waiver claims, call-ups and injured-reserve moves. Player names link to full career timelines.</p>
  <div class="filters" data-filter-target="#feed">
    <div class="chips"><button class="chip on" data-type="all">All</button>${kinds.map((k) => `<button class="chip" data-type="${k}">${TX_LABEL[k]}${k === "trade" || k === "sign" || k === "waivers" ? "s" : ""}</button>`).join("")}</div>
    <select class="team-filter" aria-label="Filter by team"><option value="">All teams</option>${teams.map((t) => `<option value="${t.abbrev}">${esc(t.name)}</option>`).join("")}</select>
  </div>
  <div id="feed" class="feed card">${list.map((m) => { const t = ctx.T[m.team]; return `<div class="post tx-row" data-type="${m.kind}" data-team="${attr(m.team)}"><span class="pill tx-${m.kind}">${esc(TX_LABEL[m.kind])}</span><div>${t ? `<a href="${teamUrl(t)}">${logo(t, 18)} <b>${esc(t.common)}</b></a> · ` : ""}${linkNames(ctx, m)}${(m.money ?? []).map(moneyChip).join(" ")}<div class="muted small">${esc(fmtDate(m.date, { weekday: "short", month: "short", day: "numeric" }))}</div></div></div>`; }).join("")}</div>
  <p class="muted small">Source: team transaction logs via ESPN, back to 2014 on each player's page.</p>`;
  return page({ site: ctx.site, title: "NHL transactions: trades, signings, waivers", description: "Every NHL trade, contract signing, waiver claim and call-up, filterable by team.", path: "/moves/", active: "/moves/", body });
}
function linkNames(ctx, m) {
  let html = esc(m.text);
  for (const id of m.ids ?? []) {
    const p = ctx.profiles[id]; if (!p) continue;
    const name = esc(`${p.first} ${p.last}`);
    html = html.replace(name, `<a href="${playerUrl(id)}">${name}</a>`);
  }
  return html;
}

// ---------- Stanley Cup predictor ----------
export function cupPage(ctx) {
  const { odds, bracket, R, remaining, sims } = ctx.cup;
  const rows = Object.entries(odds).map(([k, o]) => ({ t: ctx.T[k], ...o })).sort((a, b) => b.cup - a.cup || b.playoffs - a.playoffs);
  const top = rows.slice(0, 10), max = top[0]?.cup || 1;
  const heat = (x) => `style="--h:${Math.min(1, x).toFixed(3)}"`;
  const json = {
    bracket, R, home: 1.045,
    teams: Object.fromEntries(rows.map((r) => [r.t.abbrev, { name: r.t.common, logo: r.t.logo, dark: r.t.logoDark, pts: r.pts }])),
  };
  const body = `<section class="hero cup-hero"><div>
    <p class="eyebrow">Stanley Cup predictor · ${sims.toLocaleString()} simulated seasons</p>
    <h1>Who wins the Cup?</h1>
    <p class="lede">We play out the ${remaining.toLocaleString()} remaining games ${sims.toLocaleString()} times, seed the playoffs with the real NHL format, and play every series. Updated every build.</p>
  </div></section>
  <div class="layout"><div>
    <section class="card"><h2>Cup favourites</h2>
      ${top.map((r) => `<a class="odds-bar" href="${teamUrl(r.t)}">${logo(r.t, 26)}<span class="ob-name">${esc(r.t.common)}</span><span class="ob-track"><span style="width:${(r.cup / max) * 100}%"></span></span><b>${P100(r.cup, 1)}</b></a>`).join("")}
    </section>
    <section class="card"><h2>Every team</h2><div class="table-wrap"><table class="tbl sortable compact odds-tbl"><thead><tr><th>Team</th><th class="n">Proj. pts</th><th class="n">Range</th><th class="n">Playoffs</th><th class="n">Win div.</th><th class="n">Round 2</th><th class="n">Conf. final</th><th class="n">Final</th><th class="n">Cup</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td><a class="team-cell" href="${teamUrl(r.t)}">${logo(r.t, 20)}<span>${esc(r.t.common)}</span></a></td><td class="n"><b>${r.pts}</b></td><td class="n muted">${r.lo}–${r.hi}</td>${[r.playoffs, r.div, r.r2, r.cf, r.final].map((x) => `<td class="n heat" ${heat(x)}>${P100(x)}</td>`).join("")}<td class="n heat" ${heat(r.cup * 3)}><b>${P100(r.cup, 1)}</b></td></tr>`).join("")}
    </tbody></table></div><p class="muted small">Range: 10th to 90th percentile of simulated final points.</p></section>
    <section class="card" id="build"><h2>Make your bracket <span class="muted small">projected matchups · tap a team to advance it</span></h2>
      <div id="bracket" class="bracket"><p class="empty">Loading bracket…</p></div></section>
  </div><aside class="side">
    <section class="card"><h2>How it works</h2><ol class="prose small">
      <li><b>Rate every team.</b> Goals for and against per game, blended with last season (regressed 60% to average) so 15 games don't overrule 82. The blend shifts toward this season as games are played.</li>
      <li><b>Allow for doubt.</b> Each simulated season nudges every rating up or down a little, because nobody knows a team's true strength.</li>
      <li><b>Play the games.</b> Goals for each team are drawn from that matchup's expected scoring, with home ice worth about 4.5%. Ties go to overtime or a shootout.</li>
      <li><b>Seed and play the playoffs.</b> Top three per division plus two wild cards, best-of-seven with 2-2-1-1-1 home ice.</li>
    </ol></section>
    <section class="card"><h2>On the bubble</h2><p class="small muted">Teams with 30–75% playoff odds:</p><ul class="mini-list">${rows.filter((r) => r.playoffs > 0.3 && r.playoffs < 0.75).sort((a, b) => b.playoffs - a.playoffs).map((r) => `<li><a href="${teamUrl(r.t)}">${esc(r.t.common)}</a><span class="muted">${r.pts} pts</span><b>${P100(r.playoffs)}</b></li>`).join("") || `<li class="muted">None right now.</li>`}</ul></section>
  </aside></div>`;
  return page({ site: ctx.site, title: "Stanley Cup predictor & playoff odds", description: "NHL playoff odds and Stanley Cup chances for every team from 10,000 simulated seasons, plus a bracket builder.", path: "/cup/", active: "/cup/", body, json, scripts: ["/assets/bracket.js"] });
}

// ---------- homepage ----------
export function homePage2(ctx) {
  const { league, T } = ctx;
  const { games, dayLabel, cards } = homeCards(ctx);
  const strip = games.map((g) => {
    const live = ["LIVE", "CRIT"].includes(g.gameState), fin = ["OFF", "FINAL"].includes(g.gameState);
    const row = (tm) => `<span class="ss-team">${logo(T[tm.abbrev], 20)}<b>${esc(tm.abbrev)}</b>${live || fin ? `<em>${tm.score ?? 0}</em>` : ""}</span>`;
    return `<a class="ss-game${live ? " is-live" : ""}" href="/game/${g.id}/">${row(g.awayTeam)}${row(g.homeTeam)}<span class="ss-st">${live ? `<span class="live-dot">${g.period ? `P${g.period}` : "Live"}</span>` : fin ? "Final" : localTime(g.startTimeUTC)}</span></a>`;
  }).join("");
  const odds = Object.entries(ctx.cup.odds).sort((a, b) => b[1].cup - a[1].cup).slice(0, 6);
  const omax = odds[0]?.[1].cup || 1;
  const fav = odds[0] ? T[odds[0][0]] : null;
  const wjcDays = Math.ceil((Date.parse("2026-12-26T19:00:00Z") - Date.parse(ctx.site.builtAt)) / 864e5);
  const lead = ctx.leaders.skaters.points?.slice(0, 5) ?? [];
  const recentMoves = ctx.tx.filter((m) => ["trade", "sign", "waivers"].includes(m.kind)).slice(0, 6);
  const tiles = [
    ["/goalies/", "Starting goalies", `${games.length * 2} starters tracked`, "g"],
    ["/injuries/", "Injuries", `${ctx.injuries.length} players out`, "i"],
    ["/predictions/", "Predictions", "Win chances for every game, live", "c"],
    ["/cup/", "Cup odds", fav ? `${fav.common} lead at ${P100(odds[0][1].cup, 1)}` : "10,000 sims", "c"],
    ["/wjc/", "World Juniors", wjcDays > 0 ? `${wjcDays} days · projected lines` : "Live now", "w"],
    ["/moves/", "Trades & signings", `${ctx.tx.filter((m) => m.date >= ctx.site.builtAt.slice(0, 10).replace(/\d\d$/, "01")).length} moves this month`, "m"],
    ["/prospects/", "Prospects", "Rankings & pipelines", "p"],
  ];
  const ICON = {
    g: '<path d="M4 4h16v10a8 8 0 0 1-16 0z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 8h8" stroke="currentColor" stroke-width="2"/>',
    i: '<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" fill="currentColor"/>',
    c: '<path d="M6 3h12v4a6 6 0 0 1-12 0zM9 17h6l1 4H8z M12 13v4" fill="none" stroke="currentColor" stroke-width="2"/>',
    w: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/>',
    m: '<path d="M4 8h13l-3-3M20 16H7l3 3" fill="none" stroke="currentColor" stroke-width="2"/>',
    p: '<path d="M12 3l2.6 5.6 6 .7-4.5 4 1.3 6L12 16.4 6.6 19.3l1.3-6-4.5-4 6-.7z" fill="none" stroke="currentColor" stroke-width="2"/>',
  };
  const body = `
  ${strip ? `<div class="score-strip" aria-label="Today's scores">${strip}</div>` : ""}
  <section class="home-hero">
    <div class="hh-main">
      <p class="eyebrow">${esc(fmtDate(league.today, { weekday: "long", month: "long", day: "numeric" }))}</p>
      <h1>${esc(dayLabel)}: ${games.length} game${games.length === 1 ? "" : "s"}</h1>
      <p class="lede">Lines from real ice time, starting goalies, injuries, every trade and signing, and Cup odds, all updated through the day.</p>
      <button class="hh-search" type="button" data-open-search><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m20 20-4-4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg><span>Search ${(ctx.profileCount ?? Object.keys(ctx.profiles).length).toLocaleString("en-US")} players, from Gretzky to today</span><kbd>/</kbd></button>
      <div class="stage-flow">${stage("projected")}<i></i>${stage("reported")}<i></i>${stage("confirmed")}<i></i>${stage("actual")}</div>
    </div>
    <div class="hh-tiles">${tiles.map(([href, title, sub, ic]) => `<a class="tile" href="${href}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">${ICON[ic]}</svg><b>${esc(title)}</b><span>${esc(sub)}</span></a>`).join("")}</div>
  </section>
  <div class="layout">
    <div><h2 class="section-h">Tonight's lineups</h2><div class="games">${cards || `<p class="empty">No games on the schedule.</p>`}</div></div>
    <aside class="side">
      <section class="card"><h2>Stanley Cup odds</h2>${odds.map(([k, o]) => `<a class="odds-bar sm" href="${teamUrl(T[k])}">${logo(T[k], 20)}<span class="ob-name">${esc(T[k].common)}</span><span class="ob-track"><span style="width:${(o.cup / omax) * 100}%"></span></span><b>${P100(o.cup, 1)}</b></a>`).join("")}<a class="more" href="/cup/">All 32 teams + bracket →</a></section>
      <section class="card"><h2>Latest injuries</h2>${ctx.injuries.slice(0, 5).map((i) => `<div class="inj-row"><span class="pill ${injClass(i.status)}">${esc(INJ_SHORT[i.status] ?? i.status)}</span><div><b>${plink(ctx, i.id, i.name)}</b> <span class="muted small">${esc(i.team)}${i.body ? ` · ${esc(i.body)}` : ""}</span></div></div>`).join("")}<a class="more" href="/injuries/">All injuries &amp; scratches →</a></section>
      <section class="card"><h2>Trades &amp; signings</h2>${recentMoves.map((m) => `<div class="tx-row"><span class="pill tx-${m.kind}">${esc(TX_LABEL[m.kind])}</span><div><b>${esc(m.team)}</b> · ${linkNames(ctx, m)} ${(m.money ?? []).map(moneyChip).join(" ")}<div class="muted small">${esc(fmtDate(m.date, { month: "short", day: "numeric" }))}</div></div></div>`).join("")}<a class="more" href="/moves/">All moves →</a></section>
      ${wjcDays > 0 ? `<a class="card wjc-promo" href="/wjc/"><span class="eyebrow">World Juniors · Edmonton &amp; Red Deer</span><strong>${wjcDays} days to puck drop</strong><span>Projected lines for all 10 teams →</span></a>` : ""}
      <section class="card"><h2>Latest news</h2>${ctx.posts.filter((p) => p.parsed.type !== "other").slice(0, 4).map((p) => newsItem(ctx, p, { compact: true })).join("") || `<p class="empty">No posts yet.</p>`}<a class="more" href="/news/">All news →</a></section>
      <section class="card"><h2>Points leaders</h2><ol class="mini-list">${lead.map((p) => `<li><a href="${playerUrl(p.id)}">${esc(p.firstName.default[0])}. ${esc(p.lastName.default)}</a><span class="muted">${esc(p.teamAbbrev)}</span><b>${p.value}</b></li>`).join("")}</ol><a class="more" href="/stats/">All stats →</a></section>
    </aside>
  </div>`;
  return page({ site: ctx.site, title: "", description: "NHL line combinations from real ice time, starting goalies, injuries, trades and signings, Stanley Cup odds and World Juniors projections.", path: "/", active: "/", body, scripts: ["/assets/predict.js#module"] });
}

// ---------- records ----------
const MUG = (id) => `https://assets.nhle.com/mugs/nhl/latest/${id}.png`;
const REC_CATS = {
  sk: [["pts", "Points"], ["g", "Goals"], ["a", "Assists"], ["gp", "Games played"], ["pim", "Penalty minutes"], ["ppg", "Power-play goals"], ["gwg", "Game-winning goals"]],
  g: [["w", "Wins"], ["so", "Shutouts"], ["gp", "Games played"]],
};
export function leaderList(ctx, list, k, n = 10, { mugs = true } = {}) {
  const top = [...list].filter((p) => p[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, n);
  const max = top[0]?.[k] || 1;
  return `<ol class="rec-board">${top.map((p, i) => {
    const name = p.name ?? `${p.first} ${p.last}`;
    const link = `<a href="${anyPlayerUrl(ctx, p.id, name)}">${esc(name)}</a>`;
    return `<li${i < 3 ? ` class="podium p${i + 1}"` : ""}><span class="rb-rank">${i + 1}</span>${mugs ? `<img class="rb-shot" src="${MUG(p.id)}" alt="" width="34" height="34" loading="lazy" onerror="this.onerror=null;this.src='https://assets.nhle.com/mugs/nhl/default-skater.png'">` : ""}<span class="rb-name">${link}${ctx.profiles[p.id]?.yrs ? `<small>${esc(ctx.profiles[p.id].yrs)}</small>` : ""}</span><span class="rb-bar"><span style="width:${((p[k] / max) * 100).toFixed(1)}%"></span></span><b class="rb-val">${p[k].toLocaleString("en-US")}</b></li>`;
  }).join("")}</ol>`;
}
export function recordsPage(ctx) {
  const { allSk, allG, franchise } = ctx.records;
  const activeIds = new Set([...ctx.stats.skaters, ...ctx.stats.goalies].map((x) => x.playerId));
  const board = (list, cats, n, opts) => `<div class="rec-grid">${cats.map(([k, label]) => `<section class="card"><h2>${label}</h2>${leaderList(ctx, list, k, n, opts)}</section>`).join("")}</div>`;
  const teams = Object.values(ctx.T).sort((a, b) => a.name.localeCompare(b.name));
  const body = `<section class="hero"><div><p class="eyebrow">Regular season · 1917 to today</p><h1>NHL records</h1>
    <p class="lede">All-time leaders across ${(allSk.length + allG.length).toLocaleString("en-US")} players, the active leaders still adding to their totals, and every franchise's record book. Updated every build.</p></div></section>
  <div class="tabs"><button class="tab on" data-tab="all">All-time</button><button class="tab" data-tab="active">Active players</button><button class="tab" data-tab="fr">Franchise records</button></div>
  <div class="tab-panel" data-panel="all"><h2 class="section-h">Skaters</h2>${board(allSk, REC_CATS.sk, 15)}<h2 class="section-h">Goalies</h2>${board(allG, REC_CATS.g, 15)}</div>
  <div class="tab-panel" data-panel="active" hidden><h2 class="section-h">Active skaters</h2>${board(allSk.filter((p) => activeIds.has(p.id)), REC_CATS.sk, 15)}<h2 class="section-h">Active goalies</h2>${board(allG.filter((p) => activeIds.has(p.id)), REC_CATS.g, 15)}</div>
  <div class="tab-panel" data-panel="fr" hidden>
    <div class="filters"><select class="team-jump" aria-label="Choose a franchise" onchange="document.querySelectorAll('.fr-panel').forEach(function(p){p.hidden=p.dataset.t!==this.value},this);location.hash='fr-'+this.value">${teams.map((t) => `<option value="${t.abbrev}">${esc(t.name)}</option>`).join("")}</select></div>
    ${teams.map((t, i) => { const f = franchise[t.abbrev]; return f ? `<div class="fr-panel" data-t="${t.abbrev}" id="fr-${t.abbrev}"${i ? " hidden" : ""}><h2 class="section-h">${logo(t, 28)} ${esc(t.name)} record book</h2>${board(f.skaters, REC_CATS.sk.slice(0, 4), 10, { mugs: true })}${board(f.goalies, REC_CATS.g, 10)}</div>` : ""; }).join("")}
  </div>
  <script>addEventListener("DOMContentLoaded",function(){var m=location.hash.match(/^#fr-([A-Z]{3})$/);if(!m)return;var b=document.querySelector('[data-tab="fr"]');b&&b.click();var s=document.querySelector('.tab-panel[data-panel="fr"] select');if(s){s.value=m[1];s.onchange();}});</script>
  <p class="muted small">Source: NHL stats API, regular-season totals. Franchise totals include a team's earlier cities (Quebec for Colorado, Hartford for Carolina, and so on).</p>`;
  return page({ site: ctx.site, title: "NHL records: all-time, active and franchise leaders", description: "All-time NHL leaders in points, goals, assists, games, wins and shutouts, active leaders, and the record book for all 32 franchises.", path: "/records/", active: "/stats/", body });
}

// ---------- live profile viewer (any player without a static page) ----------
export function viewerPage(ctx) {
  const body = `<div id="pv" data-live-api="${attr(ctx.site.liveApi ?? "")}"><section class="hero"><div><h1>Loading player…</h1></div></section></div>`;
  return page({ site: ctx.site, title: "Player", description: "Player profile, bio and career stats.", path: "/player/", active: "/nhl/", body, scripts: ["/assets/player.js"] });
}
