// Contracts and cap space from CapWages team pages (public, robots allow /teams/). One request per team, cached a day.
import { get, pool } from "./http.mjs";
import { normName } from "./moves.mjs";

const money = (s) => (s == null || s === "" ? null : Number(String(s).replace(/[^0-9.-]/g, "")) || 0);
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** "Oct. 27, 1995" → "1995-10-27" */
export function isoDate(s) {
  const m = String(s ?? "").match(/([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
  return m ? `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
}
export const fmtMoney = (n, { short = true } = {}) => {
  if (n == null) return "—";
  if (!short) return `$${Math.round(n).toLocaleString("en-US")}`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 1 : n >= 1e7 ? 2 : 3).replace(/0+$/, "").replace(/\.$/, "")}M`;
  return `$${Math.round(n / 1e3)}K`;
};

function shape(c) {
  const years = (c.details ?? []).map((d) => ({
    season: d.season, cap: money(d.capHit), aav: money(d.aav), base: money(d.baseSalary), bonus: money(d.signingBonuses),
    perf: money(d.performanceBonuses), total: money(d.totalSalary), minors: money(d.minorsSalary), clause: d.clause || "",
  }));
  if (!years.length) return null;
  const aav = years[0].aav || years[0].cap;
  const total = years.reduce((s, y) => s + (y.total ?? y.cap ?? 0), 0) || aav * years.length;
  return {
    type: c.type ?? "", ext: /extension/i.test(c.type ?? ""), elc: /entry/i.test(c.type ?? ""), twoWay: /two[- ]way/i.test(c.type ?? ""),
    team: c.signingTeam ?? "", expiry: c.expiryStatus ?? "", clause: c.clauseDetails ?? "",
    start: years[0].season, end: years.at(-1).season, startYear: +years[0].season.slice(0, 4), len: years.length, aav, total, years,
  };
}

/** Returns { players: [{ name, first, last, born, pos, team, terms, contracts[] }], teams: { ABBR: summary } } */
export async function capwages(teams) {
  const players = [], summary = {};
  await pool(teams, 3, async (t) => {
    const slug = normName(t.name).replace(/ /g, "_");
    const html = await get(`https://capwages.com/teams/${slug}`, { ttl: 86400, text: true });
    const m = html?.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
    if (!m) return;
    let pp;
    try { pp = JSON.parse(m[1]).props.pageProps; } catch { return; }
    const s = pp.teamSummary;
    if (s) summary[t.abbrev] = { capHit: s.capHit?.total ?? null, space: s.capSpace ?? null, ltir: s.ltir ?? 0, dead: s.capHit?.deadCap ?? 0, upper: s.upperLimit ?? null, contracts: s.totalContracts ?? null, roster: s.roster ?? null, gm: pp.teamMetadata?.gm ?? null, coach: pp.teamMetadata?.coach ?? null };
    const groups = [];
    const walk = (x, label) => {
      if (Array.isArray(x)) { if (x.length && x[0]?.name && x[0]?.contracts) groups.push([label, x]); return; }
      if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) walk(v, k);
    };
    walk(pp.data, "roster");
    // Dead-cap lists (buyouts, retained salary, buried, recapture) hold players who belong to other teams.
    for (const [group, list] of groups) if (!/buyout|retained|buried|recapture|terminated|overage/i.test(group)) for (const p of list) {
      const [last, first] = String(p.name).split(/,\s*/);
      players.push({
        name: `${first ?? ""} ${last ?? ""}`.trim(), first: first ?? "", last: last ?? "", born: isoDate(p.born), pos: p.pos ?? "", team: t.abbrev, group,
        terms: p.terms ?? "", termsDetails: p.termsDetails ?? "", acquired: p.acquisitionDetails || p.acquired || "",
        contracts: (p.contracts ?? []).map(shape).filter(Boolean),
      });
    }
  });
  return { players, teams: summary };
}

/** Match CapWages players to NHL ids by name + birthdate (name alone when the birthdate is missing and the name is unique). */
export function matchContracts(cw, people) {
  const byKey = new Map(), byName = new Map();
  for (const p of people) {
    const n = normName(`${p.first} ${p.last}`);
    byKey.set(`${n}|${p.birthDate ?? ""}`, p.id);
    byName.set(n, byName.has(n) ? null : p.id);
  }
  const lastBorn = new Map();
  for (const p of people) { const k = `${normName(p.last)}|${p.birthDate ?? ""}`; lastBorn.set(k, lastBorn.has(k) ? null : p.id); }
  const out = {};
  for (const c of cw.players) {
    const n = normName(c.name);
    const id = byKey.get(`${n}|${c.born ?? ""}`) ?? (c.born ? lastBorn.get(`${normName(c.last)}|${c.born}`) : null) ?? byName.get(n);
    if (id && !out[id]) out[id] = c;
  }
  return out;
}

/** The contract a signing transaction most likely refers to. */
export function contractForSigning(c, tx) {
  if (!c?.contracts?.length || /tryout|\bPTO\b|\bATO\b/i.test(tx.sentence ?? tx.text)) return null;
  const y = +tx.date.slice(0, 4), mo = +tx.date.slice(5, 7);
  const season = mo >= 7 ? y : y - 1; // the season the signing happened in
  const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  const t = (tx.sentence ?? tx.text).match(/\b(one|two|three|four|five|six|seven|eight|\d)-year/i)?.[1]?.toLowerCase();
  const len = t ? words[t] ?? +t : null;
  return c.contracts.find((k) => (k.startYear === season || k.startYear === season + 1) && (!len || k.len === len)) ?? null;
}
