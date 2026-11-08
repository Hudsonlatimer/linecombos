// Local preview: serves dist/ and applies the same /live/ proxy rewrites as Vercel (read from dist/vercel.json).
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
const DIST = path.resolve(process.argv[2] ?? "dist"), PORT = +(process.argv[3] ?? 5180);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".xml": "application/xml", ".txt": "text/plain" };
const rules = async () => (JSON.parse(await fs.readFile(path.join(DIST, "vercel.json"), "utf8")).rewrites ?? []).map((r) => {
  const names = [];
  const re = new RegExp("^" + r.source.replace(/:(\w+)/g, (_, n) => (names.push(n), "([^/]+)")) + "?$");
  return { re, names, dest: r.destination };
});
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  for (const r of await rules()) {
    const m = url.pathname.match(r.re);
    if (!m) continue;
    let dest = r.dest; r.names.forEach((n, i) => (dest = dest.replace(`:${n}`, m[i + 1])));
    try { const up = await fetch(dest, { headers: { "User-Agent": "linecombos-dev" } }); res.writeHead(up.status, { "content-type": up.headers.get("content-type") ?? "application/json", "cache-control": "no-store" }); res.end(Buffer.from(await up.arrayBuffer())); }
    catch (e) { res.writeHead(502); res.end(String(e)); }
    return;
  }
  let f = path.join(DIST, decodeURIComponent(url.pathname));
  try { if ((await fs.stat(f)).isDirectory()) f = path.join(f, "index.html"); } catch {}
  try { const b = await fs.readFile(f); res.writeHead(200, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream", "cache-control": "no-store" }); res.end(b); }
  catch { res.writeHead(404, { "content-type": "text/html" }); res.end(await fs.readFile(path.join(DIST, "404.html")).catch(() => "Not found")); }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
