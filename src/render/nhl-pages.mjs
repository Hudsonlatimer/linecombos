import { teamExtras } from "./more-pages.mjs";
import { wpBlock, gamePredictCard } from "./predict-pages.mjs";
import { nationFromHome, country, flag as flagOf } from "./geo.mjs";
import { teamStatsCard } from "./teamstats-pages.mjs";
import { esc, attr, h, mmss, pct, signed, fmtDate, localTime, ago, stage, pill, page } from "./html.mjs";

// ---------- shared bits ----------
export const logo = (t, size = 28) => t?.logo ? `<img class="logo" src="${attr(t.logo)}" data-dark="${attr(t.logoDark ?? t.logo)}" alt="" width="${size}" height="${size}" loading="lazy">` : "";
const teamUrl = (t) => `/nhl/${t.slug}/`;
const playerUrl = (id) => `/players/${id}/`;
/** Our static page when we built one, otherwise the live profile viewer. Every player name is a link. */
export const anyPlayerUrl = (ctx, id, name = "") => (ctx.profiles?.[id] || ctx.people?.[id] ? playerUrl(id) : `/player/?id=${id}${name ? `&n=${encodeURIComponent(name)}` : ""}`);

export function pname(ctx, id, players, { link = true, cls = "" } = {}) {
  const p = players?.[id] ?? ctx.people[id];
  const nm = p?.name ?? (p ? `${p.first?.[0] ?? ""}. ${p.last}` : "?");
  const num = p?.num ?? "";
  const inner = `<span class="num">${esc(num)}</span>${esc(nm)}`;
  return link && id ? `<a class="pl ${cls}" href="${anyPlayerUrl(ctx, id)}">${inner}</a>` : `<span class="pl ${cls}">${inner}</span>`;
}

export function onIce(c) {
  if (c.sf == null) return "";
  const gd = c.gf - c.ga;
  return `<span class="oi" title="On ice together: shots for–against, goals for–against">SF ${c.sf}–${c.sa} · GF ${c.gf}–${c.ga}${gd ? ` <b class="${gd > 0 ? "up" : "down"}">${signed(gd)}</b>` : ""}</span>`;
}

const DEFAULT_SHOT = "https://assets.nhle.com/mugs/nhl/default-skater.png";

/** One player tile in a line: headshot, number, name and a stat line. */
export function playerCard({ id, name, num, shot, stats, href, cls = "", statTip = "This season: goals, assists, points, plus/minus" }) {
  const statLine = stats ? `<span class="up-stats"${statTip ? ` title="${attr(statTip)}"` : ""}>${stats.map(([k, v, c]) => `<span${c ? ` class="${c}"` : ""}><b>${esc(v)}</b>${k}</span>`).join("")}</span>` : "";
  const tag = href ? "a" : "div";
  return `<${tag} class="up-card ${cls}"${href ? ` href="${attr(href)}"` : ""} data-pid="${attr(id)}">
    <img class="up-shot" src="${attr(shot || DEFAULT_SHOT)}" alt="" width="52" height="52" loading="lazy" onerror="this.onerror=null;this.src='${DEFAULT_SHOT}'">
    <span class="up-name">${num != null && num !== "" ? `<i>${esc(num)}</i>` : ""}${esc(name)}</span>${statLine}</${tag}>`;
}

const seasonStats = (ctx, id) => {
  ctx._sk ??= Object.fromEntries((ctx.stats?.skaters ?? []).map((s) => [s.playerId, s]));
  const s = ctx._sk[id];
  return s ? [["G", s.goals], ["A", s.assists], ["P", s.points], ["", signed(s.plusMinus), s.plusMinus > 0 ? "up" : s.plusMinus < 0 ? "down" : ""]] : [["G", 0], ["A", 0], ["P", 0], ["", "0"]];
};

export function comboRows(ctx, combos, labels, players, { flags = [], newIds = [] } = {}) {
  if (!combos?.length) return `<p class="empty">No data yet.</p>`;
  const max = Math.max(...combos.map((c) => c.sec ?? 0), 1);
  return combos.map((c, i) => `
    <div class="unit">
      <div class="unit-head"><span class="slot">${esc(labels[i] ?? (labels[0] ? labels[0].replace(/\d+$/, i + 1) : ""))}</span>
        ${c.sec != null ? `<span class="bar"><span style="width:${Math.max(4, (c.sec / max) * 100).toFixed(1)}%"></span></span><span class="toi" title="Time these players were on the ice together at 5-on-5">${mmss(c.sec)} <small>together</small></span>` : `<span class="unit-sp"></span>`}</div>
      <div class="unit-players n${c.ids.length}">${c.ids.map((id) => {
        if (String(id).startsWith("name:")) { const [nm, num] = String(id).slice(5).split("|"); return playerCard({ id: "", name: nm, num }); } // from a source, not in our NHL data
        const p = players?.[id] ?? ctx.people[id], prof = ctx.people[id] ?? ctx.profiles?.[id];
        const name = p?.name ?? (p ? `${p.first?.[0] ?? ""}. ${p.last}` : "?");
        return playerCard({ id, name, num: p?.num ?? prof?.num, shot: prof?.headshot, stats: seasonStats(ctx, id), href: anyPlayerUrl(ctx, id), cls: newIds.includes(id) ? "is-new" : "" });
      }).join("")}</div>
      <div class="meta">${flags[i] ? pill("New combo", "new") : ""}${c.shared ? pill("Double-shift", "muted") : ""}${onIce(c)}</div>
    </div>`).join("");
}

export function newsItem(ctx, p, { compact = false } = {}) {
  const t = ctx.T[p.parsed.team];
  const typeLabel = { lines: "Lines", goalie: "Goalie", injury: "Injury", roster: "Roster", news: "News", other: "Post" }[p.parsed.type];
  const text = p.text.length > 280 ? p.text.slice(0, 277) + "…" : p.text;
  const linesBlock = p.parsed.type === "lines" && !compact ? `<div class="post-lines">${[...p.parsed.lines.map((l) => ["F", l]), ...p.parsed.pairs.map((l) => ["D", l])]
    .map(([k, l]) => `<div><span class="slot">${k}</span>${l.map((id) => pname(ctx, id, null)).join('<span class="dash">–</span>')}</div>`).join("")}</div>` : "";
  return `<article class="post post-${p.parsed.type}" data-type="${p.parsed.type}" data-team="${attr(p.parsed.team ?? "")}">
    <div class="post-head">${pill(typeLabel, "t-" + p.parsed.type)}${t ? `<a class="post-team" href="${teamUrl(t)}">${logo(t, 18)}${esc(t.abbrev)}</a>` : ""}
      <span class="post-by">${esc(p.author)} <span class="muted">· ${p.src === "x" ? "X" : "Bluesky"}</span></span>
      <span class="post-time">${ago(p.createdAt)}</span></div>
    <p class="post-text">${esc(text).replace(/\n/g, "<br>")}</p>
    ${linesBlock}
    ${p.url ? `<a class="post-link" href="${attr(p.url)}" rel="nofollow noopener" target="_blank">View source post →</a>` : ""}
  </article>`;
}

