// World Juniors: eligible player pool + projected lineups.
//
// Who's in the pool, strongest evidence first:
//   1. Official camp/final rosters (config/wjc/rosters/<CODE>.json) once announced: they replace everything.
//   2. Summer Showcase invites (config/wjc/sources/2026-summer-camps.json): the federation's own shortlist.
//   3. Last year's World Juniors players who are still young enough (config/wjc/sources/2026-wjc-rosters.json).
//   4. NHL-drafted prospects, recent draft classes, and NHL Central Scouting's ranked players.
//   5. config/wjc/overrides.json (add/remove/nationality) for anything the data misses.
//
// Nationality comes from the national teams a player has actually played for (U17/U18/U20), then the
// source lists, and only then birth country. That stops Canadian-born Americans landing on Canada.
//
// Score = league-adjusted scoring + draft pedigree + camp invite + returning player + age.
import fs from "node:fs/promises";
import path from "node:path";
import { pool } from "./http.mjs";
import { playerLanding, draftPicks, searchPlayer } from "./nhl.mjs";
import { get } from "./http.mjs";
import { CONFIG } from "./paths.mjs";
import { norm } from "../core/parse.mjs";

const readJson = async (f, fb) => { try { return JSON.parse(await fs.readFile(f, "utf8")); } catch { return fb; } };
const INTL = /^(wjc|wjac|wc\b|wc-|og\b|u-?1\d|u-?2\d|hlinka|olympics|5 nations|4 nations|int'?l|ivan|whc|youth|champions|eht\b)/i;
const POS = { LW: "L", RW: "R", C: "C", D: "D", G: "G", L: "L", R: "R", F: "F" };
const PRO = /^(ahl|shl|liiga|nl$|national league|czech|extraliga|khl|del$|ichl|allsvenskan|mestis|slovakia|nlb|sl$)/i;
// National-team names → our codes. Anything else (Russia, Kazakhstan, Austria...) means "not one of the 10 teams".
const NATION = [
  [/^(team )?canada\b/i, "CAN"], [/^(team )?(usa|united states|u\.s\.)\b/i, "USA"], [/^(team )?sweden\b/i, "SWE"], [/^(team )?finland\b/i, "FIN"],
  [/^(team )?(czechia|czech republic)\b/i, "CZE"], [/^(team )?slovakia\b/i, "SVK"], [/^(team )?switzerland\b/i, "SUI"], [/^(team )?germany\b/i, "GER"],
  [/^(team )?latvia\b/i, "LAT"], [/^(team )?norway\b/i, "NOR"], [/^(team )?denmark\b/i, "DEN"], [/^(team )?(russia|belarus|kazakhstan|austria|slovenia|ukraine|france|italy|hungary|poland|japan|great britain|lithuania|estonia)\b/i, "OTHER"],
];
const nationOf = (teamName) => { for (const [re, c] of NATION) if (re.test(teamName ?? "")) return c; return null; };

export async function loadWjcConfig() {
  const cfg = await readJson(path.join(CONFIG, "wjc.json"), null);
  const overrides = await readJson(path.join(CONFIG, "wjc", "overrides.json"), { add: [], remove: [], nationality: {} });
  const sources = {
    camps: await readJson(path.join(CONFIG, "wjc", "sources", "2026-summer-camps.json"), { teams: {} }),
    last: await readJson(path.join(CONFIG, "wjc", "sources", "2026-wjc-rosters.json"), { teams: {} }),
    extra: await readJson(path.join(CONFIG, "wjc", "sources", "extra.json"), { teams: {} }),
    // Birthdates of last year's players (Hockey Canada rosters, THN): tells us who has aged out.
    births: await readJson(path.join(CONFIG, "wjc", "sources", "2026-birthdates.json"), { players: {} }),
  };
  const rosters = {}, lines = {};
  for (const t of cfg.teams) {
    // Emoji flags don't render on Windows, so use small flag images (flagcdn.com, free) and keep the emoji as text fallback.
    if (!t.flagEmoji) {
      t.flagEmoji = t.flag;
      const iso2 = [...t.flag].map((c) => String.fromCharCode(c.codePointAt(0) - 0x1f1e6 + 97)).join("");
      t.iso2 = iso2;
      t.flag = `<img class="flag-img" src="https://flagcdn.com/w40/${iso2}.png" srcset="https://flagcdn.com/w80/${iso2}.png 2x" alt="${t.flagEmoji}" width="20" height="14" loading="lazy">`;
    }
    rosters[t.code] = await readJson(path.join(CONFIG, "wjc", "rosters", `${t.code}.json`), null);
    lines[t.code] = await readJson(path.join(CONFIG, "wjc", "lines", `${t.code}.json`), null);
  }
  return { cfg, overrides, rosters, lines, sources };
}

function factorFor(league, cfg) {
  const l = String(league ?? "").trim();
  for (const r of cfg.leagueFactors) if (new RegExp(r.match, "i").test(l)) return r.f;
  return cfg.defaultFactor;
}

function seasonLine(landing, season, cfg) {
  const rows = (landing?.seasonTotals ?? []).filter((s) => s.season === season && s.gameTypeId === 2 && !INTL.test(s.leagueAbbrev ?? ""));
  if (!rows.length) return null;
  const main = rows.sort((a, b) => (b.gamesPlayed ?? 0) - (a.gamesPlayed ?? 0))[0];
  return {
    league: main.leagueAbbrev, team: main.teamName?.default ?? "", gp: main.gamesPlayed ?? 0,
    g: main.goals ?? 0, a: main.assists ?? 0, pts: main.points ?? 0,
    svPct: main.savePctg ?? null, gaa: main.goalsAgainstAvg ?? null, f: factorFor(main.leagueAbbrev, cfg),
  };
}

function rate(cur, prev) {
  // League-adjusted points per game, shrunk hard toward 0 for small samples; last season fills in early on.
  const one = (s) => (s ? { w: s.gp, v: (s.pts * s.f) / Math.max(s.gp, 1) } : { w: 0, v: 0 });
  const c = one(cur), p = one(prev);
  const wc = c.w, wp = cur && cur.gp >= 25 ? 0 : p.w * 0.7;
  const w = wc + wp;
  if (!w) return 0;
  return Math.min(0.7, ((c.v * wc + p.v * wp) / w) * (w / (w + 15)));
}

function goalieRate(cur, prev) {
  const s = cur && cur.gp >= 6 ? cur : prev ?? cur;
  if (!s || s.svPct == null) return 0;
  return Math.max(0, Math.min(0.5, (s.svPct - 0.875) * 8 * (0.6 + s.f) * (s.gp / (s.gp + 12))));
}

// Same-name players are common; juniors have the newest (highest) NHL ids, so prefer those.
async function findYoung(name, country) {
  const r = await get(`https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=20&q=${encodeURIComponent(name)}`, { ttl: 30 * 86400 });
  const want = norm(name).replace(/[^a-z]/g, "");
  const hits = (r ?? []).filter((p) => norm(p.name).replace(/[^a-z]/g, "") === want && Number(p.playerId) >= 8482000)
    .sort((a, b) => Number(b.playerId) - Number(a.playerId));
  return hits.find((p) => !country || p.birthCountry === country) ?? hits[0] ?? null;
}

const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][(n % 100 - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th"}`;
const parseClub = (s) => { const m = String(s ?? "").match(/^(.*?)\s*\(([^)]+)\)\s*$/); return m ? { team: m[1], league: m[2] } : s ? { team: s, league: "" } : null; };

export async function buildWjc({ prospectsByTeam, rostersByTeam }) {
  const { cfg, overrides, rosters, lines: manualLines, sources } = await loadWjcConfig();
  const codes = new Set(cfg.teams.map((t) => t.code));
  const isoToCode = Object.fromEntries(cfg.teams.map((t) => [t.iso, t.code]));
  const cut = cfg.bornOnOrAfter;
  const oldest = Number(cut.slice(0, 4));

  // ---------- 1. Candidates ----------
  const cand = new Map(); // id (number) or "x-name" → player
  const byName = new Map();
  const add = (p) => {
    const key = norm(`${p.first} ${p.last}`);
    const existing = (typeof p.id === "number" && cand.get(p.id)) || byName.get(key);
    if (existing) { Object.assign(existing, Object.fromEntries(Object.entries(p).filter(([k, v]) => v != null && existing[k] == null))); return existing; }
    cand.set(p.id, p); byName.set(key, p); return p;
  };
  for (const [nhlTeam, list] of Object.entries(prospectsByTeam)) for (const p of list) if (p.birthDate >= cut) add({ ...p, nhlTeam, inNhl: false });
  for (const [nhlTeam, list] of Object.entries(rostersByTeam)) for (const p of list) if (p.birthDate >= cut) add({ ...p, nhlTeam, inNhl: true });

  // Recent draft classes (drafted players not yet on a prospect list).
  const year = Number(String(cfg.season).slice(4));
  for (const y of [year - 2, year - 1]) {
    const picks = (await draftPicks(y)) ?? [];
    await pool(picks, 8, async (pk) => {
      if (!pk.firstName?.default) return;
      const name = `${pk.firstName.default} ${pk.lastName.default}`;
      if (byName.has(norm(name))) return;
      const hit = await searchPlayer(name, pk.countryCode);
      if (!hit) return;
      add({ id: Number(hit.playerId), first: pk.firstName.default, last: pk.lastName.default, pos: POS[pk.positionCode] ?? pk.positionCode, birthCountry: pk.countryCode, nhlTeam: pk.teamAbbrev, inNhl: false });
    });
  }
  // NHL Central Scouting's ranked players for the last draft (undrafted ones are still eligible): they come with birthdates.
  for (const cat of [1, 2, 3, 4]) {
    const r = await get(`https://api-web.nhle.com/v1/draft/rankings/${year - 1}/${cat}`, { ttl: 30 * 86400 });
    await pool((r?.rankings ?? []).filter((x) => x.birthDate >= cut), 8, async (x) => {
      const name = `${x.firstName} ${x.lastName}`;
      if (byName.has(norm(name))) return;
      const hit = await findYoung(name, x.birthCountry);
      add({ id: hit ? Number(hit.playerId) : `x-${norm(name)}`, first: x.firstName, last: x.lastName, pos: POS[x.positionCode] ?? x.positionCode, shoots: x.shootsCatches,
        birthDate: x.birthDate, birthCountry: x.birthCountry, inNhl: false, ranked: { rank: x.finalRank ?? x.midtermRank, cat }, rawClub: x.lastAmateurClub ? { team: x.lastAmateurClub, league: x.lastAmateurLeague } : null });
    });
  }
  // Federation sources: camp invites, last year's team, extras. These also pin nationality.
  const srcList = [
    ...Object.entries(sources.camps.teams ?? {}).flatMap(([code, l]) => l.map((x) => ({ ...x, code, kind: "camp" }))),
    ...Object.entries(sources.last.teams ?? {}).flatMap(([code, l]) => l.map((x) => ({ ...x, code, kind: "returnee" }))),
    ...Object.entries(sources.extra.teams ?? {}).flatMap(([code, l]) => l.map((x) => ({ ...x, code, kind: "returnee" }))),
  ].filter((x) => codes.has(x.code));
  await pool(srcList, 8, async (x) => {
    const parts = x.name.split(" ");
    const first = parts[0], last = parts.slice(1).join(" ");
    let p = byName.get(norm(x.name));
    if (!p) {
      const hit = await findYoung(x.name);
      p = add({ id: hit ? Number(hit.playerId) : `x-${norm(x.name)}`, first, last, pos: x.pos, inNhl: false, rawClub: parseClub(x.club) });
    }
    p.srcCode ??= x.code;
    if (x.kind === "camp") { p.camp = true; if (x.declined) p.campDeclined = true; }
    if (x.kind === "returnee") p.returnee = true;
    p.rawClub ??= parseClub(x.club);
  });
  // Public roster projections (reporters' published lineups, config/wjc/lines/<CODE>.json with kind "public"): every named player joins the pool.
  const slotPos = (kind, i) => (kind === "lines" ? ["L", "C", "R"][i] ?? "F" : kind === "pairs" ? "D" : kind === "goalies" ? "G" : "F");
  for (const [code, L] of Object.entries(manualLines)) if (L?.kind === "public" && codes.has(code)) {
    const named = [];
    for (const kind of ["lines", "pairs", "goalies", "extras"]) for (const item of L[kind] ?? []) {
      if (Array.isArray(item)) item.forEach((n, i) => named.push([n, slotPos(kind, i)])); else named.push([item, slotPos(kind, 0)]);
    }
    await pool(named, 6, async ([n, pos]) => {
      let p = byName.get(norm(n));
      if (!p) {
        const hit = await findYoung(n);
        const [first, ...rest] = n.split(" ");
        p = add({ id: hit ? Number(hit.playerId) : `x-${norm(n)}`, first, last: rest.join(" "), pos, inNhl: false });
      }
      p.srcCode ??= code; p.camp = true; p.publicPick = true;
    });
  }
  for (const id of overrides.remove ?? []) cand.delete(id);
  for (const p of overrides.add ?? []) add({ id: p.id ?? `x-${norm(p.first + " " + p.last)}`, ...p, added: true, srcCode: p.code });

  // ---------- 2. Stats, birthdates, national-team history ----------
  const all = [...cand.values()];
  await pool(all.filter((p) => typeof p.id === "number"), 8, async (p) => {
    const l = await playerLanding(p.id);
    if (!l) return;
    p.birthDate = l.birthDate ?? p.birthDate;
    p.birthCountry = l.birthCountry ?? p.birthCountry;
    p.pos = l.position ? (POS[l.position] ?? l.position) : p.pos;
    p.first = l.firstName?.default ?? p.first; p.last = l.lastName?.default ?? p.last;
    p.shoots ??= l.shootsCatches;
    p.cur = seasonLine(l, cfg.season, cfg);
    p.prev = seasonLine(l, cfg.season - 10001, cfg);
    p.draft = l.draftDetails ?? null;
    p.headshot = l.headshot ?? p.headshot;
    if (p.cur?.league === "NHL" && p.cur.gp > 0) p.inNhl = true;
    if (l.currentTeamAbbrev && (rostersByTeam[l.currentTeamAbbrev] ?? []).some((r) => r.id === p.id)) { p.inNhl = true; p.nhlTeam ??= l.currentTeamAbbrev; }
    // Most recent national team they've played for.
    const nat = (l.seasonTotals ?? []).filter((s) => INTL.test(s.leagueAbbrev ?? "") || /\bU-?1\d\b|\bU-?20\b|national/i.test(s.teamName?.default ?? ""))
      .map((s) => ({ season: s.season, code: nationOf(s.teamName?.default), league: s.leagueAbbrev, team: s.teamName?.default })).filter((s) => s.code);
    if (nat.length) {
      p.natCode = nat.at(-1).code;
      p.natTeams = [...new Set(nat.map((s) => s.team))];
      if (nat.some((s) => /^wjc-?20/i.test(s.league ?? "") && s.code === p.natCode && s.season >= cfg.season - 10001)) p.returnee = true;
    }
  });

  // Birthdates for players the NHL database doesn't know: last year's rosters, then older Central Scouting lists.
  const births = new Map();
  const fl = (n) => { const w = norm(n).split(/s+/); return `fl:${w[0]} ${w.at(-1)}`; };
  for (const list of Object.values(sources.births.players ?? {})) for (const [n, d] of Object.entries(list)) { births.set(norm(n), d); births.set(fl(n), d); }
  for (const y of [year - 2, year - 3]) for (const cat of [1, 2, 3, 4]) {
    const r = await get(`https://api-web.nhle.com/v1/draft/rankings/${y}/${cat}`, { ttl: 30 * 86400 });
    for (const x of r?.rankings ?? []) if (x.birthDate) { const k = norm(`${x.firstName} ${x.lastName}`); if (!births.has(k)) births.set(k, x.birthDate); }
  }
  for (const p of cand.values()) if (!p.birthDate) p.birthDate = births.get(norm(`${p.first} ${p.last}`)) ?? births.get(fl(`${p.first} ${p.last}`)) ?? null;

  for (const p of cand.values()) {
    p.code = overrides.nationality?.[p.id] ?? (p.srcCode && p.srcCode === p.natCode ? p.srcCode : null) ?? p.srcCode ?? p.natCode ?? isoToCode[p.birthCountry] ?? null;
    if (p.code === "OTHER" || !codes.has(p.code)) p.code = null;
    p.ageUnknown = !p.birthDate;
  }
  let eligible = [...cand.values()].filter((p) => p.code && (p.added || p.ageUnknown || (p.birthDate.length === 4 ? Number(p.birthDate) >= oldest : p.birthDate >= cut)));
  // Unconfirmed ages are only kept when a federation source named them (returnee/camp).
  eligible = eligible.filter((p) => !p.ageUnknown || p.camp || p.added || (p.returnee && typeof p.id !== "number"));

  // ---------- 3. Score ----------
  const campTeams = new Set(Object.keys(sources.camps.teams ?? {}).filter((c) => (sources.camps.teams[c] ?? []).length >= 20));
  for (const p of eligible) {
    const g = p.pos === "G";
    const born = p.birthDate ? Number(p.birthDate.slice(0, 4)) : null;
    const prod = g ? goalieRate(p.cur, p.prev) : rate(p.cur, p.prev);
    let r = (g ? 0.7 : 0.6) * prod;
    const pick = p.draft?.overallPick;
    if (pick) r += pick <= 32 ? 0.32 - (0.1 * (pick - 1)) / 31 : Math.max(0, 0.2 * (1 - (pick - 33) / 190));
    if (p.ranked && !pick) r += Math.max(0, 0.12 * (1 - p.ranked.rank / 120));
    if (p.camp) r += p.campDeclined ? 0.1 : 0.25;
    if (p.publicPick) r += 0.2;
    if (p.returnee) r += 0.3;
    if (p.natTeams?.length && p.natCode === p.code) r += 0.05;
    if (born === oldest) r += 0.1; else if (born === oldest + 1) r += 0.04;
    const lg = (p.cur ?? p.prev)?.league ?? p.rawClub?.league ?? "";
    if (PRO.test(lg)) r += 0.06;
    // Canada and the US invite nearly everyone with a real shot to the summer showcase.
    if (campTeams.has(p.code) && !p.camp && !p.returnee && !(pick && pick <= 40)) r -= 0.25;
    if (p.ageUnknown) r -= 0.12;
    p.score = Math.round(Math.max(0, r) * 1000) / 1000;

    const s = p.cur ?? p.prev;
    const bits = [];
    if (p.publicPick) bits.push("named in a public roster projection");
    if (p.returnee) bits.push("played at last year's World Juniors");
    if (p.camp) bits.push(p.campDeclined ? "invited to summer camp (couldn't attend)" : "invited to the summer showcase");
    if (s) bits.push(g
      ? `${s.svPct != null ? s.svPct.toFixed(3).replace(/^0/, "") : "—"} sv% in ${s.league} (${s.gp} GP${s === p.prev ? ", last season" : ""})`
      : `${s.pts} pts in ${s.gp} GP in ${s.league}${s === p.prev ? " last season" : ""}`);
    if (p.draft) bits.push(`${ordinal(p.draft.round)} round, ${ordinal(p.draft.overallPick)} overall (${p.draft.teamAbbrev} ${p.draft.year})`);
    else if (p.ranked) bits.push(`ranked #${p.ranked.rank} by Central Scouting, undrafted`);
    if (p.natTeams?.length && p.natCode === p.code) bits.push(`has played for ${p.natTeams.slice(-2).join(", ")}`);
    if (p.inNhl) bits.push(`in the NHL with ${p.nhlTeam ?? "his team"}, would need to be loaned`);
    if (p.ageUnknown) bits.push("birthdate not confirmed: may have aged out");
    p.reason = bits.join(" · ");
  }

  // ---------- 4. Per country ----------
  const teams = {};
  for (const t of cfg.teams) {
    let players = eligible.filter((p) => p.code === t.code);
    const official = rosters[t.code];
    if (official?.players?.length) {
      const want = official.players.map((x) => ({ ...x, key: norm(`${x.first ?? ""} ${x.last ?? x.name ?? ""}`) }));
      players = want.map((w) => players.find((p) => (w.id && p.id === w.id) || norm(`${p.first} ${p.last}`) === w.key)
        ?? eligible.find((p) => norm(`${p.first} ${p.last}`) === w.key)
        ?? { id: `x-${w.key}`, first: w.first ?? "", last: w.last ?? w.name, pos: w.pos, shoots: w.shoots, code: t.code, score: 0, reason: w.club ?? "", unmatched: true });
    }
    const confirmed = (p) => !p.inNhl && !p.ageUnknown;
    const pickFrom = (list, n) => {
      // Prefer confirmed-age players; fall back to unconfirmed ones only to fill empty spots.
      const a = list.filter(confirmed).sort((x, y) => y.score - x.score);
      const b = list.filter((p) => !p.inNhl && p.ageUnknown).sort((x, y) => y.score - x.score);
      return [...a, ...b].slice(0, Math.max(n, a.length));
    };
    const avail = official?.players?.length ? players : players.filter((p) => !p.inNhl);
    const isF = (p) => ["C", "L", "R", "F", "LW", "RW"].includes(p.pos);
    const F = pickFrom(avail.filter(isF), 12), D = pickFrom(avail.filter((p) => p.pos === "D"), 6), G = pickFrom(avail.filter((p) => p.pos === "G"), 2);

    // Forward lines: best centre + two best wings; wings sided by position, then handedness.
    const top = F.slice(0, 12), used = new Set(), fl = [];
    const isC = (p) => p.pos === "C";
    for (let i = 0; i < 4 && used.size < top.length; i++) {
      const left = top.filter((p) => !used.has(p.id));
      const c = left.find(isC) ?? left.find((p) => p.pos === "F") ?? left[0];
      used.add(c.id);
      const w = top.filter((p) => !used.has(p.id)).sort((a, b) => (isC(a) - isC(b)) || b.score - a.score).slice(0, 2);
      w.forEach((p) => used.add(p.id));
      const isLeft = (p) => p.pos === "L" || p.pos === "LW" || (!["R", "RW"].includes(p.pos) && p.shoots === "L");
      const [lw, rw] = w.length === 2 && !isLeft(w[0]) && isLeft(w[1]) ? [w[1], w[0]] : w;
      fl.push([lw, c, rw].filter(Boolean).map((p) => p.id));
    }
    const topD = D.slice(0, 6), Ls = topD.filter((p) => p.shoots !== "R"), Rs = topD.filter((p) => p.shoots === "R");
    const pairs = [], dUsed = new Set();
    for (let i = 0; i < 3; i++) {
      const l = Ls.find((p) => !dUsed.has(p.id)) ?? topD.find((p) => !dUsed.has(p.id));
      if (!l) break; dUsed.add(l.id);
      const r = Rs.find((p) => !dUsed.has(p.id)) ?? topD.find((p) => !dUsed.has(p.id));
      if (r) dUsed.add(r.id);
      pairs.push([l.id, r?.id].filter(Boolean));
    }
    const ppVal = (p) => (p.cur ? (p.cur.pts / Math.max(p.cur.gp, 1)) * p.cur.f : 0) + p.score * 0.5;
    const off = top.slice().sort((a, b) => ppVal(b) - ppVal(a));
    const pp = [[...off.slice(0, 4), topD[0]], [...off.slice(4, 8), topD[1]]].map((u) => u.filter(Boolean).map((p) => p.id)).filter((u) => u.length >= 4);

    // A public projection (reporters' published lineup) sets the lines; the model fills in everything else.
    const pub = manualLines[t.code]?.kind === "public" ? manualLines[t.code] : null;
    if (pub) {
      const lookup = (n, hint) => {
        const k = norm(n);
        let p = players.find((x) => norm(`${x.first} ${x.last}`) === k) ?? eligible.find((x) => norm(`${x.first} ${x.last}`) === k);
        if (!p) { const [f, ...r] = n.split(" "); p = { id: `x-${k}`, first: f, last: r.join(" "), pos: hint, code: t.code, score: 0.3, reason: `Named in ${pub.short ?? pub.source}`, unmatched: true }; }
        if (!players.includes(p)) players.push(p);
        return p;
      };
      const mapL = (l, hints) => l.map((n, i) => lookup(n, hints[i] ?? hints.at(-1)));
      const pl = (pub.lines ?? []).map((l) => mapL(l, ["L", "C", "R"])), pd = (pub.pairs ?? []).map((l) => mapL(l, ["D"]));
      const pg = (pub.goalies ?? []).map((n) => lookup(n, "G")), px = (pub.extras ?? []).map((n) => lookup(n, "F"));
      if (pl.length) { fl.splice(0, fl.length, ...pl.map((l) => l.map((p) => p.id))); F.splice(0, F.length, ...pl.flat(), ...px); }
      if (pd.length) { pairs.splice(0, pairs.length, ...pd.map((l) => l.map((p) => p.id))); D.splice(0, D.length, ...pd.flat()); }
      if (pg.length) G.splice(0, G.length, ...pg);
      const off2 = F.slice(0, 12).sort((a, b) => ppVal(b) - ppVal(a)), dd = D.slice(0, 6);
      pp.splice(0, pp.length, ...[[...off2.slice(0, 4), dd[0]], [...off2.slice(4, 8), dd[1]]].map((u) => u.filter(Boolean).map((p) => p.id)).filter((u) => u.length >= 4));
    }
    const reported = pub ? null : manualLines[t.code] ?? null;
    const shown = new Set([...F, ...D, ...G].map((p) => p.id));
    const ranked = players.slice().sort((a, b) => b.score - a.score);
    const poolList = [...ranked.filter((p) => shown.has(p.id) || p.score >= 0.25 || p.camp || p.returnee || p.inNhl)].slice(0, 70);
    teams[t.code] = {
      ...t,
      stage: reported ? "reported" : pub ? "public" : official?.status === "final" ? "roster" : official?.players?.length ? "camp" : "projected",
      roster: official ? { status: official.status, source: official.source, url: official.url, updated: official.updated } : null,
      projection: { lines: fl, pairs, pp, goalies: G.slice(0, 3).map((p) => p.id) },
      reported,
      publicLines: pub ? { source: pub.source, short: pub.short, url: pub.url, date: pub.reportedAt, partial: !(pub.pairs?.length && pub.goalies?.length) } : null,
      extras: { F: F.slice(12).map((p) => p.id), D: D.slice(6).map((p) => p.id) },
      counts: { F: F.filter(confirmed).length, D: D.filter(confirmed).length, G: G.filter(confirmed).length, unconfirmed: [...F, ...D, ...G].filter((p) => p.ageUnknown).length, camp: players.filter((p) => p.camp).length, returnees: players.filter((p) => p.returnee && !p.ageUnknown).length },
      sources: { camp: sources.camps.urls?.[t.code] ?? null, last: sources.last.url, extra: sources.extra.teams?.[t.code] ? sources.extra.url : null },
      pool: Object.fromEntries(poolList.map((p) => {
        const s = p.cur ?? p.prev;
        return [p.id, {
          id: p.id, first: p.first, last: p.last, pos: p.pos, shoots: p.shoots ?? null, birthDate: p.birthDate ?? null,
          nhlTeam: p.nhlTeam ?? null, inNhl: !!p.inNhl, headshot: p.headshot ?? null, score: p.score ?? 0, reason: p.reason ?? "",
          camp: !!p.camp, returnee: !!p.returnee, ageUnknown: !!p.ageUnknown, linked: typeof p.id === "number",
          club: s ? { league: s.league, team: s.team, gp: s.gp, pts: s.pts, g: s.g, a: s.a, svPct: s.svPct, gaa: s.gaa } : p.rawClub ? { league: p.rawClub.league, team: p.rawClub.team } : null,
          draft: p.draft ? { year: p.draft.year, team: p.draft.teamAbbrev, round: p.draft.round, overall: p.draft.overallPick } : null,
          unmatched: !!p.unmatched,
        }];
      })),
    };
  }
  return { cfg, teams, poolSize: eligible.length };
}
