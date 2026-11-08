// News ingest: Bluesky (free, public API) + your X scraper's output.
// Every post is saved with its timestamp (data/posts.json) so we keep a record even if it's deleted.
import fs from "node:fs/promises";
import path from "node:path";
import { get, pool } from "./http.mjs";
import { ROOT, DATA, CONFIG } from "./paths.mjs";
import { buildIndex, parsePost } from "../core/parse.mjs";

const STORE = path.join(DATA, "posts.json");

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}

async function fromBluesky(src) {
  const url = `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(src.handle)}&limit=40&filter=posts_no_replies`;
  const r = await get(url, { ttl: 240 });
  return (r?.feed ?? []).filter((it) => !it.reason).map(({ post: p }) => ({
    id: `bsky:${p.uri}`,
    src: "bluesky",
    handle: p.author.handle,
    author: p.author.displayName || src.name || p.author.handle,
    text: p.record?.text ?? "",
    url: `https://bsky.app/profile/${p.author.handle}/post/${p.uri.split("/").pop()}`,
    createdAt: p.record?.createdAt ?? p.indexedAt,
    link: p.embed?.external?.uri ?? null,
  }));
}

async function fromX(cfg) {
  const out = [];
  const dir = path.join(ROOT, cfg.inbox ?? "data/x-inbox");
  try {
    for (const f of await fs.readdir(dir)) {
      if (!/\.(json|ndjson)$/.test(f)) continue;
      const raw = await fs.readFile(path.join(dir, f), "utf8");
      const items = f.endsWith(".ndjson") ? raw.split("\n").filter(Boolean).map((l) => JSON.parse(l)) : JSON.parse(raw);
      out.push(...items);
    }
  } catch {}
  if (process.env.X_FEED_URL) {
    const r = await get(process.env.X_FEED_URL, { ttl: 0 });
    if (Array.isArray(r)) out.push(...r);
  }
  return out.filter((p) => p?.id && p?.text).map((p) => ({
    id: `x:${p.id}`, src: "x", handle: p.handle, author: p.author || p.handle, text: p.text,
    url: p.url || (p.handle ? `https://x.com/${p.handle}/status/${p.id}` : null),
    createdAt: p.createdAt, link: null,
  }));
}

/**
 * ingest({ players, teamAliases }) → posts (newest first), each with .parsed and .rank/.kind.
 * players: [{ id, first, last, team, pos }] — NHL rosters + World Juniors pool.
 */
export async function ingest({ players, teamAliases }) {
  const cfg = await readJson(path.join(CONFIG, "sources.json"), { bluesky: [], x: {} });
  const meta = new Map(cfg.bluesky.map((s) => [s.handle.toLowerCase(), s]));
  for (const a of cfg.x?.accounts ?? []) meta.set(String(a.handle).toLowerCase(), a);

  const fresh = (await pool(cfg.bluesky, 4, fromBluesky)).flat();
  fresh.push(...(await fromX(cfg.x ?? {})));

  const store = await readJson(STORE, []);
  const byId = new Map(store.map((p) => [p.id, p]));
  const now = new Date().toISOString();
  for (const p of fresh) if (!byId.has(p.id)) byId.set(p.id, { ...p, fetchedAt: now });

  const cutoff = Date.now() - (cfg.keepDays ?? 14) * 864e5;
  const idx = buildIndex(players, teamAliases);
  const posts = [...byId.values()]
    .filter((p) => Date.parse(p.createdAt) >= cutoff)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  for (const p of posts) {
    const m = meta.get(String(p.handle).toLowerCase()) ?? {};
    p.kind = m.kind ?? "media";
    p.rank = m.rank ?? 5;
    p.parsed = parsePost(p.text, idx);
    if (!p.parsed.team && m.teams?.length === 1) p.parsed.team = m.teams[0];
  }
  await fs.mkdir(DATA, { recursive: true });
  // Store raw posts only; parsing is redone each build so parser fixes apply to old posts too.
  await fs.writeFile(STORE, JSON.stringify(posts.map(({ parsed, kind, rank, ...raw }) => raw), null, 0));
  return posts;
}

/** Latest reported lines/goalie per team for a given local date (YYYY-MM-DD, ET). */
export function reportedFor(posts, team, sinceIso) {
  const since = Date.parse(sinceIso);
  const mine = posts.filter((p) => p.parsed.team === team && Date.parse(p.createdAt) >= since);
  const best = (type) => mine.filter((p) => p.parsed.type === type).sort((a, b) => a.rank - b.rank || Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null;
  return { lines: best("lines"), goalie: best("goalie") };
}
