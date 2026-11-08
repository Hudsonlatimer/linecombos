// Game predictions: the win-chance block on every game card, the gamecenter prediction panel, and /predictions/.
// Pre-game numbers are built in; /assets/predict.js keeps them live during games (score, clock, power plays, pulled goalies).
import { esc, attr, fmtDate, localTime, stage, page } from "./html.mjs";
import { logo, goalieSource } from "./nhl-pages.mjs";

const P = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
const pts = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}`;
const FINAL = new Set(["OFF", "FINAL"]), LIVE = new Set(["LIVE", "CRIT"]);
const nm = (ctx, abbr) => ctx.T[abbr]?.common ?? abbr;
const srcNote = (html) => `<p class="src-note">${html}</p>`;

/** The win-chance bar. mode: "card" (game cards), "full" (gamecenter), "row" (week list). */
export function wpBlock(ctx, g, { mode = "card" } = {}) {
  const pr = ctx.preds?.games?.[g.id];
  if (!pr) return "";
  const A = ctx.T[g.awayTeam.abbrev], H = ctx.T[g.homeTeam.abbrev];
  const ph = pr.home, pa = 1 - ph;
  const fin = FINAL.has(g.gameState), live = LIVE.has(g.gameState);
  const favH = ph >= 0.5, fav = favH ? H : A;
  let state = "Pre-game";
  if (live) state = "Live";
  if (fin && pr.result) state = (pr.result.homeWon === favH ? "✓ " : "✗ ") + `Pre-game pick: ${esc(fav?.abbrev ?? "")} ${P(Math.max(ph, pa))}`;
  const proj = `Projected ${pr.la.toFixed(1)}–${pr.lh.toFixed(1)} · OT ${P(pr.ot)}`;
  return `<div class="wp wp-${mode}${fin ? " is-final" : ""}" data-wp="${g.id}" data-lh="${pr.lh}" data-la="${pr.la}" data-playoff="${pr.playoff ? 1 : 0}" data-date="${attr(g.gameDate ?? pr.date)}" data-state="${attr(g.gameState)}" data-start="${attr(g.startTimeUTC ?? pr.start)}" style="--ca:${attr(A?.accent ?? "#888")};--ch:${attr(H?.accent ?? "#444")}">
    <div class="wp-head"><span class="wp-lbl">Win chance</span><span class="wp-state" data-k="wp-state">${state}</span></div>
    <div class="wp-row">
      <span class="wp-team">${logo(A, 18)}<b>${esc(g.awayTeam.abbrev)}</b><em data-k="pa">${P(pa)}</em></span>
      <span class="wp-track" role="img" aria-label="${attr(`${g.awayTeam.abbrev} ${P(pa)}, ${g.homeTeam.abbrev} ${P(ph)}`)}"><span class="wp-a" data-k="ba" style="width:${(pa * 100).toFixed(1)}%"></span><span class="wp-h" data-k="bh" style="width:${(ph * 100).toFixed(1)}%"></span></span>
      <span class="wp-team r"><em data-k="ph">${P(ph)}</em><b>${esc(g.homeTeam.abbrev)}</b>${logo(H, 18)}</span>
    </div>
    ${mode === "full" ? "" : `<div class="wp-meta"><span data-k="wp-meta">${proj}</span> · <a href="/game/${g.id}/#predict">Why</a></div>`}
  </div>`;
}

function goalieRow(ctx, s, abbr) {
  const t = ctx.T[abbr], G = s.goalie;
  if (!G) return `<tr><td>Goalie</td><td colspan="2" class="muted">Not set for this game yet: team's usual mix</td></tr>`;
  const st = G.status === "confirmed" ? "confirmed" : "projected";
  return `<tr><td>Goalie</td><td>${G.name ? `<a href="/players/${G.id}/">${esc(G.name)}</a>` : "?"} ${stage(st)}${G.status === "likely" ? ' <span class="muted small">reported likely</span>' : ""}
      <div class="muted small">${G.gsax >= 0 ? "+" : "−"}${Math.abs(G.gsax).toFixed(1)} goals saved above expected this season · ${G.shots} shots faced · rating also counts last season</div>
      ${t?.next ? srcNote(goalieSource(ctx, t, ctx.reported[abbr])) : ""}</td>
    <td class="n ${G.factor < 1 ? "up" : G.factor > 1 ? "down" : ""}" title="Goals allowed vs an average goalie">${G.factor < 1 ? "−" : "+"}${Math.abs((G.factor - 1) * 100).toFixed(1)}% GA</td></tr>`;
}

