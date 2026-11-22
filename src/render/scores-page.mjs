// /scores/: a live scoreboard for any date. The page is a shell; /assets/scores.js fills it from the NHL score feed
// (proxied at /live/score/:date/) and keeps it live, with win chances from data/predictions.json.
import { esc, page } from "./html.mjs";

export function scoresPage(ctx) {
  const teams = Object.fromEntries(Object.values(ctx.T).map((t) => [t.abbrev, { n: t.common, full: t.name, url: `/nhl/${t.slug}/`, rec: t.record ?? `${t.w}-${t.l}-${t.otl}`, logo: t.logo, dark: t.logoDark ?? t.logo, c: t.accent ?? t.color ?? "" }]));
  const body = `
  <div class="sb-top">
    <div><p class="eyebrow">Live scoreboard</p><h1 id="sb-title">Scores</h1><p class="lede" id="sb-sub">Every game, live: score, clock, shots, power plays, every goal and the live chance to win.</p></div>
    <div class="sb-nav" role="group" aria-label="Choose a date">
      <button class="btn-sm" type="button" data-step="-1" aria-label="Previous day">← Prev</button>
      <button class="btn-sm" type="button" data-step="0">Today</button>
      <button class="btn-sm" type="button" data-step="1" aria-label="Next day">Next →</button>
      <input type="date" id="sb-date" aria-label="Pick a date">
    </div>
  </div>
  <div class="sb-days" id="sb-days" aria-label="Days"></div>
  <div class="sb-sum" id="sb-sum" aria-live="polite"></div>
  <div class="sb-grid" id="sb-grid"><div class="sb-skel"></div><div class="sb-skel"></div><div class="sb-skel"></div></div>
  <noscript><p class="empty">The scoreboard needs JavaScript. <a href="/schedule/">See the schedule</a>.</p></noscript>`;
  return page({
    site: ctx.site, title: "NHL scores, live", path: "/scores/", active: "/scores/", body,
    description: "Live NHL scores for every game: clock, shots, power plays, every goal and live win chances, for today or any date.",
    json: { today: ctx.league.today, teams }, scripts: ["/assets/scores.js#module"],
  });
}
export const _esc = esc;