// ---------- Sources: every projected / reported item says where it came from ----------
const gameRef = (g) => g ? `<a href="/game/${g.id ?? g.gameId}/">${esc(fmtDate(g.date, { month: "short", day: "numeric" }))} ${g.home ? "vs" : "@"} ${esc(g.opp)}</a>` : "";
const reporter = (r) => `<a href="${attr(r.url)}" target="_blank" rel="nofollow noopener">${esc(r.author)}</a>${r.createdAt ? ` · ${ago(r.createdAt)}` : ""}`;
/** Where tonight's lines come from: a reporter's post, or our projection from the last game's NHL shift chart. */
export function linesSource(ctx, t, rep) {
  if (t?.live) return `Source: NHL shift chart for this game, as of the last update (about 10 game minutes behind). <a href="/game/${t.live.gameId}/">Gamecenter</a>`;
  const L = rep?.lines;
  const STAT = { dtd: "day-to-day", ir: "injured reserve", out: "out" };
  const outNote = L?.out?.length ? ` Not in the lineup (hurt): ${L.out.map((o) => `${o.id ? `<a href="/players/${o.id}/">${esc(o.name)}</a>` : esc(o.name)} (${esc(STAT[o.status] ?? o.status)})`).join(", ")}.` : "";
  const when = (r) => (r.createdAt ? ` Updated ${ago(r.createdAt)}.` : "");
  if (L?.kind === "lastgame") return `Source: the <a href="${attr(L.url)}" target="_blank" rel="nofollow noopener">last game's lineup (${esc(fmtDate(L.lastGame, { month: "short", day: "numeric" }))})</a>. Projected: no reporter has posted lines since.${when(L)}${outNote}`;
  if (L?.kind === "projection") return `Source: <a href="${attr(L.url)}" target="_blank" rel="nofollow noopener">Daily Faceoff projection</a> (no reporter post). Projected.${when(L)}${outNote}`;
  if (L) return `Source: ${reporter(L)}${L.stale ? ". Projected: their latest lines, posted before the last game." : ""}${outNote}`;
  if (t?.last) return `Source: NHL shift chart, ${gameRef(t.last)}. Projected: same lines as that game.`;
  return "Source: none yet. The NHL posts shift charts a few hours after each game.";
}
/** Where the goalie pick comes from: a reporter's post, or our rule applied to NHL box scores. */
export function goalieSource(ctx, t, rep) {
  if (t?.live?.goalie) return `Source: NHL box score for this game, in progress. <a href="/game/${t.live.gameId}/">Gamecenter</a>`;
  if (rep?.goalie?.parsed.goalie) return `Source: ${reporter(rep.goalie)}`;
  const g = t?.goalies; if (!g?.projected) return "Source: no starts in NHL box scores yet.";
  if (g.reason === "likely" && g.likely) return `Source: ${reporter(g.likely)}. Projected: reported as the likely starter, not yet confirmed.`;
  const st = g.starts.find((x) => x.id === g.projected);
  const share = st ? ` · ${st.starts} of last ${g.window} starts` : "";
  return g.reason === "b2b"
    ? `Source: NHL box scores. Projected: backup on the 2nd night of a back-to-back (starter played ${gameRef(g.lastGame)})${share}.`
    : `Source: NHL box score, ${gameRef(g.lastGame)}. Projected: last game's starter${share}.`;
}
const srcNote = (html) => `<p class="src-note">${html}</p>`;

function goalieLine(ctx, t, reported) {
  if (!t) return "";
  const g = t.goalies;
  if (t.live?.goalie) return `<div class="g-line">${pname(ctx, t.live.goalie, t.live.players)} ${stage("confirmed")} <span class="muted small">in net now</span></div>`;
  if (reported?.goalie?.parsed.goalie) {
    const id = reported.goalie.parsed.goalie;
    return `<div class="g-line">${pname(ctx, id, null)} ${stage("confirmed")}</div>`;
  }
  const id = g.projected;
  if (!id) return `<div class="g-line muted">No starts yet</div>`;
  const nm = g.starts.find((x) => x.id === id)?.name ?? ctx.people[id]?.name;
  const why = g.reason === "likely" ? "reported likely" : t.next?.b2b && id !== g.lastStarter ? "2nd of back-to-back" : id === g.lastStarter ? "started last game" : "";
  return `<div class="g-line">${ctx.people[id] ? `<a class="pl" href="${playerUrl(id)}">${esc(nm)}</a>` : esc(nm)} ${stage("projected")} <span class="muted small">${esc(why)}</span></div>`;
}

function stageFor(ctx, t, rep) {
  if (t.live) return "live";
  if (rep?.lines && !rep.lines.stale) return "reported";
  return "projected";
}

// ---------- Tonight ----------
export function homeCards(ctx) {
  const { league, T } = ctx;
  let games = league.todayGames, dayLabel = "Tonight";
  if (!games.length) {
    const nextDay = league.week.gameWeek.find((d) => d.games.length && d.date > league.today);
    games = nextDay?.games ?? [];
    dayLabel = nextDay ? fmtDate(nextDay.date, { weekday: "long", month: "short", day: "numeric" }) : "No games scheduled";
  }
  const cards = games.map((g) => {
    const away = T[g.awayTeam.abbrev], home = T[g.homeTeam.abbrev];
    const live = ["LIVE", "CRIT"].includes(g.gameState), fin = ["OFF", "FINAL"].includes(g.gameState);
    const status = live ? `<span class="live-dot">Live</span> ${g.awayTeam.score}–${g.homeTeam.score}${g.period ? ` · P${g.period}` : ""}`
      : fin ? `Final ${g.awayTeam.score}–${g.homeTeam.score}${g.gameOutcome?.lastPeriodType && g.gameOutcome.lastPeriodType !== "REG" ? ` (${g.gameOutcome.lastPeriodType})` : ""}`
      : localTime(g.startTimeUTC);
    const side = (t, abbr) => {
      const rep = ctx.reported[abbr];
      return `<div class="gc-team">
        <a class="gc-name" href="${t ? teamUrl(t) : "#"}">${logo(t, 36)}<span><b>${esc(t?.common ?? abbr)}</b><small>${esc(t?.record ?? "")}</small></span></a>
        <div class="gc-row"><span class="k">Lines</span>${stage(fin ? "actual" : stageFor(ctx, t, rep))}</div>
        ${fin ? "" : srcNote(linesSource(ctx, t, rep))}
        <div class="gc-row"><span class="k">Goalie</span>${goalieLine(ctx, t, rep)}</div>
        ${fin ? "" : srcNote(goalieSource(ctx, t, rep))}
        ${t?.next?.b2b && t.next.id === g.id ? `<div class="gc-row">${pill("Back-to-back", "warn")}</div>` : ""}
      </div>`;
    };
    return `<section class="card game-card" data-teams="${attr(g.awayTeam.abbrev)},${attr(g.homeTeam.abbrev)}">
      <div class="gc-status">${status}<a class="btn-sm" href="/game/${g.id}/">Gamecenter</a></div>
      ${wpBlock(ctx, g)}
      <div class="gc-teams">${side(away, g.awayTeam.abbrev)}<div class="gc-at">@</div>${side(home, g.homeTeam.abbrev)}</div>
    </section>`;
  }).join("");
  return { games, dayLabel, cards };
}

export function homePage(ctx) {
  const { league } = ctx;
  const { games, dayLabel, cards } = homeCards(ctx);
  const wjcDays = Math.ceil((Date.parse("2026-12-26T19:00:00Z") - Date.parse(ctx.site.builtAt)) / 864e5);
  const lead = ctx.leaders.skaters.points?.slice(0, 5) ?? [];
  const body = h`
  <section class="hero">
    <div>
      <p class="eyebrow">${esc(fmtDate(league.today, { weekday: "long", month: "long", day: "numeric" }))}</p>
      <h1>${esc(dayLabel)}: ${games.length} game${games.length === 1 ? "" : "s"}</h1>
      <p class="lede">Every lineup tracked from rumour to final ice time. ${stage("projected")} → ${stage("reported")} → ${stage("confirmed")} → ${stage("actual")}</p>
    </div>
  </section>
  <div class="layout">
    <div class="games">${cards || `<p class="empty">No games on the schedule.</p>`}</div>
    <aside class="side">
      ${wjcDays > 0 ? `<a class="card wjc-promo" href="/wjc/"><span class="eyebrow">World Juniors · Edmonton & Red Deer</span><strong>${wjcDays} days to puck drop</strong><span>Projected lines for all 10 teams →</span></a>` : ""}
      <section class="card"><h2>Latest news</h2>${ctx.posts.filter((p) => p.parsed.type !== "other").slice(0, 6).map((p) => newsItem(ctx, p, { compact: true })).join("") || `<p class="empty">No posts yet.</p>`}<a class="more" href="/news/">All news →</a></section>
      <section class="card"><h2>Points leaders</h2><ol class="mini-list">${lead.map((p) => `<li><a href="${playerUrl(p.id)}">${esc(p.firstName.default[0])}. ${esc(p.lastName.default)}</a><span class="muted">${esc(p.teamAbbrev)}</span><b>${p.value}</b></li>`).join("")}</ol><a class="more" href="/stats/">All stats →</a></section>
    </aside>
  </div>`;
  return page({ site: ctx.site, title: "", description: "NHL line combinations from real ice time, starting goalies, lineup news, stats and World Juniors projections.", path: "/", active: "/", body });
}

