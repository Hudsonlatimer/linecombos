// Head coaches (from the NHL's own game feed, so a mid-season firing shows up) and last season's final standings.
// Full staffs aren't published by the NHL; config/staff.json holds any extra staff someone has supplied.
import fs from "node:fs";
import { get } from "./http.mjs";
import { FINAL } from "./nhl.mjs";

const WEB = "https://api-web.nhle.com/v1";
const coachOf = async (g, abbrev) => {
  const rr = await get(`${WEB}/gamecenter/${g.id}/right-rail`, { ttl: Infinity });
  const side = g.homeTeam?.abbrev === abbrev ? rr?.gameInfo?.homeTeam : rr?.gameInfo?.awayTeam;
  return side?.headCoach?.default ?? null;
};

/** → { coaches: { ABBR: { name, midSeason, games } }, lastSeason: { ABBR: pointPctg } } */
export async function loadCoaches(league, schedules, lastDate = "2026-04-16") {
  const coaches = {};
  await Promise.all(Object.entries(schedules).map(async ([abbrev, list]) => {
    const done = list.filter((g) => g.gameType === 2 && FINAL.has(g.gameState));
    if (!done.length) return;
    const [now, first] = await Promise.all([coachOf(done.at(-1), abbrev), coachOf(done[0], abbrev)]);
    if (now) coaches[abbrev] = { name: now, midSeason: !!first && first !== now, games: done.length };
  }));
  const prev = await get(`${WEB}/standings/${lastDate}`, { ttl: Infinity }).catch(() => null);
  const lastSeason = Object.fromEntries((prev?.standings ?? []).map((t) => [t.teamAbbrev.default, t.pointPctg]));
  let staff = {};
  try { staff = JSON.parse(fs.readFileSync(new URL("../../config/staff.json", import.meta.url), "utf8")); } catch {}
  return { coaches, lastSeason, staff };
}
