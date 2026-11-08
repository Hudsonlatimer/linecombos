// The next NHL draft class: every first-time-eligible (undrafted) skater and goalie in the OHL, WHL, QMJHL and USHL,
// from the leagues' public HockeyTech stat feeds (the same feeds their own websites use), ranked by a stats index,
// with NHL Central Scouting's preliminary watch-list grades merged in where published.
import fs from "node:fs/promises";
import path from "node:path";
import { get, pool } from "./http.mjs";
import { CONFIG } from "./paths.mjs";
import { normName } from "./moves.mjs";

const LEAGUES = [
  { code: "OHL", client: "ohl", key: "f1aa699db3d81487", weight: 1.0 },
  { code: "WHL", client: "whl", key: "41b145a848f4bd67", weight: 1.0 },
  { code: "QMJHL", client: "lhjmq", key: "f322673b6bcae299", weight: 0.93 },
  { code: "USHL", client: "ushl", key: "e828f89b243dc43f", weight: 0.88 },
];
const teamName = (s) => String(s ?? "").replace(/,\s*/, " ");
/** Every feed writes height differently ("6.03", "6'01\"", "5'10.", "6'2.5"): normalise to 6'3". */
export const fmtHeight = (h) => {
  const m = String(h ?? "").match(/^\s*(\d)\s*['.\s"]\s*(\d{1,2}(?:\.\d+)?)?/);
  if (!m) return "";
  const inch = m[2] ? +(+m[2]).toFixed(1) : 0;
  return inch < 12 ? `${m[1]}'${inch}"` : "";
};
const FEED = "https://lscluster.hockeytech.com/feed/";
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const iso = (s) => { const m = String(s ?? "").match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})/) ?? String(s ?? "").match(/^(\d{4})-(\d\d)-(\d\d)/); if (!m) return null; return m[0].includes("-") ? m[0] : `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, "0")}-${m[2].padStart(2, "0")}`; };

/** First-time eligible for the draft held in June of `year`: born Sep 16 (year-19) through Sep 15 (year-18). */
export const eligibleWindow = (year) => [`${year - 19}-09-16`, `${year - 18}-09-15`];

async function seasonsFor(L) {
  const r = await get(`${FEED}?feed=modulekit&view=seasons&key=${L.key}&client_code=${L.client}&fmt=json`, { ttl: 86400 });
  const reg = (r?.SiteKit?.Seasons ?? []).filter((s) => s.career === "1" && s.playoff === "0" && !/pre|exhib|show/i.test(s.season_name));
  return reg.slice(0, 2); // current + last regular season, newest first
}
async function skaters(L, season) {
  // Includes goalies (position G) with birthdates; their save stats come from goalieStats().
  const r = await get(`${FEED}?feed=modulekit&view=statviewtype&type=topscorers&key=${L.key}&client_code=${L.client}&fmt=json&league_id=&season_id=${season}&first=0&limit=2000&qualified=all&sort=points&stat=all`, { ttl: 6 * 3600 });
  return r?.SiteKit?.Statviewtype ?? [];
}
async function goalieStats(L, season) {
  const raw = await get(`${FEED}index.php?feed=statviewfeed&view=players&season=${season}&team=all&position=goalies&rookies=0&statsType=standard&rosterstatus=undefined&site_id=0&first=0&limit=500&sort=gaa&league_id=1&lang=en&division=-1&qualified=all&key=${L.key}&client_code=${L.client}`, { ttl: 6 * 3600, text: true });
  try {
    const j = JSON.parse(String(raw ?? "").trim().replace(/^\(/, "").replace(/\)$/, ""));
    return new Map((j?.[0]?.sections?.[0]?.data ?? []).map((x) => [String(x.row.player_id), x.row]));
  } catch { return new Map(); }
}