// ---------- Teams index ----------
export function teamsIndex(ctx) {
  const P100 = (x) => (x == null ? "" : x >= 0.995 ? ">99%" : x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);
  const confs = {};
  for (const t of Object.values(ctx.T)) ((confs[t.conf] ??= {})[t.div] ??= []).push(t);
  const maxPts = Math.max(...Object.values(ctx.T).map((t) => t.pts), 1);
  const tile = (t) => {
    const odds = ctx.cup?.odds?.[t.abbrev];
    const form = [...(t.results ?? [])].reverse().map((x) => { const w = x.us > x.them, o = !w && x.outcome && x.outcome !== "REG"; return `<i class="${w ? "w" : o ? "o" : "l"}" title="${w ? "W" : o ? "OTL" : "L"} ${x.us}–${x.them} ${x.home ? "vs" : "@"} ${x.opp}"></i>`; }).join("");
    const cap = ctx.capTeams?.[t.abbrev];
    return `<a class="team-tile" href="${teamUrl(t)}"${t.accent ? ` style="--tc:${attr(t.accent)}"` : ""}>
      <span class="tt-rank" title="Division rank">${t.divSeq}</span>
      <span class="tt-logo">${logo(t, 44)}</span>
      <span class="tt-name"><small>${esc(t.place)}</small><b>${esc(t.common)}</b></span>
      <span class="tt-pts"><b>${t.pts}</b><small>pts</small></span>
      <span class="tt-bar"><span style="width:${((t.pts / maxPts) * 100).toFixed(1)}%"></span></span>
      <span class="tt-foot"><span class="tt-rec">${esc(t.record)}</span><span class="tt-form" aria-label="Last five games">${form}</span><span class="tt-gd ${t.diff > 0 ? "up" : t.diff < 0 ? "down" : ""}">${t.diff > 0 ? "+" : ""}${t.diff}</span></span>
      <span class="tt-meta">${odds ? `<span>Playoffs <b>${P100(odds.playoffs)}</b></span>` : ""}${cap?.space != null ? `<span>Cap space <b>${(cap.space / 1e6).toFixed(1)}M</b></span>` : ""}</span>
    </a>`;
  };
  const order = ["Eastern", "Western"];
  const body = `<section class="hero"><div><p class="eyebrow">${Object.keys(ctx.T).length} teams · sorted by division standing</p><h1>NHL teams</h1>
    <p class="lede">Lines, D pairs, power play units, goalies, contracts and franchise records for every team. Pick a club.</p></div></section>
  ${Object.entries(confs).sort(([x], [y]) => order.indexOf(x) - order.indexOf(y)).map(([conf, divs]) => `<section class="conf-block"><h2 class="conf-h">${esc(conf)} Conference</h2>
    ${Object.entries(divs).sort().map(([d, ts]) => `<div class="div-block"><h3 class="div-h">${esc(d)}</h3><div class="team-tiles">${ts.sort((x, y) => x.divSeq - y.divSeq).map(tile).join("")}</div></div>`).join("")}
  </section>`).join("")}
  <p class="muted small">Form dots: last five games, oldest first (green win, amber overtime loss, red loss). Bar: points vs. the league leader.</p>`;
  return page({ site: ctx.site, title: "NHL teams", description: "All 32 NHL teams by division: record, form, playoff odds and cap space, with lines and goalies for each.", path: "/nhl/", active: "/nhl/", body });
}

