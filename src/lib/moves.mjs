// Injuries, transactions (signings, trades, waivers, call-ups), scratches and player timelines.
// Injuries + transactions: ESPN's public site API (free, no key). Everything else: NHL player pages.
import { get, pool } from "./http.mjs";

const ESPN = "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl";
const HOUR = 3600, DAY = 86400;
const ESPN_ABBR = { TB: "TBL", NJ: "NJD", SJ: "SJS", LA: "LAK", UTAH: "UTA", MON: "MTL" };
export const fixAbbr = (a) => ESPN_ABBR[a] ?? a;
export const normName = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();

// ---------- injuries ----------
export async function injuries(teams, rosters) {
  const r = await get(`${ESPN}/injuries`, { ttl: 30 * 60 });
  const teamBy = Object.fromEntries(teams.map((t) => [normName(t.name), t.abbrev]));
  const out = [];
  for (const grp of r?.injuries ?? []) {
    const abbr = teamBy[normName(grp.displayName)] ?? fixAbbr(grp.injuries?.[0]?.athlete?.team?.abbreviation);
    const roster = rosters[abbr] ?? [];
    for (const i of grp.injuries ?? []) {
      const full = normName(`${i.athlete.firstName} ${i.athlete.lastName}`), last = normName(i.athlete.lastName);
      let p = roster.find((x) => normName(`${x.first} ${x.last}`) === full);
      if (!p) { const byLast = roster.filter((x) => normName(x.last) === last); if (byLast.length === 1) p = byLast[0]; }
      out.push({
        id: p?.id ?? null, team: abbr, name: i.athlete.displayName, pos: i.athlete.position?.abbreviation ?? p?.pos ?? "",
        status: i.status, date: i.date, short: i.shortComment ?? "", long: i.longComment ?? "",
        body: (i.shortComment?.match(/\(([^)]+)\)/) ?? [])[1] ?? "", returnDate: i.details?.returnDate ?? null,
      });
    }
  }
  // Long-term injured players often drop off the "current" roster: find them through NHL player search.
  const { searchPlayer } = await import("./nhl.mjs");
  await pool(out.filter((i) => !i.id), 6, async (i) => {
    const hit = await searchPlayer(i.name);
    if (hit && (!hit.teamAbbrev || hit.teamAbbrev === i.team)) i.id = Number(hit.playerId);
  });
  return out.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

// ---------- transactions ----------
const VERBS = "Signed|Re-signed|Recalled|Assigned|Reassigned|Placed|Activated|Reinstated|Claimed|Traded|Acquired|Loaned|Released|Waived|Named|Agreed|Returned|Suspended|Fined|Terminated|Retired|Announced|Promoted|Sent|Called|Purchased|Designated|Exercised|Bought|Mutually|Removed|Transferred";
const SPLIT = new RegExp(`\\.\\s+(?=(?:${VERBS})\\b)`);

export function txKind(s) {
  if (/\btraded\b|\bacquired\b|in exchange/i.test(s)) return "trade";
  if (/\b(re-)?signed\b|agreed to terms/i.test(s)) return "sign";
  if (/\bclaimed\b|\bwaivers\b|\bwaived\b/i.test(s)) return "waivers";
  if (/injured reserve|\bltir\b|\bIR\b/i.test(s)) return /activated|reinstated|returned/i.test(s) ? "return" : "injury";
  if (/\brecalled\b|called up|\bpromoted\b/i.test(s)) return "recall";
  if (/assigned|loaned|\bsent\b/i.test(s)) return "assign";
  if (/suspend/i.test(s)) return "suspension";
  if (/retire/i.test(s)) return "retire";
  if (/released|terminated|buy-?out|bought out|unconditional/i.test(s)) return "release";
  if (/activated|reinstated/i.test(s)) return "return";
  return "other";
}
export const TX_LABEL = { trade: "Trade", sign: "Signing", waivers: "Waivers", injury: "Injured reserve", return: "Activated", recall: "Recalled", assign: "Assigned", suspension: "Suspension", retire: "Retired", release: "Released", other: "Move" };

