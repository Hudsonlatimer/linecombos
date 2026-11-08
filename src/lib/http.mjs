// Fetch with a small disk cache and retries. Every outside request goes through here.
import fs from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./paths.mjs";

const CACHE = path.join(ROOT, ".cache");
const FRESH = process.argv.includes("--fresh");
let made = false;
export const stats = { network: 0, cached: 0, failed: 0 };

/**
 * get(url, { ttl }) — ttl in seconds. Infinity = cache forever (finished games).
 * 0 = always fetch (live data). Returns parsed JSON, or null on a 404.
 */
export async function get(url, { ttl = 0, text = false } = {}) {
  if (!made) { await fs.mkdir(CACHE, { recursive: true }); made = true; }
  const file = path.join(CACHE, url.replace(/^https?:\/\//, "").replace(/[^a-z0-9]+/gi, "_").slice(-180) + (text ? ".txt" : ".json"));
  if (ttl > 0 && !FRESH) {
    try {
      const st = await fs.stat(file);
      if ((Date.now() - st.mtimeMs) / 1000 < ttl) {
        const raw = await fs.readFile(file, "utf8");
        stats.cached++;
        return text ? raw : JSON.parse(raw);
      }
    } catch {}
  }
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "linecombos-site-builder" } });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      const body = await r.text();
      stats.network++;
      if (ttl > 0) await fs.writeFile(file, body);
      return text ? body : JSON.parse(body);
    } catch (e) {
      if (attempt >= 3) {
        stats.failed++;
        // Fall back to a stale copy rather than break the build.
        try { const raw = await fs.readFile(file, "utf8"); console.warn(`  stale cache used: ${url}`); return text ? raw : JSON.parse(raw); } catch {}
        console.warn(`  failed: ${url} (${e.message})`);
        return null;
      }
      await new Promise((res) => setTimeout(res, 700 * attempt));
    }
  }
}

/** Run fn over items with n at a time. */
export async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}