// ---------- Team ----------
export function teamPage(ctx, t) {
  const L = t.last, rep = ctx.reported[t.abbrev];
  const players = L?.players ?? {};
  const newIds = t.changes?.in ?? [];
  const nextG = t.next;
  const teamNews = ctx.posts.filter((p) => p.parsed.team === t.abbrev && p.parsed.type !== "other").slice(0, 8);

  const R = rep?.lines?.parsed;
  const repCard = R ? `<section class="card card-accent">
    <h2>${nextG ? `Lines for ${nextG.home ? "vs" : "@"} ${esc(nextG.opp)}` : "Latest lines"} ${stage(rep.lines.stale ? "projected" : "reported")}</h2>
    ${srcNote(linesSource(ctx, { ...t, live: null }, rep))}
    ${comboRows(ctx, R.lines.map((ids) => ({ ids })), ["L1", "L2", "L3", "L4"], null)}
    ${comboRows(ctx, R.pairs.map((ids) => ({ ids })), ["D1", "D2", "D3"], null)}
    ${R.pp?.length ? `<h3>Power play</h3>${comboRows(ctx, R.pp.map((ids) => ({ ids })), ["PP1", "PP2"], null)}` : ""}
    ${R.pk?.length ? `<h3>Penalty kill</h3>${comboRows(ctx, R.pk.map((ids) => ({ ids })), ["PK1", "PK2"], null)}` : ""}
  </section>` : "";

  const liveCard = t.live ? `<section class="card card-live"><h2>${stage("live")} vs ${esc(t.live.opp)} right now</h2><p>Lines from shift data so far, about 10 game minutes behind. <a class="btn-sm" href="/game/${t.live.gameId}/">Open gamecenter</a></p>
    ${comboRows(ctx, t.live.lines, ["L1", "L2", "L3", "L4"], t.live.players)}</section>` : "";

  const g = t.goalies, gmax = Math.max(1, ...g.starts.map((x) => x.starts));
  const svById = Object.fromEntries(ctx.stats.goalies.map((x) => [x.playerId, x]));
  const goalieCard = `<section class="card"><h2>Goalies <span class="muted small">last ${g.window} GP</span></h2>
    ${g.starts.map((x) => { const s = svById[x.id]; return `<div class="g-row"><span class="g-name"><a href="${anyPlayerUrl(ctx, x.id, x.name)}">${esc(x.name)}</a> ${x.id === g.lastStarter ? pill("Last start", "ok") : ""}${x.id === g.projected && nextG ? pill("Projected next", "info") : ""}</span>
      <span class="bar"><span style="width:${(x.starts / gmax) * 100}%"></span></span><span class="g-n">${x.starts}/${g.window}</span>
      <span class="g-sv muted">${s ? `${pct(s.savePct)} · ${Number(s.goalsAgainstAverage).toFixed(2)}` : ""}</span></div>`; }).join("") || `<p class="empty">No starts yet.</p>`}
    ${nextG ? srcNote(goalieSource(ctx, t, rep)) : ""}
    ${nextG?.b2b ? `<div class="alert"><b>Back-to-back.</b> Next game is the second night; backups often start.</div>` : ""}
    ${rep?.goalie ? `<div class="alert ok">${esc(rep.goalie.author)}: ${esc(rep.goalie.text.slice(0, 140))} <a href="${attr(rep.goalie.url)}" target="_blank" rel="nofollow noopener">source</a></div>` : ""}
  </section>`;

  const c = t.changes;
  const changesCard = c ? `<section class="card"><h2>What changed <span class="muted small">vs ${esc(fmtDate(c.vsDate))} ${esc(c.vsOpp)}</span></h2><ul class="chg">
    ${c.in.map((id) => `<li><span class="k in">In</span>${pname(ctx, id, players)}</li>`).join("")}
    ${c.out.map((p) => `<li><span class="k out">Out</span>${pname(ctx, p.id, { [p.id]: p })}</li>`).join("")}
    ${c.pp1In.length || c.pp1Out.length ? `<li><span class="k pp">PP1</span><span>${c.pp1In.map((id) => pname(ctx, id, players)).join(", ") || "—"} in${c.pp1Out.length ? ` for ${c.pp1Out.map((p) => esc(p.name)).join(", ")}` : ""}</span></li>` : ""}
    <li><span class="k">Lines</span><span>${c.newLines.filter(Boolean).length ? `${c.newLines.filter(Boolean).length} of ${c.newLines.length} forward lines new` : "Forward lines unchanged"} · ${c.newPairs.filter(Boolean).length ? `${c.newPairs.filter(Boolean).length} D pair(s) new` : "D pairs unchanged"}</span></li>
  </ul></section>` : "";

  const sched = `<section class="card"><h2>Schedule</h2>
    <ul class="sched">${t.results.map((x) => `<li><span class="muted">${esc(fmtDate(x.date))}</span><span>${x.home ? "vs" : "@"} ${esc(x.opp)}</span><b class="${x.us > x.them ? "up" : "down"}">${x.us > x.them ? "W" : x.outcome && x.outcome !== "REG" ? "OTL" : "L"} ${x.us}–${x.them}</b><a href="/game/${x.id}/">Box</a></li>`).join("")}
    ${t.upcoming.map((x) => `<li><span class="muted">${esc(fmtDate(x.date))}</span><span>${x.home ? "vs" : "@"} ${esc(x.opp)}</span><span>${localTime(x.startUTC)}</span><a href="/game/${x.id}/">Preview</a></li>`).join("")}</ul></section>`;

  const roster = ctx.rosters[t.abbrev] ?? [];
  const sk = Object.fromEntries(ctx.stats.skaters.map((s) => [s.playerId, s]));
  const Y = Math.floor(ctx.league.seasonId / 10000);
  const capOf = (id) => { const k = ctx.profiles[id]?.contract?.list?.find((x) => x.startYear <= Y && +x.end.slice(0, 4) >= Y); return k ? { aav: k.aav, until: +k.end.slice(0, 4) + 1, exp: k.expiry } : null; };
  const ageOf = (id) => { const b = ctx.profiles[id]?.birthDate; return b ? Math.floor((Date.parse(ctx.site.builtAt) - Date.parse(b)) / (365.25 * 864e5)) : null; };
  const capM = (n) => `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, "")}M`;
  const cap = ctx.capTeams?.[t.abbrev];
  const capCard = cap?.capHit ? `<section class="card cap-card"><h2>Salary cap</h2>
    <div class="cap-meter"><span style="width:${Math.min(100, (cap.capHit / cap.upper) * 100).toFixed(1)}%"></span></div>
    <div class="ct-grid"><div><span>Cap hit</span><b>${capM(cap.capHit)}</b></div><div><span>Space</span><b class="${cap.space < 0 ? "down" : "up"}">${capM(cap.space)}</b></div><div><span>Ceiling</span><b>${capM(cap.upper)}</b></div></div>
    <p class="muted small">${cap.contracts ?? "?"}/50 contracts${cap.ltir ? ` · LTIR ${capM(cap.ltir)}` : ""}${cap.dead ? ` · dead cap ${capM(cap.dead)}` : ""}${cap.gm ? ` · GM ${esc(cap.gm)}` : ""}. Source: CapWages.</p>
    ${(() => { const top = roster.map((p) => ({ p, c: capOf(p.id) })).filter((x) => x.c).sort((x, y) => y.c.aav - x.c.aav).slice(0, 5); return top.length ? `<h3>Biggest cap hits</h3><ul class="mini-list">${top.map(({ p, c }) => `<li><a href="${playerUrl(p.id)}">${esc(p.first[0])}. ${esc(p.last)}</a><span class="muted">thru ${c.until}</span><b>${capM(c.aav)}</b></li>`).join("")}</ul>` : ""; })()}
  </section>` : "";
  const fr = ctx.records?.franchise?.[t.abbrev];
  const frBoard = (list, k, label) => { const top = [...(list ?? [])].filter((p) => p[k] > 0).sort((a, b) => b[k] - a[k]).slice(0, 5); return `<div class="fr-col"><h3>${label}</h3><ol class="fr-list">${top.map((p, i) => `<li><span class="rb-rank">${i + 1}</span><a href="${anyPlayerUrl(ctx, p.id, p.name)}">${esc(p.name)}</a>${ctx.rosters[t.abbrev]?.some((r) => r.id === p.id) ? ` <span class="pill ok">Active</span>` : ""}<b>${p[k].toLocaleString("en-US")}</b></li>`).join("")}</ol></div>`; };
  const recordsCard = fr ? `<section class="card"><h2>Franchise record book <span class="muted small">regular season, all time</span></h2><div class="fr-grid">${frBoard(fr.skaters, "pts", "Points")}${frBoard(fr.skaters, "g", "Goals")}${frBoard(fr.skaters, "a", "Assists")}${frBoard(fr.goalies, "w", "Goalie wins")}</div><a class="more" href="/records/#fr-${t.abbrev}">Full record book →</a></section>` : "";
  const rosterCard = `<section class="card"><h2>Roster</h2><div class="table-wrap"><table class="tbl sortable"><thead><tr><th>#</th><th>Player</th><th>Pos</th><th class="n">GP</th><th class="n">G</th><th class="n">A</th><th class="n">P</th><th class="n">TOI</th><th class="n">Age</th><th class="n">Cap hit</th></tr></thead><tbody>
    ${roster.filter((p) => p.pos !== "G").map((p) => { const s = sk[p.id]; return `<tr><td class="num">${esc(p.num ?? "")}</td><td><a href="${playerUrl(p.id)}">${esc(p.first)} ${esc(p.last)}</a></td><td>${esc(p.pos)}</td><td class="n">${s?.gamesPlayed ?? 0}</td><td class="n">${s?.goals ?? 0}</td><td class="n">${s?.assists ?? 0}</td><td class="n"><b>${s?.points ?? 0}</b></td><td class="n">${s ? mmss(s.timeOnIcePerGame) : "—"}</td><td class="n">${ageOf(p.id) ?? ""}</td>${(() => { const c = capOf(p.id); return c ? `<td class="n" data-v="${c.aav}" title="Through ${c.until - 1}-${String(c.until).slice(2)}${c.exp ? `, then ${c.exp}` : ""}">${capM(c.aav)}</td>` : `<td class="n muted" data-v="0">—</td>`; })()}</tr>`; }).join("")}
  </tbody></table></div></section>`;

  const body = h`
  ${t.accent ? `<style>:root{--team:${t.accent}}</style>` : ""}
  <section class="team-head"${t.accent ? ` style="--team:${attr(t.accent)}"` : ""}>
    <div class="th-logo">${logo(t, 72)}</div>
    <div class="th-main"><h1>${esc(t.name)}</h1>
      <p class="muted">${esc(t.record)} · ${t.pts} pts · ${esc(t.div)} #${t.divSeq} · L10 ${esc(t.l10)}${t.streak ? ` · ${esc(t.streak)}` : ""}</p>
      ${nextG ? `<p class="next">Next: ${nextG.home ? "vs" : "@"} <b>${esc(nextG.opp)}</b> · ${["LIVE", "CRIT"].includes(nextG.state) ? '<span class="live-dot">Live now</span>' : `${esc(fmtDate(nextG.date))} ${localTime(nextG.startUTC)}`} ${nextG.b2b ? pill("Back-to-back", "warn") : ""}</p>` : ""}
    </div>
    <button class="fav" data-fav="${attr(t.abbrev)}" aria-pressed="false" title="Pin as my team">★ <span>My team</span></button>
  </section>
  ${L ? `<div class="source-note">${stage("actual")}<span><b>Source:</b> NHL shift chart from the last game, ${gameRef(L)} (${esc(L.result)} ${esc(L.score)}). Lines are grouped by who played together and numbered by ice time. This is what the coach <i>used</i>; morning-skate changes appear above as Reported when they're posted.</span></div>` : `<div class="source-note">${stage("projected")}<span>No shift data yet for this team's last game. The NHL posts it a few hours after the final horn.</span></div>`}
  <div class="layout">
    <div>
      ${liveCard}${repCard}
      ${L ? `<section class="card"><h2>Forward lines <span class="muted small">5v5 · ${mmss(L.toi.es)}</span></h2>${comboRows(ctx, L.lines, ["L1", "L2", "L3", "L4"], players, { flags: c?.newLines, newIds })}</section>
      <section class="card"><h2>Defence pairs</h2>${comboRows(ctx, L.pairs, ["D1", "D2", "D3"], players, { flags: c?.newPairs, newIds })}</section>
      <section class="card"><h2>Power play <span class="muted small">${mmss(L.toi.pp)} total</span></h2>${comboRows(ctx, L.pp, ["PP1", "PP2"], players)}</section>
      <section class="card"><h2>Penalty kill <span class="muted small">${mmss(L.toi.pk)} total</span></h2>${comboRows(ctx, L.pk, ["PK1", "PK2"], players)}</section>
      ${L.extras.length ? `<section class="card"><h2>Rotated / extra skaters</h2><div class="names">${L.extras.map((id) => pname(ctx, id, players)).join("")}</div></section>` : ""}` : ""}
      ${rosterCard}
      ${recordsCard}
      ${teamStatsCard(ctx, t)}
    </div>
    <aside class="side">${changesCard}${teamExtras(ctx, t)}${goalieCard}${capCard}${sched}
      <section class="card"><h2>${esc(t.common)} news</h2>${teamNews.map((p) => newsItem(ctx, p, { compact: true })).join("") || `<p class="empty">No posts in the last two weeks.</p>`}</section>
    </aside>
  </div>`;
  return page({ site: ctx.site, title: `${t.name} lines & goalies`, description: `${t.name} line combinations, D pairs, power play units and starting goalie, from real ice time${L ? ` (last game ${L.date} vs ${L.opp})` : ""}.`, path: teamUrl(t), active: "/nhl/", body });
}

