// Every finished regular-season game of a season as a compact log row, for the game predictor's ratings and backtest.
// Box scores of finished games are cached for good, so only the first build pays for them.
import fs from "node:fs";
import path from "node:path";
import { get, pool } from "./http.mjs";
import { gameXg, playerGame } from "./xg.mjs";
import { CONFIG } from "./paths.mjs";

const XG = JSON.parse(fs.readFileSync(path.join(CONFIG, "xg-model.json"), "utf8")).w;

const WEB = "https://api-web.nhle.com/v1";
const FINAL = new Set(["OFF", "FINAL"]);

/** → [{ id, date, home, away, hg, ag, ot, so, hs, as, hG, aG: { id, sa, sv } }] sorted by date. Goals exclude the shootout. */
export async function seasonLog(teams, seasonId, { boxes = true } = {}) {
  const seen = new Map();
  await pool(teams, 6, async (abbr) => {
    const s = await get(`${WEB}/club-schedule-season/${abbr}/${seasonId}`, { ttl: 1800 });
    for (const g of s?.games ?? []) if (g.gameType === 2 && FINAL.has(g.gameState)) seen.set(g.id, g);
  });
  const games = [...seen.values()].sort((a, b) => a.id - b.id);
  const rows = await pool(games, 8, async (g) => {
    const last = g.gameOutcome?.lastPeriodType;
    let hg = g.homeTeam.score, ag = g.awayTeam.score;
    if (last === "SO") { if (hg > ag) hg--; else ag--; } // the shootout "goal" isn't a goal
    const row = { id: g.id, date: g.gameDate, home: g.homeTeam.abbrev, away: g.awayTeam.abbrev, hg, ag, homeWon: g.homeTeam.score > g.awayTeam.score, ot: last === "OT", so: last === "SO" };
    if (!boxes) return row;
    const b = await get(`${WEB}/gamecenter/${g.id}/boxscore`, { ttl: Infinity });
    if (!b) return row;
    row.hs = b.homeTeam?.sog ?? null; row.as = b.awayTeam?.sog ?? null;
    const starter = (side) => {
      const gs = b.playerByGameStats?.[side]?.goalies ?? [];
      const s = gs.find((x) => x.starter) ?? [...gs].sort((x, y) => (y.shotsAgainst ?? 0) - (x.shotsAgainst ?? 0))[0];
      return s ? { id: s.playerId, sa: gs.reduce((t, x) => t + (x.shotsAgainst ?? 0), 0), ga: gs.reduce((t, x) => t + (x.goalsAgainst ?? 0), 0), all: gs.map((x) => ({ id: x.playerId, sa: x.shotsAgainst ?? 0, ga: x.goalsAgainst ?? 0 })) } : null;
    };
    row.hG = starter("homeTeam"); row.aG = starter("awayTeam");
    const pbp = await get(`${WEB}/gamecenter/${g.id}/play-by-play`, { ttl: Infinity });
    if (pbp) { const x = gameXg(XG, pbp); row.hx = x.h.xg; row.ax = x.a.xg; row.hx5 = x.h.xg5; row.ax5 = x.a.xg5; row.hf = x.h.ff; row.af = x.a.ff; row.gx = x.goalies; }
    // Dressed skaters with ice time and production: [id, isD, toiSec, ixG, goals, primary A, secondary A].
    const prod = pbp ? playerGame(XG, pbp) : {};
    const toi = (t) => { const [m, s] = String(t ?? "0:0").split(":").map(Number); return m * 60 + s; };
    const sk = (side) => ["forwards", "defense"].flatMap((grp) => (b.playerByGameStats?.[side]?.[grp] ?? []).map((p) => { const q = prod[p.playerId] ?? { x: 0, g: 0, a1: 0, a2: 0 }; return [p.playerId, grp === "defense" ? 1 : 0, toi(p.toi), +q.x.toFixed(3), q.g, q.a1, q.a2]; }));
    row.hP = sk("homeTeam"); row.aP = sk("awayTeam");
    return row;
  });
  return rows;
}
