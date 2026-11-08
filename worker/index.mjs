// Cloudflare Worker: live gamecenter JSON with CORS. Free tier = 100k requests/day.
// GET /game/:id  ->  same shape as the build's /data/game/:id.json snapshots.
import { gameJson } from "../src/core/game.mjs";

const NHL = "https://api-web.nhle.com/v1";
const STATS = "https://api.nhle.com/stats/rest/en";
const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };
const json = (body, status = 200, ttl = 15) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json", "cache-control": `public, max-age=${ttl}` } });

const pull = (url, ttl) => fetch(url, { cf: { cacheTtl: ttl, cacheEverything: true }, headers: { "user-agent": "LineCombos/1.0" } })
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${url}`))));

export default {
  async fetch(req, env, ctx) {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(req.url);
    // Any player's NHL landing page (career, bio, draft) for players the static build has no page for.
    const pm = url.pathname.match(/^\/player\/(\d{7})\/?$/);
    if (pm) {
      try { return json(await pull(`${NHL}/player/${pm[1]}/landing`, 3600), 200, 3600); }
      catch (e) { return json({ error: String(e.message ?? e) }, 502, 60); }
    }
    const m = url.pathname.match(/^\/game\/(\d{10})\/?$/);
    if (!m) return url.pathname === "/" ? json({ ok: true, routes: ["/game/:id", "/player/:id"] }) : json({ error: "not found" }, 404);

    const cache = caches.default, key = new Request(url.toString(), req);
    const hit = await cache.match(key);
    if (hit) return hit;

    const id = m[1];
    try {
      const [box, pbp, shifts] = await Promise.all([
        pull(`${NHL}/gamecenter/${id}/boxscore`, 10),
        pull(`${NHL}/gamecenter/${id}/play-by-play`, 10),
        pull(`${STATS}/shiftcharts?cayenneExp=gameId=${id}`, 30).catch(() => ({ data: [] })),
      ]);
      const body = gameJson({ box, pbp, shifts: shifts.data ?? [] });
      const final = ["OFF", "FINAL"].includes(body.state);
      const res = json(body, 200, final ? 3600 : 15);
      ctx.waitUntil(cache.put(key, res.clone()));
      return res;
    } catch (e) {
      return json({ error: String(e.message ?? e) }, 502, 5);
    }
  },
};