// ---------- Goalies ----------
export function goaliesPage(ctx) {
  const { league, T } = ctx;
  const sv = Object.fromEntries(ctx.stats.goalies.map((x) => [x.playerId, x]));
  const rows = [];
  let games = league.todayGames, label = "Tonight";
  if (!games.length) { const d = league.week.gameWeek.find((x) => x.games.length && x.date > league.today); games = d?.games ?? []; label = d ? fmtDate(d.date) : ""; }
  for (const g of games) for (const abbr of [g.awayTeam.abbrev, g.homeTeam.abbrev]) {
    const t = T[abbr]; if (!t) continue;
    const opp = abbr === g.awayTeam.abbrev ? g.homeTeam.abbrev : g.awayTeam.abbrev;
    const rep = ctx.reported[abbr];
    const id = t.live?.goalie ?? rep?.goalie?.parsed.goalie ?? t.goalies.projected;
    const s = sv[id];
    const st = t.goalies.starts.find((x) => x.id === id);
    rows.push(`<tr><td><a class="team-cell" href="${teamUrl(t)}">${logo(t, 22)}${esc(t.abbrev)}</a></td><td>${abbr === g.homeTeam.abbrev ? "vs" : "@"} ${esc(opp)}</td>
      <td>${id ? pname(ctx, id, null) : "—"}</td><td>${t.live?.goalie ? stage("confirmed") : rep?.goalie ? stage("confirmed") : stage("projected")}${t.next?.b2b ? " " + pill("B2B", "warn") : ""}</td><td class="src-cell">${goalieSource(ctx, t, rep).replace(/^Source: /, "")}</td>
      <td class="n">${st ? `${st.starts}/${t.goalies.window}` : "—"}</td><td class="n">${s ? pct(s.savePct) : "—"}</td><td class="n">${s ? Number(s.goalsAgainstAverage).toFixed(2) : "—"}</td><td class="n">${s ? `${s.wins}-${s.losses}-${s.otLosses}` : "—"}</td><td>${localTime(g.startTimeUTC)}</td></tr>`);
  }
  const body = `<h1>Starting goalies: ${esc(label)}</h1>
  <p class="lede">Every starter is either <b>Confirmed</b> (announced by a reporter or team account, linked to the post, or already in net) or <b>Projected</b>. Everything else is our projection from the NHL's own box scores: last game's starter, unless it's the second night of a back-to-back. The Source column links the exact game each projection is based on.</p>
  <div class="card"><div class="table-wrap"><table class="tbl sortable"><thead><tr><th>Team</th><th>Opp</th><th>Goalie</th><th>Status</th><th>Source</th><th class="n">Starts L10</th><th class="n">SV%</th><th class="n">GAA</th><th class="n">W-L-OT</th><th>Start</th></tr></thead><tbody>${rows.join("") || `<tr><td colspan="10" class="empty">No games.</td></tr>`}</tbody></table></div></div>`;
  return page({ site: ctx.site, title: "Starting goalies tonight", description: "Projected and reported NHL starting goalies for tonight's games, with back-to-back flags and recent start share.", path: "/goalies/", active: "/goalies/", body });
}

// ---------- News ----------
export function newsPage(ctx) {
  const posts = ctx.posts.filter((p) => p.parsed.type !== "other");
  const teams = Object.values(ctx.T).sort((a, b) => a.name.localeCompare(b.name));
  const body = `<h1>Lineup news</h1>
  <p class="lede">Line rushes, goalie starts, injuries and roster moves from reporters and team accounts, sorted by team and type. Every item links to the original post.</p>
  <div class="filters" data-filter-target="#feed">
    <div class="chips">${["all", "lines", "goalie", "injury", "roster", "news"].map((k, i) => `<button class="chip${i === 0 ? " on" : ""}" data-type="${k}">${{ all: "All", lines: "Lines", goalie: "Goalies", injury: "Injuries", roster: "Roster moves", news: "Other news" }[k]}</button>`).join("")}</div>
    <select class="team-filter" aria-label="Filter by team"><option value="">All teams</option>${teams.map((t) => `<option value="${t.abbrev}">${esc(t.name)}</option>`).join("")}</select>
  </div>
  <div id="feed" class="feed">${posts.map((p) => newsItem(ctx, p)).join("") || `<p class="empty">No posts yet. Add sources in config/sources.json.</p>`}</div>`;
  return page({ site: ctx.site, title: "Lineup news", description: "NHL line rushes, goalie confirmations, injuries and roster moves, sorted by team.", path: "/news/", active: "/news/", body });
}

// ---------- Standings ----------
export function standingsPage(ctx) {
  const all = Object.values(ctx.T);
  const row = (t, i, mark = "") => `<tr${mark ? ` class="${mark}"` : ""}><td class="n">${i}</td><td><a class="team-cell" href="${teamUrl(t)}">${logo(t, 22)}<span class="full">${esc(t.name)}</span><span class="abbr">${esc(t.abbrev)}</span></a></td>
    <td class="n">${t.gp}</td><td class="n">${t.w}</td><td class="n">${t.l}</td><td class="n">${t.otl}</td><td class="n"><b>${t.pts}</b></td><td class="n">${pct(t.ptsPct)}</td><td class="n">${t.rw}</td><td class="n">${t.gf}</td><td class="n">${t.ga}</td><td class="n ${t.diff > 0 ? "up" : t.diff < 0 ? "down" : ""}">${signed(t.diff)}</td><td class="n">${esc(t.l10)}</td><td class="n">${esc(t.streak)}</td></tr>`;
  const head = `<thead><tr><th class="n">#</th><th>Team</th><th class="n">GP</th><th class="n">W</th><th class="n">L</th><th class="n">OTL</th><th class="n">PTS</th><th class="n">P%</th><th class="n">RW</th><th class="n">GF</th><th class="n">GA</th><th class="n">DIFF</th><th class="n">L10</th><th class="n">STRK</th></tr></thead>`;
  const table = (ts, marks = () => "") => `<div class="table-wrap"><table class="tbl sortable">${head}<tbody>${ts.map((t, i) => row(t, i + 1, marks(t, i))).join("")}</tbody></table></div>`;
  const divs = {};
  for (const t of all) (divs[t.div] ??= []).push(t);
  const confs = {};
  for (const t of all) (confs[t.conf] ??= []).push(t);
  const wildcard = Object.entries(confs).map(([c, ts]) => {
    const top3 = {}; for (const t of ts) (top3[t.div] ??= []).push(t);
    const leaders = Object.values(top3).flatMap((d) => d.sort((a, b) => a.divSeq - b.divSeq).slice(0, 3));
    const rest = ts.filter((t) => !leaders.includes(t)).sort((a, b) => a.wcSeq - b.wcSeq || a.confSeq - b.confSeq);
    return `<section class="card"><h2>${esc(c)} Conference</h2>${Object.entries(top3).sort().map(([d, list]) => `<h3>${esc(d)}</h3>${table(list.sort((a, b) => a.divSeq - b.divSeq).slice(0, 3))}`).join("")}<h3>Wild card</h3>${table(rest, (t, i) => (i === 1 ? "cutline" : ""))}</section>`;
  }).join("");
  const body = `<h1>NHL standings</h1>
  <div class="tabs" role="tablist"><button class="tab on" data-tab="div">Division</button><button class="tab" data-tab="wc">Wild card</button><button class="tab" data-tab="lg">League</button></div>
  <div class="tab-panel" data-panel="div">${Object.entries(divs).sort().map(([d, ts]) => `<section class="card"><h2>${esc(d)}</h2>${table(ts.sort((a, b) => a.divSeq - b.divSeq))}</section>`).join("")}</div>
  <div class="tab-panel" data-panel="wc" hidden>${wildcard}</div>
  <div class="tab-panel" data-panel="lg" hidden><section class="card">${table([...all].sort((a, b) => a.leagueSeq - b.leagueSeq))}</section></div>`;
  return page({ site: ctx.site, title: "NHL standings", description: "NHL standings by division, wild card and league.", path: "/standings/", active: "/standings/", body });
}