const outList = (l) => l.missing?.length ? `<div class="muted small">Regulars not in the lineup: ${l.missing.map((x) => `<a href="/players/${x.id}/">${esc(x.name ?? "?")}</a>${x.hurt ? " (injured)" : ""}`).join(", ")}</div>` : "";
function lineupRow(s) {
  const l = s.lineup;
  if (!l) return "";
  const e = l.effect, txt = Math.abs(e) < 0.005 ? "About their usual strength" : e > 0 ? "Stronger than their usual lineup" : "Weaker than their usual lineup";
  return `<tr><td>Lineup</td><td>${txt} <span class="muted small">(${esc(l.source)}, injured players removed)</span>${outList(l)}</td><td class="n ${e > 0.005 ? "up" : e < -0.005 ? "down" : ""}">${e >= 0 ? "+" : "−"}${Math.abs(e * 100).toFixed(1)}% GF</td></tr>`;
}

/** Gamecenter: full prediction with the live chart, the factors behind it, and likely goal scorers. */
export function gamePredictCard(ctx, g) {
  const pr = ctx.preds?.games?.[g.id];
  if (!pr) return "";
  const A = ctx.T[g.awayTeam.abbrev], H = ctx.T[g.homeTeam.abbrev];
  const sideRows = (s) => `
    <tr><td>Attack</td><td>Scores ${Math.abs(s.gf).toFixed(0)}% ${s.gf >= 0 ? "more" : "less"} than average <span class="muted small">(goals, shots and expected goals, recent games count more, ${s.gp} GP)</span></td><td class="n ${s.gf >= 0 ? "up" : "down"}">${s.gf >= 0 ? "+" : "−"}${Math.abs(s.gf).toFixed(1)}%</td></tr>
    <tr><td>Defence</td><td>Allows ${Math.abs(s.ga).toFixed(0)}% ${s.ga <= 0 ? "fewer" : "more"} than average <span class="muted small">(goalie taken out)</span></td><td class="n ${s.ga <= 0 ? "up" : "down"}">${s.ga >= 0 ? "+" : "−"}${Math.abs(s.ga).toFixed(1)}%</td></tr>
    ${goalieRow(ctx, s, s.abbr)}
    ${lineupRow(s)}
    ${s.b2b ? `<tr><td>Rest</td><td>2nd night of a back-to-back</td><td class="n down">−${(ctx.preds.params.b2b * 100).toFixed(0)}% GF</td></tr>` : ""}
    <tr class="xg"><td>Expected goals</td><td></td><td class="n"><b>${s.xg.toFixed(2)}</b></td></tr>`;
  const sw = pr.swings;
  // Swings are in home-team terms: positive helps the home team, negative the road team.
  const swing = (label, v, why) => (Math.abs(v) < 0.0005 ? "" : `<li><b>${label}</b> <span class="sw-v">${pts(Math.abs(v))} pts</span> for ${esc(v >= 0 ? g.homeTeam.abbrev : g.awayTeam.abbrev)} <span class="muted small">${esc(why)}</span></li>`);
  const swings = sw ? [
    swing("Home ice", sw.home, `${g.homeTeam.abbrev} at home`),
    swing("Goalies", sw.goalies, "tonight's starters vs each team's usual goalie mix"),
    swing("Lineups", sw.lineups ?? 0, "tonight's lineups vs each team's usual (injuries and scratches)"),
    swing("Back-to-back", sw.b2b, [pr.a.b2b && `${g.awayTeam.abbrev} played yesterday`, pr.h.b2b && `${g.homeTeam.abbrev} played yesterday`].filter(Boolean).join(", ")),
  ].join("") : "";
  const scorers = (s, t) => s.scorers.length ? `<div><h3>${logo(t, 18)} ${esc(t?.common ?? s.abbr)}</h3><ol class="scorers">${s.scorers.map((x) => `<li><a href="/players/${x.id}/">${esc(x.name)}</a> <span class="muted small">${esc(x.pos)}</span><span class="sc-bar"><span style="width:${Math.min(100, x.p * 200)}%"></span></span><b>${P(x.p)}</b></li>`).join("")}</ol></div>` : "";
  const sc = scorers(pr.a, A) + scorers(pr.h, H);
  return `<section class="card wp-card" id="predict" style="--ca:${attr(A?.accent ?? "#888")};--ch:${attr(H?.accent ?? "#444")}">
    <h2>Prediction <span class="muted small" data-k="wp-sub">${LIVE.has(g.gameState) ? "updating live" : FINAL.has(g.gameState) ? "how the chances moved" : "before puck drop · goes live at puck drop"}</span></h2>
    ${wpBlock(ctx, g, { mode: "full" })}
    <div class="wp-chart" data-wp-chart="${g.id}" hidden></div>
    <div class="wp-facts">
      <div><span>Projected score</span><b>${esc(g.awayTeam.abbrev)} ${pr.la.toFixed(1)} – ${pr.lh.toFixed(1)} ${esc(g.homeTeam.abbrev)}</b></div>
      <div><span>Most likely</span><b>${pr.top.slice(0, 3).map((s) => `${s.a}–${s.h} <small>${P(s.p)}</small>`).join(" · ")}</b></div>
      <div><span>Goes to OT</span><b>${P(pr.ot)}</b></div>
      <div><span>Over 5.5 / 6.5</span><b>${P(pr.over55)} / ${P(pr.over65)}</b></div>
      <div><span>Win by 2+</span><b>${esc(g.awayTeam.abbrev)} ${P(pr.awayBy2)} · ${esc(g.homeTeam.abbrev)} ${P(pr.homeBy2)}</b></div>
    </div>
    ${swings ? `<h3>What moves it</h3><ul class="swings">${swings}</ul>` : ""}
    <div class="wp-sides">
      <div><h3>${logo(A, 18)} ${esc(A?.common ?? g.awayTeam.abbrev)} <span class="muted small">road</span></h3><table class="tbl compact wp-tbl"><tbody>${sideRows(pr.a)}</tbody></table></div>
      <div><h3>${logo(H, 18)} ${esc(H?.common ?? g.homeTeam.abbrev)} <span class="muted small">home</span></h3><table class="tbl compact wp-tbl"><tbody>${sideRows(pr.h)}</tbody></table></div>
    </div>
    ${sc ? `<h3>Most likely to score</h3><div class="wp-sides">${sc}</div><p class="src-note">From each player's goals per game (this season, leaning on last season early on), scaled to tonight's expected goals. Lineup: ${ctx.reported[g.homeTeam.abbrev]?.lines || ctx.reported[g.awayTeam.abbrev]?.lines ? "the latest reported lines" : "last game's lineup"}.</p>` : ""}
    <p class="src-note">How it works: team ratings from goals, shots and shot quality (expected goals), weighted toward recent games and leaning on last season early, plus the starting goalie's goals saved above expected, home ice and rest give each team's expected goals; the chance of each score follows from those. During the game it plays out only the time left from the current score, with power plays and pulled goalies. <a href="/predictions/#record">Season record</a></p>
  </section>`;
}

