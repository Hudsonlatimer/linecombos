// Combines public draft rankings and mock drafts into one consensus order.
// Every list ranks players; a player missing from a list is ranked just below that list's last name (a top-20 list that
// omits someone says little, so the penalty is small). The consensus is the weighted average rank across lists, with
// recent lists weighted more. A mock draft's pick number counts as a rank, and remembers which team picked him.
import fs from "node:fs/promises";
import path from "node:path";
import { CONFIG } from "./paths.mjs";
import { norm } from "../core/parse.mjs";

const MISS = 6; // a missing player is ranked this many places below the list's last entry

/** → { players: [{ name, pos, team, league, rank, avg, n, ranks: { id: rank }, mocks: [{ id, source, pick, team }] }], sources, ownedBy } */
export async function publicDraftLists(year = 2027) {
  const file = await fs.readFile(path.join(CONFIG, "draft", `${year}-public-lists.json`), "utf8").then(JSON.parse).catch(() => null);
  if (!file?.lists?.length) return null;
  const alias = Object.fromEntries(Object.entries(file.aliases ?? {}).map(([k, v]) => [norm(k), norm(v)]));
  const key = (n) => { const k = norm(n).replace(/[^a-z' -]/g, "").trim(); return alias[k] ?? k; };
  const by = new Map(); // key → player
  const touch = (name) => { const k = key(name); if (!by.has(k)) by.set(k, { name, pos: null, team: null, league: null, ranks: {}, mocks: [], k }); return by.get(k); };
  const sources = [];
  const nats = Object.fromEntries(Object.entries(file.nationalities ?? {}).filter(([k]) => k !== "_help").map(([n, c]) => [key(n), c]));
  for (const L of file.lists) {
    const entries = L.kind === "mock" ? L.picks.map(([team, name], i) => ({ name, team, pick: i + 1 })) : L.players.map((s, i) => { const [name, pos, team, league] = s.split("|"); return { name, pos, team, league, pick: i + 1 }; });
    const seen = new Set();
    for (const e of entries) {
      const p = touch(e.name), k = key(e.name);
      if (seen.has(k)) continue; seen.add(k); // a name listed twice in one mock counts once
      p.ranks[L.id] = e.pick;
      if (L.kind === "mock") p.mocks.push({ id: L.id, source: L.source, pick: e.pick, team: e.team });
      // Details from the most trusted list that has them.
      if (!p.detailW || L.weight > p.detailW) { if (e.pos) p.pos = e.pos; if (e.team && L.kind !== "mock") { p.team = e.team; p.league = e.league ?? null; } if (L.kind !== "mock" || !p.detailW) p.name = e.name; p.detailW = L.weight; }
    }
    sources.push({ id: L.id, source: L.source, url: L.url, date: L.date, weight: L.weight, kind: L.kind, n: seen.size });
  }
  const wsum = file.lists.reduce((s, L) => s + L.weight, 0);
  const lastRank = Object.fromEntries(sources.map((s) => [s.id, s.n]));
  const players = [...by.values()].map((p) => {
    let tot = 0;
    for (const L of file.lists) tot += L.weight * (p.ranks[L.id] ?? lastRank[L.id] + MISS);
    return { ...p, nat: nats[p.k] ?? null, n: Object.keys(p.ranks).length, avg: tot / wsum };
  }).sort((a, b) => a.avg - b.avg || b.n - a.n).map((p, i) => ({ ...p, rank: i + 1, avg: +p.avg.toFixed(2) }));
  const mocks = file.lists.filter((L) => L.kind === "mock").map((L) => ({ id: L.id, source: L.source, url: L.url, date: L.date, picks: L.picks }));
  return { players, sources, mocks, ownedBy: file.ownedBy ?? {}, count: file.lists.length };
}