// ---------- Schedule ----------
export function schedulePage(ctx) {
  const days = ctx.league.week.gameWeek;
  const body = `<h1>Schedule</h1><p class="lede">This week's games. Times in your local time zone.</p>
  ${days.map((d) => `<section class="card"><h2>${esc(fmtDate(d.date, { weekday: "long", month: "long", day: "numeric" }))} <span class="muted small">${d.games.length} games</span></h2>
    ${d.games.map((g) => { const A = ctx.T[g.awayTeam.abbrev], H = ctx.T[g.homeTeam.abbrev]; const fin = ["OFF", "FINAL"].includes(g.gameState), live = ["LIVE", "CRIT"].includes(g.gameState);
      return `<a class="sched-row" href="/game/${g.id}/"><span class="sr-team">${logo(A, 24)}${esc(A?.common ?? g.awayTeam.abbrev)}${fin || live ? ` <b>${g.awayTeam.score}</b>` : ""}</span><span class="muted">@</span><span class="sr-team">${logo(H, 24)}${esc(H?.common ?? g.homeTeam.abbrev)}${fin || live ? ` <b>${g.homeTeam.score}</b>` : ""}</span><span class="sr-time">${live ? '<span class="live-dot">Live</span>' : fin ? "Final" : localTime(g.startTimeUTC)}</span></a>`; }).join("") || `<p class="empty">No games.</p>`}
  </section>`).join("")}`;
  return page({ site: ctx.site, title: "NHL schedule", description: "This week's NHL schedule with times in your time zone.", path: "/schedule/", active: "/schedule/", body });
}

// ---------- Stats ----------
function leaderCard(ctx, title, list, fmt = (v) => v) {
  if (!list?.length) return "";
  const max = Math.max(...list.map((p) => Math.abs(Number(p.value)) || 0), 0.0001);
  return `<section class="card leader"><h2>${esc(title)}</h2><ol>${list.slice(0, 10).map((p) => `<li><a href="${playerUrl(p.id)}">${esc(p.firstName.default[0])}. ${esc(p.lastName.default)}</a><span class="muted">${esc(p.teamAbbrev)}</span><span class="lbar"><span style="width:${(Math.abs(Number(p.value)) / max) * 100}%"></span></span><b>${esc(fmt(p.value))}</b></li>`).join("")}</ol></section>`;
}

function edgeValue(v) {
  for (const k of ["shotSpeed", "skatingSpeed", "distanceSkated"]) if (v?.[k]?.imperial != null) return `${Number(v[k].imperial).toFixed(1)} ${k === "distanceSkated" ? "mi" : "mph"}`;
  if (v?.sog != null) return `${v.sog} SOG`;
  if (v?.zoneTime != null) return `${(v.zoneTime * 100).toFixed(1)}%`;
  for (const val of Object.values(v ?? {})) if (val && typeof val === "object" && val.imperial != null) return `${Number(val.imperial).toFixed(1)} mph`;
  return "";
}

export function statsPage(ctx) {
  const L = ctx.leaders;
  const edgeNames = { hardestShot: "Hardest shot", maxSkatingSpeed: "Top skating speed", totalDistanceSkated: "Most distance skated", distanceMaxGame: "Most distance, one game", highDangerSOG: "High-danger shots on goal", offensiveZoneTime: "Offensive zone time (team)", defensiveZoneTime: "Defensive zone time (team)" };
  const edge = Object.entries(L.edge).map(([k, v]) => `<div class="edge"><span class="eyebrow">${esc(edgeNames[k] ?? k)}</span><strong>${esc(edgeValue(v))}</strong><span>${v.player ? `<a href="${playerUrl(v.player.id)}">${esc(v.player.firstName.default)} ${esc(v.player.lastName.default)}</a> · ${esc(v.player.team?.abbrev ?? "")}` : esc(v.team?.abbrev ?? "")}</span></div>`).join("");
  const sk = [...ctx.stats.skaters].sort((a, b) => b.points - a.points || b.goals - a.goals).slice(0, 150);
  const body = `<h1>Stats</h1>
  <p class="hero-cta"><a class="btn" href="/stats/teams/">Team stats: advanced numbers for every team →</a></p>
  <div class="leaders">
    ${leaderCard(ctx, "Points", L.skaters.points)}${leaderCard(ctx, "Goals", L.skaters.goals)}${leaderCard(ctx, "Assists", L.skaters.assists)}${leaderCard(ctx, "Plus/minus", L.skaters.plusMinus, signed)}
    ${leaderCard(ctx, "Save %", L.goalies.savePctg, (v) => pct(v))}${leaderCard(ctx, "Goals-against avg", L.goalies.goalsAgainstAverage, (v) => Number(v).toFixed(2))}${leaderCard(ctx, "Wins", L.goalies.wins)}${leaderCard(ctx, "Shutouts", L.goalies.shutouts)}
  </div>
  ${edge ? `<h2 class="section-h">NHL EDGE tracking</h2><div class="edge-grid">${edge}</div>` : ""}
  <h2 class="section-h">Skaters</h2>
  <div class="card"><div class="table-wrap"><table class="tbl sortable" id="skaters"><thead><tr><th>Player</th><th>Team</th><th>Pos</th><th class="n">GP</th><th class="n">G</th><th class="n">A</th><th class="n">P</th><th class="n">P/GP</th><th class="n">PPP</th><th class="n">SOG</th><th class="n">SH%</th><th class="n">+/-</th><th class="n">TOI</th></tr></thead><tbody>
  ${sk.map((s) => `<tr><td><a href="${playerUrl(s.playerId)}">${esc(s.skaterFullName)}</a></td><td>${esc(String(s.teamAbbrevs).split(",").at(-1))}</td><td>${esc(s.positionCode)}</td><td class="n">${s.gamesPlayed}</td><td class="n">${s.goals}</td><td class="n">${s.assists}</td><td class="n"><b>${s.points}</b></td><td class="n">${Number(s.pointsPerGame).toFixed(2)}</td><td class="n">${s.ppPoints}</td><td class="n">${s.shots}</td><td class="n">${s.shootingPct != null ? (s.shootingPct * 100).toFixed(1) : "—"}</td><td class="n">${signed(s.plusMinus)}</td><td class="n">${mmss(s.timeOnIcePerGame)}</td></tr>`).join("")}
  </tbody></table></div><p class="muted small">Top 150 by points. Click a column to sort.</p></div>`;
  return page({ site: ctx.site, title: "NHL stats & leaders", description: "NHL scoring and goalie leaders, NHL EDGE tracking leaders and a sortable skater table.", path: "/stats/", active: "/stats/", body });
}

