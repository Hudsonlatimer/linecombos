// Compares each game's scoreboard to the goals the game builder extracts: node scripts/goalcheck.mjs [YYYY-MM-DD]
import { gameJson } from "../src/core/game.mjs";
const date = process.argv[2] ?? new Date(Date.now() - 864e5).toISOString().slice(0, 10);
const j = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const sc = await j(`https://api-web.nhle.com/v1/score/${date}`);
let bad = 0;
for (const g of sc?.games ?? []) {
  const [box, pbp, sh] = await Promise.all([j(`https://api-web.nhle.com/v1/gamecenter/${g.id}/boxscore`), j(`https://api-web.nhle.com/v1/gamecenter/${g.id}/play-by-play`), j(`https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId=${g.id}`)]);
  let out;
  try { out = gameJson({ box, pbp, shifts: sh?.data ?? [] }); } catch (e) { console.log(g.id, g.awayTeam.abbrev, "@", g.homeTeam.abbrev, "THROWS", e.message); bad++; continue; }
  const total = (g.awayTeam.score ?? 0) + (g.homeTeam.score ?? 0), found = (out.goals ?? []).filter((x) => x.str !== "SO").length;
  const so = g.gameOutcome?.lastPeriodType === "SO" ? 1 : 0;
  const pbpGoals = (pbp?.plays ?? []).filter((p) => p.typeDescKey === "goal").length;
  const ok = found === total - so;
  if (!ok) bad++;
  console.log(ok ? "ok " : "BAD", g.id, `${g.awayTeam.abbrev} ${g.awayTeam.score}-${g.homeTeam.score} ${g.homeTeam.abbrev}`, g.gameState, `scoreboard ${total - so} · extracted ${found} · pbp goal plays ${pbpGoals} · shifts ${sh?.data?.length ?? "none"}`);
}
console.log(bad ? `${bad} game(s) with missing goals` : "all games match");