export async function transactions(fromYear = 2014) {
  const now = new Date().getUTCFullYear();
  const years = Array.from({ length: now - fromYear + 1 }, (_, i) => fromYear + i);
  const all = [];
  await pool(years, 4, async (y) => {
    const ttl = y === now ? 2 * HOUR : y === now - 1 ? 7 * DAY : Infinity;
    for (let page = 1; page <= 6; page++) {
      const r = await get(`${ESPN}/transactions?limit=1000&season=${y}&page=${page}`, { ttl });
      for (const t of r?.transactions ?? []) all.push({ date: t.date.slice(0, 10), team: fixAbbr(t.team?.abbreviation ?? ""), text: t.description ?? "" });
      if (!r || page >= (r.pageCount ?? 1)) break;
    }
  });
  const seen = new Set();
  return all.filter((t) => { const k = `${t.date}|${t.team}|${t.text}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((t) => ({ ...t, kind: txKind(t.text) }));
}

const POS_GROUP = { f: "F", fs: "F", c: "F", lw: "F", rw: "F", w: "F", cs: "F", d: "D", ds: "D", ld: "D", rd: "D", g: "G", gs: "G" };
const groupOf = (pos) => (pos === "G" ? "G" : pos === "D" ? "D" : "F");

/** Attach transactions to players by name (with position to split same-name players). Returns { id: [tx...] }. */
export function txByPlayer(tx, people) {
  const idx = new Map();
  for (const p of people) {
    const k = normName(`${p.first} ${p.last}`);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(p);
  }
  // Fallback for misspelled first names ("Conner Hellebuyck"): same last name, first name one letter off.
  const byLast = new Map();
  for (const p of people) { const k = normName(p.last); if (!byLast.has(k)) byLast.set(k, []); byLast.get(k).push(p); }
  const near = (a, b) => {
    if (a.length < 4 || Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  };
  const fuzzy = (words, i) => {
    for (const len of [2, 1]) {
      const list = byLast.get(words.slice(i + 1, i + 1 + len).join(" "));
      const hit = list?.filter((p) => near(words[i], normName(p.first)));
      if (hit?.length === 1) return { cands: hit, len: len + 1 };
    }
    return null;
  };
  const out = {};
  for (const t of tx) {
    for (const sentence of t.text.split(SPLIT)) {
      const words = normName(sentence).split(" ");
      for (let i = 0; i < words.length; i++) for (let len = 4; len >= 1; len--) {
        let cands = len > 1 ? idx.get(words.slice(i, i + len).join(" ")) : null;
        if (len === 1) { const f = fuzzy(words, i); if (!f) continue; cands = f.cands; len = f.len; }
        if (!cands) continue;
        let hit = cands;
        if (hit.length > 1) { const g = POS_GROUP[words[i - 1]]; if (g) hit = hit.filter((p) => groupOf(p.pos) === g); }
        if (hit.length !== 1) break;
        const p = hit[0];
        // Ignore matches from before the player could have been signed.
        if (p.birthDate && t.date < `${+p.birthDate.slice(0, 4) + 16}`) break;
        (out[p.id] ??= []);
        if (!(t.ids ??= []).includes(p.id)) t.ids.push(p.id);
        if (!out[p.id].some((x) => x.date === t.date && x.kind === txKind(sentence) && x.kind === "trade")) out[p.id].push({ ...t, kind: txKind(sentence), sentence: sentence.replace(/\.?$/, ".") });
        i += len - 1;
        break;
      }
    }
  }
  return out;
}

// ---------- scratches ----------
/** Roster players who didn't dress in the team's last game, labelled injured or scratched. */
export function scratches(T, rosters, inj) {
  const injured = new Map(inj.filter((i) => i.id).map((i) => [i.id, i]));
  const out = {};
  for (const [abbr, t] of Object.entries(T)) {
    const dressed = new Set(t.last?.dressed ?? []);
    if (!t.last) { out[abbr] = []; continue; }
    out[abbr] = (rosters[abbr] ?? []).filter((p) => p.pos !== "G" && !dressed.has(p.id)).map((p) => ({
      id: p.id, first: p.first, last: p.last, pos: p.pos, num: p.num,
      injury: injured.get(p.id) ?? null,
    }));
  }
  return out;
}

// ---------- player timeline ----------
const INTL = /^(wjc|wc\b|wc-|og\b|olympics|4 nations|wcup|whc|wjac|int'?l|u-?1\d|u-?2\d|hlinka|ivan|5 nations|champions|spengler|euro hockey tour|eht\b)/i;
const seasonLabel = (s) => `${String(s).slice(0, 4)}–${String(s).slice(6, 8)}`;
const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th"}`;

/** Career facts and a dated timeline from an NHL landing page + matched transactions + injuries + posts. */
export function career(landing, { tx = [], injury = null, posts = [], teams = {} } = {}) {
  if (!landing) return null;
  const rows = (landing.seasonTotals ?? []).filter((s) => s.gameTypeId === 2);
  const club = rows.filter((s) => !INTL.test(s.leagueAbbrev ?? ""));
  const intl = rows.filter((s) => INTL.test(s.leagueAbbrev ?? ""));
  const firstNhl = club.find((s) => s.leagueAbbrev === "NHL");
  const preNhl = firstNhl ? club.filter((s) => s.season < firstNhl.season || (s.season === firstNhl.season && s.sequence < firstNhl.sequence)) : club;
  const before = preNhl.at(-1) ?? null;
  const ev = [];
  const push = (sort, when, kind, title, text = "", extra = {}) => ev.push({ sort, when, kind, title, text, ...extra });

  if (landing.birthDate) {
    const where = [landing.birthCity?.default, landing.birthStateProvince?.default, landing.birthCountry].filter(Boolean).join(", ");
    push(landing.birthDate, landing.birthDate, "born", `Born${where ? ` in ${where}` : ""}`);
  }
  // Each new club/league stop.
  let prevKey = "";
  for (const s of club) {
    const key = `${s.teamName?.default}|${s.leagueAbbrev}`;
    if (key === prevKey) continue;
    prevKey = key;
    const y = String(s.season).slice(0, 4);
    const isNhlDebut = s === firstNhl;
    push(`${y}-09-15`, seasonLabel(s.season), isNhlDebut ? "debut" : s.leagueAbbrev === "NHL" ? "team" : "club",
      isNhlDebut ? `NHL debut season with the ${s.teamName.default}` : `${s.leagueAbbrev === "NHL" ? "Joined the" : "Played for"} ${s.teamName.default} (${s.leagueAbbrev})`,
      statLine(s));
  }
const EVENT = { OG: "the Olympics", "WJC-20": "the World Juniors", "WJC-18": "the U18 Worlds", WC: "the World Championship", "4 Nations": "the 4 Nations Face-Off", WCup: "the World Cup", "WJAC-19": "the World Jr. A Challenge", "U-17": "the U17 Challenge", "WHC-17": "the U17 Challenge" };
  for (const s of intl) push(`${String(s.season).slice(0, 4)}-12-31`, seasonLabel(s.season), "intl", `${s.teamName?.default ?? "National team"} at ${EVENT[s.leagueAbbrev] ?? s.leagueAbbrev}`, statLine(s));
  const d = landing.draftDetails;
  if (d) push(`${d.year}-06-27`, String(d.year), "draft", `Drafted ${ordinal(d.overallPick)} overall by ${teams[d.teamAbbrev]?.name ?? d.teamAbbrev}`, `Round ${d.round}, pick ${d.pickInRound}`);
  for (const a of landing.awards ?? []) for (const s of a.seasons ?? []) push(`${String(s.seasonId).slice(4)}-06-20`, seasonLabel(s.seasonId), "award", `Won the ${a.trophy?.default}`, statLine(s));
  for (const t of tx) push(t.date, t.date, t.kind, TX_LABEL[t.kind] ?? "Move", t.sentence ?? t.text, { team: t.team });
  if (injury) push(injury.date.slice(0, 10), injury.date.slice(0, 10), "injury-now", `${injury.status}${injury.body ? ` (${injury.body})` : ""}`, injury.short);
  for (const p of posts) push(p.createdAt.slice(0, 10), p.createdAt.slice(0, 10), "news", `${p.author}`, p.text.slice(0, 220), { url: p.url });
  ev.sort((a, b) => b.sort.localeCompare(a.sort));

  const signings = tx.filter((t) => t.kind === "sign");
  const lastSign = signings[0] ?? null;
  const term = lastSign?.sentence.match(/(one|two|three|four|five|six|seven|eight|\d+)-year/i)?.[0] ?? null;
  return {
    before: before ? { team: before.teamName?.default, league: before.leagueAbbrev, season: seasonLabel(before.season) } : null,
    firstNhl: firstNhl ? seasonLabel(firstNhl.season) : null,
    table: club.map((s) => ({ season: seasonLabel(s.season), team: s.teamName?.default, league: s.leagueAbbrev, ...pick(s) })),
    intl: intl.map((s) => ({ season: seasonLabel(s.season), team: s.teamName?.default, league: s.leagueAbbrev, ...pick(s) })),
    playoffs: landing.careerTotals?.playoffs ?? null,
    regular: landing.careerTotals?.regularSeason ?? null,
    awards: (landing.awards ?? []).map((a) => ({ name: a.trophy?.default, seasons: (a.seasons ?? []).map((s) => seasonLabel(s.seasonId)) })),
    contract: lastSign ? { date: lastSign.date, text: lastSign.sentence, term, elc: /entry[- ]level/i.test(lastSign.sentence), ext: /extension/i.test(lastSign.sentence) } : null,
    signings: signings.map((t) => ({ date: t.date, text: t.sentence })),
    timeline: ev,
  };
}
const pick = (s) => ({ gp: s.gamesPlayed, g: s.goals, a: s.assists, p: s.points, pim: s.pim, pm: s.plusMinus, w: s.wins, l: s.losses, gaa: s.goalsAgainstAvg, sv: s.savePctg, so: s.shutouts });
function statLine(s) {
  if (s.wins != null || s.savePctg != null) return [s.gamesPlayed != null && `${s.gamesPlayed} GP`, s.wins != null && `${s.wins} W`, s.savePctg != null && `${Number(s.savePctg).toFixed(3).replace(/^0/, "")} SV%`].filter(Boolean).join(" · ");
  return [s.gamesPlayed != null && `${s.gamesPlayed} GP`, s.goals != null && `${s.goals} G`, s.assists != null && `${s.assists} A`, s.points != null && `${s.points} P`].filter(Boolean).join(" · ");
}