// ---------- Prospects ----------
export function prospectsPage(ctx) {
  const D = ctx.draftClass;
  const ours = Object.values(ctx.wjc.teams).flatMap((t) => Object.values(t.pool).map((p) => ({ ...p, code: t.code, flag: t.flag })))
    .filter((p) => p.pos !== "G" && !p.inNhl && p.club && p.club.gp > 0).sort((a, b) => b.score - a.score).slice(0, 60);
  const dob = (d) => fmtDate(d, { month: "short", day: "numeric", year: "numeric" });
  const grade = (g) => (g ? `<span class="css-grade g-${g.toLowerCase()}" title="NHL Central Scouting preliminary grade: ${{ A: "1st round", B: "2nd–3rd round", C: "4th–5th round", W: "6th–7th round" }[g]}">${g}</span>` : "");
  const posGroup = (p) => (p.pos === "G" ? "G" : /^[LR]?D$/.test(p.pos) ? "D" : "F");
  const sk = (D?.players ?? []).filter((p) => p.pos !== "G");
  const gl = (D?.players ?? []).filter((p) => p.pos === "G").sort((a, b) => (b.css ? 1 : 0) - (a.css ? 1 : 0) || b.score - a.score);
  const fix = (t) => (/[ÃÂ]/.test(String(t ?? "")) ? Buffer.from(String(t), "latin1").toString("utf8") : String(t ?? "")); // feeds that double-encode UTF-8
  const who = (p) => `<b>${flagOf(nationFromHome(p.from) ?? (p.nat ? country(p.nat) : null))} ${esc(p.name)}</b>${p.consensus ? ` <span class="dc-cons" title="${p.consAvg != null ? `Average rank ${p.consAvg} across ${p.consN} of ${D.publicLists?.count ?? "the"} public rankings and mocks` : "Consensus rank from public rankings"}">Top ${p.consensus}</span>` : ""}<small>${[p.born && dob(p.born), fix(p.from), p.height].filter(Boolean).map(esc).join(" · ")}</small>`;
  const club = (p) => p.now ? `${esc(p.team)} <span class="muted">${esc(p.league)}</span>` : `<span class="muted">${p.nowTeam ? esc(p.nowTeam) : p.last ? `${esc(p.last.team)} ${esc(p.last.league)} · no games yet` : "—"}</span>`;
  const ppg = (s) => (s?.gp ? (s.p / s.gp).toFixed(2) : "—");
  const skRows = sk.map((p, i) => `<tr class="post" data-type="${posGroup(p)}${p.css ? ` css-${p.css}` : ""}" data-team="${attr(p.league)}"><td class="n">${i + 1}</td><td class="dc-who">${who(p)}</td><td>${grade(p.css)}</td><td>${esc(p.pos || "—")}</td><td>${club(p)}</td><td class="n">${p.now?.gp ?? "—"}</td><td class="n">${p.now?.g ?? "—"}</td><td class="n">${p.now?.a ?? "—"}</td><td class="n"><b>${p.now?.p ?? "—"}</b></td><td class="n">${ppg(p.now)}</td><td class="n muted" title="${attr(p.last ? `${p.last.team}, ${p.last.league}: ${p.last.p} pts in ${p.last.gp} GP` : "")}">${ppg(p.last)}</td><td class="n"><b>${p.now || p.last ? (p.score * 100).toFixed(0) : "—"}</b></td></tr>`).join("");
  const glRows = gl.map((p, i) => { const s = p.now ?? p.last; return `<tr class="post" data-type="G${p.css ? ` css-${p.css}` : ""}" data-team="${attr(p.league)}"><td class="n">${i + 1}</td><td class="dc-who">${who(p)}</td><td>${grade(p.css)}</td><td>${club(p)}</td><td class="n">${s?.gp ?? "—"}</td><td class="n">${s?.w ?? "—"}</td><td class="n">${s?.sv ? s.sv.toFixed(3).replace(/^0/, "") : "—"}</td><td class="n">${s?.gaa != null ? s.gaa.toFixed(2) : "—"}</td></tr>`; }).join("");
  const nA = (D?.players ?? []).filter((p) => p.css === "A").length + (D?.elsewhere?.length ?? 0);
  const body = `<section class="hero"><div><p class="eyebrow">${D ? `${D.year} NHL Draft · first-time eligible: born ${esc(dob(D.from))} – ${esc(dob(D.to))}` : "Prospects"}</p><h1>${D ? `${D.year} draft class` : "Prospects"}</h1>
    ${D?.publicLists ? `<p class="hero-cta"><a class="btn" href="/prospects/mock-draft/">${D.year} mock draft &amp; consensus ranking →</a></p>` : ""}
    <p class="hero-cta"><a class="btn" href="/prospects/nhl/">NHL prospect pools: every team, with flags and current clubs →</a></p>
    <p class="lede">Every undrafted, first-time-eligible player in the OHL, WHL, QMJHL and USHL, with this season's stats, ranked the way scouts see it: the consensus top of the class from public rankings first, with Landon DuPont the clear No. 1, then everyone else by NHL Central Scouting's preliminary grade combined with our stats index (points per game, shrunk on small samples and adjusted for league, position and age).</p></div></section>
  ${D ? `<div class="statbox slim"><div><span>Eligible players</span><b>${D.players.length}</b></div><div><span>Central Scouting A</span><b>${nA}</b></div>${["OHL", "WHL", "QMJHL", "USHL"].map((l) => `<div><span>${l}</span><b>${D.players.filter((p) => p.league === l).length}</b></div>`).join("")}</div>
  <section class="card"><h2>Skaters <span class="muted small">${sk.length} players</span></h2>
    <div class="filters" data-filter-target="#dc-sk"><div class="chips"><button class="chip on" data-type="all">All</button><button class="chip" data-type="css-A">A-graded</button><button class="chip" data-type="css-B">B</button><button class="chip" data-type="css-C">C</button><button class="chip" data-type="F">Forwards</button><button class="chip" data-type="D">Defence</button></div>
      <select class="team-filter" aria-label="Filter by league"><option value="">All leagues</option>${["OHL", "WHL", "QMJHL", "USHL"].map((l) => `<option>${l}</option>`).join("")}</select></div>
    <div class="table-wrap"><table class="tbl sortable compact dc-tbl" id="dc-sk"><thead><tr><th class="n">#</th><th>Player</th><th>CSS</th><th>Pos</th><th>Team</th><th class="n">GP</th><th class="n">G</th><th class="n">A</th><th class="n">P</th><th class="n">P/GP</th><th class="n" title="Points per game last season">Last P/GP</th><th class="n">Index</th></tr></thead><tbody>${skRows}</tbody></table></div></section>
  <section class="card"><h2>Goalies <span class="muted small">${gl.length} players</span></h2>
    <div class="table-wrap"><table class="tbl sortable compact dc-tbl"><thead><tr><th class="n">#</th><th>Player</th><th>CSS</th><th>Team</th><th class="n">GP</th><th class="n">W</th><th class="n">SV%</th><th class="n">GAA</th></tr></thead><tbody>${glRows}</tbody></table></div></section>
  ${D.elsewhere.length ? `<section class="card"><h2>Also A-graded by Central Scouting <span class="muted small">playing in Europe or the NCAA, outside our stat feeds</span></h2><ul class="dc-else">${D.elsewhere.map((c) => `<li>${grade("A")} <b>${esc(c.name)}</b>${c.team ? ` <span class="muted">${esc(c.team)}${c.league ? `, ${esc(c.league)}` : ""}</span>` : c.league ? ` <span class="muted">${esc(c.league)}</span>` : ""}</li>`).join("")}</ul></section>` : ""}
  <p class="muted small">Stats: the OHL, WHL, QMJHL and USHL public stat feeds (HockeyTech), refreshed every build. ${esc(D.consensusSource ?? "")} ${esc(D.cssSource ?? "")}</p>` : `<p class="empty">Draft class data is unavailable right now.</p>`}
  <section class="card"><h2>Drafted prospects: World Juniors index <span class="muted small">already drafted, not yet in the NHL</span></h2>
  <div class="table-wrap"><table class="tbl sortable compact"><thead><tr><th class="n">#</th><th>Player</th><th>Nation</th><th>Pos</th><th>Club</th><th class="n">GP</th><th class="n">P</th><th>Drafted</th><th class="n">Index</th></tr></thead><tbody>
  ${ours.map((p, i) => `<tr><td class="n">${i + 1}</td><td><a href="${anyPlayerUrl(ctx, p.id, `${p.first} ${p.last}`)}">${esc(p.first)} ${esc(p.last)}</a></td><td><a href="/wjc/${p.code.toLowerCase()}/">${p.flag} ${esc(p.code)}</a></td><td>${esc(p.pos)}</td><td>${esc(fix(p.club.team))} <span class="muted">${esc(p.club.league)}</span></td><td class="n">${p.club.gp}</td><td class="n">${p.club.pts}</td><td>${p.draft ? `${esc(p.draft.team)} #${p.draft.overall} (${p.draft.year})` : "—"}</td><td class="n"><b>${(p.score * 100).toFixed(0)}</b></td></tr>`).join("")}
  </tbody></table></div></section>`;
  return page({ site: ctx.site, title: D ? `${D.year} NHL Draft prospects: every eligible player` : "Prospect rankings", description: `Every first-time-eligible ${D?.year ?? ""} NHL Draft prospect in the OHL, WHL, QMJHL and USHL, with stats, Central Scouting grades and a stats-based ranking.`, path: "/prospects/", active: "/prospects/", body });
}

