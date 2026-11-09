// World Juniors forecast pages: tournament odds, win probability for every game, the mock bracket, team forecasts.
import { esc, attr, localTime, page } from "./html.mjs";

const pc = (x, d = 0) => (x > 0 && x < 0.005 && d === 0 ? "<1%" : `${(x * 100).toFixed(d)}%`);
const lc = (c) => c.toLowerCase();
const byCode = (cfg) => Object.fromEntries(cfg.teams.map((t) => [t.code, t]));
const tl = (T, c, { link = true } = {}) => (c ? `${link ? `<a href="/wjc/${lc(c)}/">` : ""}<span class="flag">${T[c].flag}</span> ${esc(T[c].name)}${link ? "</a>" : ""}` : `<span class="muted">TBD</span>`);

/** Two-sided win-probability bar. */
function bar(pa, a, b, T) {
  const ca = "var(--wjc-a, #3b82f6)", cb = "var(--wjc-b, #ef4444)";
  return `<span class="wb" role="img" aria-label="${attr(`${T[a].name} ${pc(pa)}, ${T[b].name} ${pc(1 - pa)}`)}"><b class="wb-p">${pc(pa)}</b><span class="wb-t"><i style="width:${(pa * 100).toFixed(1)}%;background:${ca}"></i><i style="width:${((1 - pa) * 100).toFixed(1)}%;background:${cb}"></i></span><b class="wb-p">${pc(1 - pa)}</b></span>`;
}