export async function draftClass(year) {
  const [from, to] = eligibleWindow(year);
  const css = await fs.readFile(path.join(CONFIG, "draft", `${year}-central-scouting.json`), "utf8").then(JSON.parse).catch(() => ({ players: [] }));
  const cssBy = new Map(css.players.map((p) => [normName(p.name), p]));
  const out = new Map();
  await pool(LEAGUES, 2, async (L) => {
    const seasons = await seasonsFor(L);
    for (const [i, s] of seasons.entries()) {
      const gst = await goalieStats(L, s.season_id);
      for (const p of await skaters(L, s.season_id)) {
        const born = iso(p.birthdate);
        if (!born || born < from || born > to) continue;
        const key = `${normName(`${p.first_name} ${p.last_name}`)}|${born}`; // one row per person, even across leagues
        const gp = +p.games_played || 0;
        const g = p.position === "G";
        const gs = g ? gst.get(String(p.player_id)) : null;
        const line = g
          ? { gp: +(gs?.games_played ?? gp), w: +(gs?.wins ?? 0), gaa: gs ? +gs.goals_against_average : null, sv: gs ? +gs.save_percentage : null, so: +(gs?.shutouts ?? 0), team: teamName(p.team_name), league: L.code }
          : { gp, g: +p.goals || 0, a: +p.assists || 0, p: +p.points || 0, pim: +p.penalty_minutes || 0, pm: +p.plus_minus || 0, team: teamName(p.team_name), league: L.code };
        const row = out.get(key) ?? {
          id: key, name: `${p.first_name} ${p.last_name}`.trim(), first: p.first_name, last: p.last_name, born, league: L.code, lw: L.weight,
          pos: p.position || "", shoots: (g ? p.catches : p.shoots) || "", height: fmtHeight(p.height), weight: p.weight || "",
          team: teamName(p.team_name), from: [p.hometown, p.homeprov, p.homecntry].filter(Boolean).join(", "), now: null, prev: null,
        };
        if (i === 0) { if (!row.now || line.gp > row.now.gp) { row.now = line; row.team = teamName(p.team_name); row.league = L.code; row.lw = L.weight; } }
        else if (!row.prev || line.gp > row.prev.gp) row.prev = line;
        out.set(key, row);
      }
    }
  });
  // One row per person even when the feeds spell a name two ways (Timo/Timothy Kazda, Nikolayev/Nikolaev):
  // same birthdate + same first three letters of the first name + same first four of the last name.
  const vk = (p) => { const [fn = "", ...ln] = normName(p.name).split(" "); return `${p.born}|${fn.slice(0, 3)}|${ln.join("").slice(0, 4)}`; };
  const merged = new Map();
  for (const p of out.values()) {
    const k = vk(p), q = merged.get(k);
    if (!q) { merged.set(k, p); continue; }
    const [keep, drop] = (p.now?.gp ?? -1) > (q.now?.gp ?? -1) ? [p, q] : [q, p];
    if (drop.prev && (!keep.prev || drop.prev.gp > keep.prev.gp)) keep.prev = drop.prev;
    if (!keep.now && drop.now) keep.now = drop.now;
    keep.aliases = [...(keep.aliases ?? []), drop.name];
    merged.set(k, keep);
  }
  const consensus = (css.consensus ?? []).map((c, i) => ({ ...c, rank: i + 1 }));
  const consBy = new Map(consensus.map((c) => [normName(c.name), c]));
  const names = (p) => [p.name, ...(p.aliases ?? [])].map(normName);
  const find = (m, p) => names(p).map((n) => m.get(n)).find(Boolean);

  const list = [];
  for (const p of merged.values()) {
    p.last = p.prev; // previous season (any of the four leagues)
    const c = find(cssBy, p);
    if (c && (!c.league || c.league === p.league || !p.now)) { p.css = c.rating; if (!p.now && c.team) p.nowTeam = `${c.team}${c.league ? ` (${c.league})` : ""}`; }
    const k = find(consBy, p);
    if (k) { p.consensus = k.rank; if (!p.now && k.team) p.nowTeam = `${k.team}${k.league ? ` (${k.league})` : ""}`; }
    // Players who have left these leagues (NCAA, Europe) with no grade or ranking are noise: drop them, and empty stat lines.
    if (!p.now?.gp && !p.css && !p.consensus) continue;
    if (!p.now?.gp && !p.last?.gp) continue;
    list.push(p);
  }
  // Consensus names outside these feeds (NCAA, Europe) still get a row, so the top of the class is complete.
  const seen = new Set(list.flatMap(names));
  for (const k of consensus) {
    if (seen.has(normName(k.name))) continue;
    const c = cssBy.get(normName(k.name));
    list.push({ id: `x|${normName(k.name)}`, name: k.name, pos: k.pos ?? "", born: null, league: "", lw: 1, now: null, last: null, prev: null,
      css: c?.rating, consensus: k.rank, nowTeam: [k.team ?? c?.team, k.league ?? (c?.league !== "International" ? c?.league : null)].filter(Boolean).join(", ") || "Outside the CHL/USHL" });
    seen.add(normName(k.name));
  }

  // Stats index: points per game shrunk hard toward zero on small samples, then league strength, a modest boost for
  // defence (they score less), and age (younger = more upside). Goalies: save % over games played.
  for (const p of list) {
    const ageBonus = p.born ? (Date.parse(p.born) - Date.parse(from)) / (365.25 * 864e5) : 0; // 0 (oldest) .. 1 (youngest)
    if (p.pos === "G") {
      const s = p.now?.gp ? p.now : p.last;
      p.score = s?.sv ? (s.sv - 0.86) * 10 * Math.min(1, s.gp / 15) * p.lw + ageBonus * 0.1 : 0;
    } else if (p.now || p.last) {
      const ppg = (s, shrink) => (s?.gp ? s.p / (s.gp + shrink) : 0);
      const cur = ppg(p.now, 8), prev = ppg(p.last, 10) * 0.85;
      const w = p.now ? Math.min(1, p.now.gp / 25) : 0;
      const base = cur * w + prev * (1 - w);
      p.score = base * p.lw * (/^[LR]?D$/.test(p.pos) ? 1.2 : 1) + ageBonus * 0.1;
    } else p.score = 0;
  }
  // Ranking: the public consensus top of the class first (DuPont is the clear No. 1), then everyone else by the stats
  // index plus a Central Scouting grade bonus, so scouts' grades and production both count.
  const GRADE = { A: 0.9, B: 0.45, C: 0.2, W: 0.05 };
  for (const p of list) p.rankScore = p.score + (GRADE[p.css] ?? 0);
  list.sort((a, b) => (a.consensus ?? 1e9) - (b.consensus ?? 1e9) || b.rankScore - a.rankScore);
  const matched = new Set(list.filter((p) => p.css || p.consensus).flatMap(names));
  return {
    year, from, to, players: list,
    // Central Scouting A-graded players outside these four leagues (NCAA, Europe), which the feeds don't cover.
    elsewhere: css.players.filter((c) => c.rating === "A" && !matched.has(normName(c.name))),
    cssSource: css.source ?? null, consensusSource: css.consensusSource ?? null,
  };
}