// ---------- Player ----------
export function playerPage(ctx, p) {
  const t = ctx.T[p.team];
  const L = t?.last;
  const where = [];
  if (L) {
    L.lines.forEach((l, i) => l.ids.includes(p.id) && where.push({ k: `L${i + 1}`, c: l }));
    L.pairs.forEach((l, i) => l.ids.includes(p.id) && where.push({ k: `D${i + 1}`, c: l }));
    L.pp.forEach((l, i) => l.ids.includes(p.id) && where.push({ k: `PP${i + 1}`, c: l }));
    L.pk.forEach((l, i) => l.ids.includes(p.id) && where.push({ k: `PK${i + 1}`, c: l }));
  }
  const s = ctx.stats.skaters.find((x) => x.playerId === p.id);
  const gs = ctx.stats.goalies.find((x) => x.playerId === p.id);
  const age = p.birthDate ? Math.floor((Date.parse(ctx.site.builtAt) - Date.parse(p.birthDate)) / (365.25 * 864e5)) : null;
  const ht = p.height ? `${Math.floor(p.height / 12)}'${p.height % 12}"` : "";
  const statBox = s ? [["GP", s.gamesPlayed], ["G", s.goals], ["A", s.assists], ["P", s.points], ["+/-", signed(s.plusMinus)], ["PPP", s.ppPoints], ["SOG", s.shots], ["TOI", mmss(s.timeOnIcePerGame)]]
    : gs ? [["GP", gs.gamesPlayed], ["GS", gs.gamesStarted], ["W", gs.wins], ["L", gs.losses], ["OTL", gs.otLosses], ["SV%", pct(gs.savePct)], ["GAA", Number(gs.goalsAgainstAverage).toFixed(2)], ["SO", gs.shutouts]] : [];
  const body = `<section class="player-head">
    ${p.headshot ? `<img class="headshot" src="${attr(p.headshot)}" alt="" width="96" height="96" loading="lazy">` : ""}
    <div><p class="eyebrow">${t ? `<a href="${teamUrl(t)}">${logo(t, 18)} ${esc(t.name)}</a>` : ""}</p>
    <h1>${esc(p.first)} ${esc(p.last)} <span class="muted">#${esc(p.num ?? "")}</span></h1>
    <p class="muted">${esc(p.pos)}${p.shoots ? ` · ${p.pos === "G" ? "Catches" : "Shoots"} ${esc(p.shoots)}` : ""}${ht ? ` · ${ht}, ${p.weight} lb` : ""}${age ? ` · Age ${age}` : ""}${p.birthCountry ? ` · ${esc(p.birthCountry)}` : ""}</p></div>
  </section>
  ${statBox.length ? `<div class="statbox">${statBox.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join("")}</div>` : ""}
  <div class="layout"><div>
    <section class="card"><h2>Current deployment ${L ? stage("actual") : ""}</h2>
      ${where.length ? where.map((w) => `<div class="combo"><div class="slot">${w.k}</div><div class="combo-main"><div class="names">${w.c.ids.map((id) => pname(ctx, id, L.players, { cls: id === p.id ? "is-me" : "" })).join("")}</div><div class="meta">${onIce(w.c)}</div></div><div class="toi">${mmss(w.c.sec)}</div></div>`).join("")
        : `<p class="empty">${L ? `Not in a regular unit in the last game (${esc(fmtDate(L.date))} vs ${esc(L.opp)}).` : "No recent shift data."}</p>`}
      ${L ? `<p class="muted small">From the last game: ${esc(fmtDate(L.date))} ${L.home ? "vs" : "@"} ${esc(L.opp)}.</p>` : ""}
    </section>
  </div><aside class="side">
    <section class="card"><h2>News</h2>${ctx.posts.filter((x) => x.parsed.players.includes(p.id)).slice(0, 6).map((x) => newsItem(ctx, x, { compact: true })).join("") || `<p class="empty">No recent posts.</p>`}</section>
  </aside></div>`;
  return page({ site: ctx.site, title: `${p.first} ${p.last}: line, linemates & stats`, description: `${p.first} ${p.last}'s current line, linemates, power play role and ${s ? "season stats" : "stats"}${t ? ` with the ${t.name}` : ""}.`, path: playerUrl(p.id), active: "/nhl/", body });
}

// ---------- Gamecenter ----------
export function gamePage(ctx, g, snapshot) {
  const A = ctx.T[g.awayTeam.abbrev], H = ctx.T[g.homeTeam.abbrev];
  const pre = (t, abbr) => {
    if (!t) return "";
    const rep = ctx.reported[abbr];
    const lines = rep?.lines ? rep.lines.parsed.lines.map((ids) => ({ ids })) : t.last?.lines ?? [];
    const pl = rep?.lines ? null : t.last?.players;
    return `<section class="card"><h2>${logo(t, 22)} ${esc(t.common)} ${stage(rep?.lines && !rep.lines.stale ? "reported" : "projected")}</h2>
      ${comboRows(ctx, lines, ["L1", "L2", "L3", "L4"], pl)}
      ${comboRows(ctx, rep?.lines ? rep.lines.parsed.pairs.map((ids) => ({ ids })) : t.last?.pairs ?? [], ["D1", "D2", "D3"], pl)}
      ${srcNote(linesSource(ctx, t, rep))}
      <div class="gc-row"><span class="k">Goalie</span>${goalieLine(ctx, t, rep)}</div>
      ${srcNote(goalieSource(ctx, t, rep))}</section>`;
  };
  const title = `${A?.common ?? g.awayTeam.abbrev} at ${H?.common ?? g.homeTeam.abbrev}`;
  const body = `<div id="gc" data-game="${g.id}" data-live-api="${attr(ctx.site.liveApi)}" data-state="${attr(g.gameState)}">
    <section class="score-head card">
      <a class="sh-team" href="${A ? teamUrl(A) : "#"}">${logo(A, 56)}<span>${esc(A?.name ?? g.awayTeam.abbrev)}</span><b class="sh-score" data-k="away-score">${snapshot ? snapshot.away.score : ""}</b></a>
      <div class="sh-mid"><div data-k="status">${snapshot ? "" : localTime(g.startTimeUTC, "datetime")}</div><div class="muted small" data-k="venue">${esc(g.venue?.default ?? "")}</div></div>
      <a class="sh-team home" href="${H ? teamUrl(H) : "#"}"><b class="sh-score" data-k="home-score">${snapshot ? snapshot.home.score : ""}</b><span>${esc(H?.name ?? g.homeTeam.abbrev)}</span>${logo(H, 56)}</a>
    </section>
    ${gamePredictCard(ctx, g)}
    <div id="gc-body">${snapshot ? "" : `<div class="pre-grid">${pre(A, g.awayTeam.abbrev)}${pre(H, g.homeTeam.abbrev)}</div>`}</div>
  </div>`;
  return page({ site: ctx.site, title: `${title}: lines, shot map, live stats`, description: `${title} on ${g.gameDate ?? ""}: lineups, live lines from shift data, shot map and box score.`, path: `/game/${g.id}/`, active: "/schedule/", body, scripts: ["/assets/game.js", "/assets/predict.js#module"], json: { snapshot, colors: { away: A?.accent ?? null, home: H?.accent ?? null } } });
}

// ---------- About ----------
export function aboutPage(ctx) {
  const body = `<article class="prose">
  <h1>How LineCombos works</h1>
  <p>Every lineup on the site carries a label that tells you how much to trust it:</p>
  <ul>
    <li>${stage("projected")} Our projection. For NHL teams that's last game's actual lines. For the World Juniors it's our model.</li>
    <li>${stage("reported")} Posted today by a reporter or team account (line rushes at morning skate, goalie first off the ice). Always linked to the source post.</li>
    <li>${stage("confirmed")} Official lineup or confirmed by the team.</li>
    <li>${stage("live")} / ${stage("actual")} Worked out from the NHL's shift charts: who was really on the ice together, second by second. During games this runs about 10 game minutes behind.</li>
  </ul>
  <h2>Where the data comes from</h2>
  <ul>
    <li><b>NHL:</b> the league's public stats, schedule, standings, box scores, play-by-play, shift charts, EDGE tracking and Central Scouting rankings.</li>
    <li><b>News:</b> reporters, team accounts and lineup bots on Bluesky and X. We pull out the facts (who's on which line, who starts) and link to every original post. We don't republish images or full threads.</li>
    <li><b>World Juniors:</b> schedule from NHL.com. Player pool from NHL draft classes and prospect lists, with stats from each player's current league. Official rosters and reported lines are added as they're announced.</li>
  </ul>
  <h2>The World Juniors model</h2>
  <p>Each player gets a score: points per game, adjusted for league strength (NHL-equivalency style factors), shrunk toward zero for small samples, plus a bonus for draft position and for being in the oldest eligible birth year. Forwards fill four lines (centres at centre, wings by side), defence pairs balance left and right shots, the power play takes the top offensive scorers, and the goalie with the best league-adjusted save percentage starts. NHL regulars are left out until a roster names them, since NHL teams rarely loan players.</p>
  <h2>Not affiliated</h2>
  <p>LineCombos is an independent fan site. Not affiliated with the NHL, NHLPA, IIHF or any team. Team names and logos belong to their owners.</p>
  </article>`;
  return page({ site: ctx.site, title: "How it works", description: "How LineCombos builds lineups: shift data, reporter posts, and the World Juniors model.", path: "/about/", active: "", body });
}