/** Every game: date, teams, win probability, projected score, overtime chance. Played games show the result. */
export function gamesTable(ctx, { focus = null } = {}) {
  const { cfg, forecast: F } = ctx.wjc, T = byCode(cfg), B = F.bracket;
  const proj = { 21: B.relegation, 22: B.qf[0], 23: B.qf[1], 24: B.qf[2], 25: B.qf[3], 26: B.sf[0], 27: B.sf[1], 28: B.bronze, 29: B.final };
  const rows = cfg.schedule.filter((g) => !focus || g.a === focus || g.b === focus || !g.a).map((g) => {
    const f = F.games[g.n], pj = proj[g.n];
    if (f) {
      const res = f.result;
      const mid = res ? `<b class="wscore">${res.a}–${res.b}${res.ot ? ` ${esc(res.ot)}` : ""}</b>` : bar(f.pa, g.a, g.b, T);
      const sub = res ? `<span class="muted small">Final</span>` : `<span class="muted small">Projected ${f.la.toFixed(1)}–${f.lb.toFixed(1)} · OT ${pc(f.ot)}</span>`;
      return `<tr><td>${localTime(g.utc, "datetime")}</td><td class="muted">${esc(g.round.replace("Group ", "Gp "))}</td><td class="wg">${tl(T, g.a)}<span class="muted"> vs </span>${tl(T, g.b)}</td><td class="wp-cell">${mid}${sub}</td></tr>`;
    }
    const lbl = pj ? `<span class="muted small">Projected matchup: ${tl(T, pj.a, { link: false })} vs ${tl(T, pj.b, { link: false })}</span>` : "";
    const mid = pj ? bar(pj.pa, pj.a, pj.b, T) : `<span class="muted">Set after the group stage</span>`;
    return `<tr class="tbd"><td>${localTime(g.utc, "datetime")}</td><td class="muted">${esc(g.round)}</td><td class="wg">${lbl || '<span class="muted">TBD</span>'}</td><td class="wp-cell">${mid}</td></tr>`;
  }).join("");
  return `<div class="table-wrap"><table class="tbl wjc-games"><thead><tr><th>When</th><th>Round</th><th>Game</th><th>Win chance</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** The tournament odds table for all ten teams. */
export function oddsTable(ctx) {
  const { cfg, forecast: F } = ctx.wjc, T = byCode(cfg);
  const rows = Object.values(F.odds).sort((a, b) => b.gold - a.gold || b.medal - a.medal);
  const max = Math.max(...rows.map((o) => o.gold), 0.01);
  const body = rows.map((o) => `<tr>
    <td><a class="team-cell" href="/wjc/${lc(o.code)}/"><span class="flag">${T[o.code].flag}</span><b>${esc(T[o.code].name)}</b></a></td>
    <td class="n muted">${o.group}</td>
    <td class="n" title="Rating: ${o.prior >= 0 ? "+" : ""}${o.prior} from past results and public projections, ${o.roster >= 0 ? "+" : ""}${o.roster} from the projected lineup. Goals per game vs an average team.">${o.rating >= 0 ? "+" : ""}${o.rating.toFixed(2)}</td>
    <td class="n">${pc(o.winGroup)}</td><td class="n">${pc(o.qf)}</td><td class="n">${pc(o.sf)}</td><td class="n">${pc(o.final)}</td>
    <td class="n gold-cell"><span class="gold-bar"><i style="width:${(o.gold / max) * 100}%"></i></span><b>${pc(o.gold, 1)}</b></td>
    <td class="n">${pc(o.medal)}</td><td class="n ${o.rel >= 0.15 ? "down" : "muted"}">${pc(o.rel)}</td></tr>`).join("");
  return `<div class="table-wrap"><table class="tbl sortable compact wjc-odds"><thead><tr><th>Team</th><th class="n">Gp</th><th class="n" title="Goals per game vs an average team">Rating</th><th class="n">Win group</th><th class="n">Quarters</th><th class="n">Semis</th><th class="n">Final</th><th class="n">Gold</th><th class="n">Medal</th><th class="n" title="Finishing fifth in the group and losing the relegation game">Relegated</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

const matchCard = (T, m, tag) => {
  const row = (c, p, seed) => `<div class="bk-t${m.win === c ? " win" : ""}"><span class="bk-s">${seed ?? ""}</span><span class="flag">${T[c].flag}</span><b>${esc(T[c].name)}</b><em>${pc(p)}</em></div>`;
  return `<div class="bk-m"><div class="bk-h"><span>${esc(m.label)}</span><span class="muted">${m.la}–${m.lb}</span></div>${row(m.a, m.pa, tag?.[0])}${row(m.b, 1 - m.pa, tag?.[1])}</div>`;
};

/** /wjc/bracket/: the mock bracket, the likeliest matchups, and group finish odds. */
export function bracketPage(ctx) {
  const { cfg, forecast: F } = ctx.wjc, T = byCode(cfg), B = F.bracket;
  const seed = { qf: [["A1", "B4"], ["B2", "A3"], ["B1", "A4"], ["A2", "B3"]] };
  const title = (c) => `<span class="flag">${T[c].flag}</span> <b>${esc(T[c].name)}</b>`;
  const slotList = (key, label) => `<div class="slot"><h4>${esc(label)}</h4>${(F.slots[key] ?? []).map((s) => `<div class="slot-row">${title(s.pair[0])} <span class="muted">vs</span> ${title(s.pair[1])}<em>${pc(s.p)}</em></div>`).join("")}</div>`;
  const groupTbl = (g) => {
    const ts = Object.values(F.odds).filter((o) => o.group === g).sort((a, b) => b.pts - a.pts);
    return `<section class="card"><h2>Group ${g} <span class="muted small">${g === "A" ? "Red Deer" : "Edmonton"} · projected finish</span></h2>
      <div class="table-wrap"><table class="tbl compact"><thead><tr><th>Team</th><th class="n">Proj. pts</th>${[1, 2, 3, 4, 5].map((i) => `<th class="n">${i}${["st", "nd", "rd", "th", "th"][i - 1]}</th>`).join("")}</tr></thead><tbody>
      ${ts.map((o) => `<tr><td>${tl(T, o.code)}</td><td class="n"><b>${o.pts.toFixed(1)}</b></td>${o.rank.map((p, i) => `<td class="n heat" style="--h:${Math.min(1, p * 1.4).toFixed(2)}">${pc(p)}${i === 3 ? "" : ""}</td>`).join("")}</tr>`).join("")}
      </tbody></table></div></section>`;
  };
  const champ = Object.values(F.odds).sort((a, b) => b.gold - a.gold).slice(0, 5);
  const body = `<section class="hero wjc-hero"><div><p class="eyebrow"><a href="/wjc/">${esc(cfg.name)}</a> · mock bracket</p><h1>Projected World Juniors bracket</h1>
    <p class="lede">We play the whole tournament ${F.sims.toLocaleString()} times from team ratings built on recent results, public roster projections and each team's projected lineup. This bracket seeds every group by its average finish and takes the favourite in each game. The odds below show how often each result really happens.</p></div></section>
  <div class="rec-tiles"><div class="tile-stat"><b>${T[B.champion].flag} ${esc(T[B.champion].name)}</b><span>Projected gold · ${pc(F.odds[B.champion].gold)} to win it</span></div>
    <div class="tile-stat"><b>${T[B.silver].flag} ${esc(T[B.silver].name)}</b><span>Projected silver</span></div>
    <div class="tile-stat"><b>${T[B.bronzeWinner].flag} ${esc(T[B.bronzeWinner].name)}</b><span>Projected bronze</span></div>
    <div class="tile-stat"><b>${T[B.relegation.a === B.relegation.win ? B.relegation.b : B.relegation.a].flag} ${esc(T[B.relegation.a === B.relegation.win ? B.relegation.b : B.relegation.a].name)}</b><span>Projected relegation</span></div></div>
  <section class="card bk-card"><h2>Mock bracket <span class="muted small">favourite advances · win chance in each game</span></h2>
    <div class="bk">
      <div class="bk-col"><h3>Quarterfinals</h3>${B.qf.map((m, i) => matchCard(T, m, seed.qf[i])).join("")}</div>
      <div class="bk-col mid"><h3>Semifinals</h3>${B.sf.map((m) => matchCard(T, m)).join("")}</div>
      <div class="bk-col end"><h3>Gold medal</h3>${matchCard(T, B.final)}<h3 class="sub">Bronze medal</h3>${matchCard(T, B.bronze)}<h3 class="sub">Relegation game</h3>${matchCard(T, B.relegation, ["5A", "5B"])}</div>
    </div>
    <p class="src-note">Quarterfinals follow the usual IIHF pairings (A1–B4, B2–A3, B1–A4, A2–B3); the schedule doesn't say which game is which, so the order is our assumption. The two fifth-place teams play one relegation game on Jan 2.</p></section>
  <h2 class="section-h">Who wins gold</h2>
  <section class="card">${champ.map((o) => `<div class="odds-bar"><span class="flag">${T[o.code].flag}</span><span class="ob-name">${esc(T[o.code].name)}</span><span class="ob-track"><span style="width:${(o.gold / champ[0].gold) * 100}%"></span></span><b>${pc(o.gold, 1)}</b></div>`).join("")}</section>
  <h2 class="section-h">Tournament odds</h2><section class="card">${oddsTable(ctx)}</section>
  <div class="gc-grid" style="margin-top:20px">${groupTbl("A")}${groupTbl("B")}</div>
  <h2 class="section-h">Likeliest matchups</h2>
  <section class="card"><div class="slots">${["QF1", "QF2", "QF3", "QF4", "SF1", "SF2", "Final", "Bronze"].map((k) => slotList(k, { QF1: "Quarterfinal 1 (A1–B4)", QF2: "Quarterfinal 2 (B2–A3)", QF3: "Quarterfinal 3 (B1–A4)", QF4: "Quarterfinal 4 (A2–B3)", SF1: "Semifinal 1", SF2: "Semifinal 2", Final: "Gold medal game", Bronze: "Bronze medal game" }[k])).join("")}</div></section>
  <h2 class="section-h">All games</h2><section class="card">${gamesTable(ctx)}</section>
  <section class="card" style="margin-top:20px"><h2>How the forecast works</h2><ul class="plain">
    <li><b>Ratings.</b> Each team's rating is goals per game against an average team. It starts from our read of recent World Junior results and public roster projections (Canada is ${esc("\"the deepest team in the tournament\"")} per Daily Faceoff's Nov 4 projection), then moves up or down with the strength of the team's projected lineup: forwards, defence and goalie, scored from league-adjusted production and draft pedigree.</li>
    <li><b>Each game.</b> Both teams' goals are Poisson counts set by the rating gap, about ${F.T} goals a game in total. Ties after regulation go to overtime and a shootout, which favour the better team only slightly. Wins are worth 3 points in regulation, 2 in overtime or a shootout, and 1 for an overtime loss.</li>
    <li><b>The tournament.</b> Round robin in two groups of five, then the top four from each group go to the quarterfinals and the fifth-place teams play one relegation game. Ties in the standings break on goal difference, then goals for.</li>
    <li><b>Lines.</b> Canada and USA use Steven Ellis's Daily Faceoff projections (Nov 4 and 5); Sweden's forwards use The Hockey News' January projection. Other teams use our own pool model. Official rosters replace all of it when federations announce them.</li>
    <li><b>Updating.</b> Rosters, ratings and results feed the simulation on every rebuild. As games finish, results are added and the rest of the tournament is simulated from there.</li></ul>
    <p class="muted small">This is a forecast, not a betting line: junior hockey is volatile and rosters are not set. Ratings are in <code>config/wjc/ratings.json</code>.</p></section>`;
  return page({ site: ctx.site, title: "World Juniors 2027 mock bracket and predictions", description: "Projected 2027 World Juniors bracket: win probability for every game, medal and relegation odds for all ten teams from 20,000 simulated tournaments.", path: "/wjc/bracket/", active: "/wjc/", body });
}

/** A team page's forecast card. */
export function teamForecast(ctx, t) {
  const { cfg, forecast: F } = ctx.wjc, T = byCode(cfg), o = F.odds[t.code];
  const rank = o.rank;
  const stat = (k, v) => `<div class="tile-stat"><b>${v}</b><span>${k}</span></div>`;
  return `<section class="card card-accent"><h2>${esc(t.name)} tournament forecast</h2>
    <div class="rec-tiles">${stat("Gold", pc(o.gold, 1))}${stat("Medal", pc(o.medal))}${stat("Reach semis", pc(o.sf))}${stat(o.rel >= 0.05 ? "Relegation risk" : "Win group", o.rel >= 0.05 ? pc(o.rel) : pc(o.winGroup))}</div>
    <h3>Group ${t.group} finish</h3><div class="finish">${rank.map((p, i) => `<div class="fin" title="${i + 1}${["st", "nd", "rd", "th", "th"][i]} place: ${pc(p, 1)}"><i style="height:${Math.max(3, p * 100)}%"></i><span>${i + 1}</span><em>${pc(p)}</em></div>`).join("")}</div>
    <h3>Rating</h3><p class="muted small">${o.rating >= 0 ? "+" : ""}${o.rating.toFixed(2)} goals per game vs an average team: ${o.prior >= 0 ? "+" : ""}${o.prior.toFixed(2)} from past results and public projections, ${o.roster >= 0 ? "+" : ""}${o.roster.toFixed(2)} from the projected lineup (${Math.round(o.complete * 100)}% of the lineup known).</p>
    <h3>Games</h3>${gamesTable(ctx, { focus: t.code })}
    <p class="muted small"><a href="/wjc/bracket/">Full mock bracket and tournament odds →</a></p></section>`;
}