/** /predictions/: today's games, the rest of the week, and the season record. */
export function predictionsPage(ctx) {
  const { league, preds } = ctx;
  const all = [];
  for (const d of league.week.gameWeek) for (const g of d.games) if (preds.games[g.id]) all.push(g);
  for (const g of league.todayGames) if (preds.games[g.id] && !all.some((x) => x.id === g.id)) all.push(g);
  const byDay = {};
  for (const g of all) (byDay[g.gameDate ?? preds.games[g.id].date] ??= []).push(g);
  const days = Object.keys(byDay).sort();
  const today = league.today;
  const card = (g) => {
    const pr = preds.games[g.id], fin = FINAL.has(g.gameState), live = LIVE.has(g.gameState);
    const gl = (s) => s.goalie ? `${esc(s.goalie.name?.split(" ").at(-1) ?? "")} ${stage(s.goalie.status === "confirmed" ? "confirmed" : "projected")}` : `<span class="muted">TBD</span>`;
    const top = (s) => s.scorers[0] ? `<a href="/players/${s.scorers[0].id}/">${esc(s.scorers[0].name.split(" ").at(-1))}</a> ${P(s.scorers[0].p)}` : "";
    return `<section class="card pred-card">
      <div class="gc-status">${live ? `<span class="live-dot" data-live-status="${g.id}">Live</span>` : fin ? `Final ${g.awayTeam.score}–${g.homeTeam.score}` : localTime(g.startTimeUTC)}<a class="btn-sm" href="/game/${g.id}/#predict">Full prediction</a></div>
      ${wpBlock(ctx, g, { mode: "card" })}
      <div class="pred-mini">
        ${pr.a.goalie || pr.h.goalie ? `<div><span class="k">Goalies</span>${gl(pr.a)} <span class="muted">vs</span> ${gl(pr.h)}</div>` : ""}
        ${pr.a.scorers.length ? `<div><span class="k">Top scorer pick</span>${top(pr.a)} · ${top(pr.h)}</div>` : ""}
        ${[pr.a, pr.h].some((s) => s.lineup?.missing?.some((x) => x.v >= 1.1)) ? `<div><span class="k">Missing</span>${[pr.a, pr.h].flatMap((s) => (s.lineup?.missing ?? []).filter((x) => x.v >= 1.1).slice(0, 2).map((x) => `${esc(s.abbr)} ${esc(x.name?.split(" ").at(-1) ?? "")}`)).join(", ")}</div>` : ""}
        ${pr.a.b2b || pr.h.b2b ? `<div><span class="k">Rest</span>${[pr.a.b2b && g.awayTeam.abbrev, pr.h.b2b && g.homeTeam.abbrev].filter(Boolean).join(", ")} on a back-to-back</div>` : ""}
      </div>
    </section>`;
  };
  const row = (g) => {
    const pr = preds.games[g.id], ph = pr.home, favH = ph >= 0.5;
    return `<a class="pred-row" href="/game/${g.id}/#predict">${logo(ctx.T[g.awayTeam.abbrev], 20)}<b>${esc(g.awayTeam.abbrev)}</b><span class="muted">@</span>${logo(ctx.T[g.homeTeam.abbrev], 20)}<b>${esc(g.homeTeam.abbrev)}</b>
      <span class="wp-track sm" style="--ca:${attr(ctx.T[g.awayTeam.abbrev]?.accent ?? "#888")};--ch:${attr(ctx.T[g.homeTeam.abbrev]?.accent ?? "#444")}"><span class="wp-a" style="width:${((1 - ph) * 100).toFixed(1)}%"></span><span class="wp-h" style="width:${(ph * 100).toFixed(1)}%"></span></span>
      <span class="pr-fav">${esc(favH ? g.homeTeam.abbrev : g.awayTeam.abbrev)} ${P(Math.max(ph, 1 - ph))}</span><span class="muted small">${localTime(g.startTimeUTC)}</span></a>`;
  };
  const R = preds.record;
  const tonight = days.filter((d) => d === today);
  const later = days.filter((d) => d > today);
  const band = (b) => `<tr><td>${P(b.lo)}–${b.hi >= 1 ? "" : P(b.hi)}${b.hi >= 1 ? "+" : ""}</td><td class="n">${b.n}</td><td class="n">${P(b.avg)}</td><td class="n"><b>${b.n ? P(b.right / b.n) : "—"}</b></td></tr>`;
  const recent = R.recent.map((p) => {
    const favH = p.p >= 0.5, right = favH === p.homeWon;
    return `<tr><td>${esc(fmtDate(p.date, { month: "short", day: "numeric" }))}</td><td><a href="/game/${p.id}/">${esc(p.away)} @ ${esc(p.home)}</a></td><td>${esc(favH ? p.home : p.away)} ${P(Math.max(p.p, 1 - p.p))}</td><td class="n">${p.ag}–${p.hg}${p.ot ? " OT" : ""}</td><td class="n ${right ? "up" : "down"}">${right ? "✓" : "✗"}</td></tr>`;
  }).join("");
  const body = `<section class="hero"><div>
      <p class="eyebrow">Game predictor · updates live during games</p>
      <h1>NHL predictions</h1>
      <p class="lede">Win chances, projected scores, overtime odds and likely goal scorers for every game, from team ratings, the starting goalie, home ice and rest. Once a game starts, the odds move with the score, the clock, power plays and pulled goalies.</p>
    </div></section>
    <div class="rec-tiles" id="record">
      <div class="tile-stat"><b>${R.right}–${R.n - R.right}</b><span>Season picks (${P(R.acc, 1)})</span></div>
      <div class="tile-stat"><b>${R.last7.right}–${R.last7.n - R.last7.right}</b><span>Last 7 days</span></div>
      <div class="tile-stat"><b>${R.logLoss.toFixed(3)}</b><span>Log loss (home-team baseline ${R.baseline.toFixed(3)}; lower is better)</span></div>
      <div class="tile-stat"><b>${P(R.homeRate, 1)}</b><span>Home teams' win rate this season</span></div>
    </div>
    ${tonight.length ? `<h2 class="section-h">${esc(fmtDate(today, { weekday: "long", month: "short", day: "numeric" }))}</h2><div class="games pred-grid">${byDay[today].map(card).join("")}</div>` : ""}
    ${later.map((d) => `<h2 class="section-h">${esc(fmtDate(d, { weekday: "long", month: "short", day: "numeric" }))}</h2><div class="card pred-list">${byDay[d].map(row).join("")}</div>`).join("")}
    <div class="gc-grid" style="margin-top:20px">
      <section class="card"><h2>Is it any good?</h2>
        <p>Every game this season was predicted using only the games before it, so this is the record it would have had. Hockey is close to a coin flip: even betting markets pick only around 60% of winners.</p>
        <table class="tbl compact"><thead><tr><th>Favourite's chance</th><th class="n">Games</th><th class="n">Predicted</th><th class="n">Favourite won</th></tr></thead><tbody>${R.bands.map(band).join("")}</tbody></table>
        <p class="src-note">When the predicted and actual columns match, the percentages mean what they say. The backtest uses each game's actual starting goalies; tonight's picks use the confirmed or projected starter.</p>
      </section>
      <section class="card"><h2>Recent picks</h2><div class="table-wrap"><table class="tbl compact"><thead><tr><th>Date</th><th>Game</th><th>Pick</th><th class="n">Final</th><th class="n"></th></tr></thead><tbody>${recent}</tbody></table></div></section>
    </div>
    <section class="card" style="margin-top:20px"><h2>How it works</h2>
      <ul class="plain">
        <li><b>Team ratings.</b> Attack and defence from goals, shots and expected goals (xG). xG is our own shot-quality model: the chance each shot scores, from its distance, angle, type, and whether it came off a rebound or a rush, fitted on over 100,000 NHL shots. Recent games count more: each game weighs 10% less than the one after it. Last season fills in early on.</li>
        <li><b>Goalies.</b> Goaltending is taken out of team defence and put back for tonight's starter, rated on goals saved above expected (goals allowed vs the xG of the shots they faced), this season and half of last, pulled toward average. The starter is the same confirmed or projected one shown across the site, with its source.</li>
        <li><b>Lineups.</b> Every skater gets a value from their production (individual xG, goals and assists) and ice time per game, recent games weighted more. Tonight's lineup (the reported lines, or last game's, with injured players removed) is compared with the team's usual group, and a weaker or stronger lineup moves its expected goals.</li>
        <li><b>Home ice and rest.</b> Home teams score about 4% more. The second night of a back-to-back costs about 8%.</li>
        <li><b>From goals to wins.</b> Each team's goals are modelled as a Poisson count, with extra weight on regulation ties so about 23% of games go to overtime, as in the NHL. Overtime is 3-on-3 then a shootout, which is close to a coin flip.</li>
        <li><b>Live.</b> From the current score, it plays out only the time left. Power-play time and late-game pulled goalies raise scoring rates. The gamecenter chart shows how the chances moved, goal by goal.</li>
        <li><b>Tuned on 2024-25 and 2025-26</b> (2,624 games), with every game predicted from earlier games only, then checked on this season, which it was never tuned on.</li>
      </ul>
    </section>`;
  return page({ site: ctx.site, title: "NHL predictions: win chances for every game, live", description: "NHL game predictions: win probability, projected score, overtime odds and likely goal scorers for every game, updating live during games.", path: "/predictions/", active: "/predictions/", body, scripts: ["/assets/predict.js#module"] });
}
