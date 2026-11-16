// Fetches the league's skater and goalie rows (plus which are rookies) and runs the awards model.
import { get } from "./http.mjs";
import { awardRaces } from "../../public/assets/awardsmodel.js";

const API = "https://api.nhle.com/stats/rest/en";
const q = (seasonId, extra = "") => `limit=-1&cayenneExp=seasonId=${seasonId}%20and%20gameTypeId=2${extra}`;

export async function loadAwards(league, rosterStats) {
  const s = league.seasonId;
  const [sk, gk, rsk, rgk] = await Promise.all([
    get(`${API}/skater/summary?${q(s)}`, { ttl: 300 }),
    get(`${API}/goalie/summary?${q(s)}`, { ttl: 300 }),
    get(`${API}/skater/summary?${q(s, "%20and%20isRookie=1")}`, { ttl: 300 }),
    get(`${API}/goalie/summary?${q(s, "%20and%20isRookie=1")}`, { ttl: 300 }),
  ]).catch(() => []);
  if (!sk?.data?.length) return null;
  const rs = new Set((rsk?.data ?? []).map((r) => r.playerId)), rg = new Set((rgk?.data ?? []).map((r) => r.playerId));
  const skaters = sk.data.map((r) => {
    const a = rosterStats?.skaters?.[r.playerId];
    return { ...r, isRookie: rs.has(r.playerId), adv: a ? { satRelative: a.percentages?.satRelative ?? null, takeaways: a.realtime?.takeaways ?? 0 } : null };
  });
  const goalies = (gk?.data ?? []).map((r) => ({ ...r, isRookie: rg.has(r.playerId) }));
  const teams = Object.fromEntries(Object.values(league.teams ?? {}).map((t) => [t.abbrev, { gp: t.gp, pts: t.pts, ptsPct: t.ptsPct, rw: t.rw, ga: t.ga }]));
  return { ...awardRaces({ skaters, goalies, teams }), builtAt: new Date().toISOString() };
}
