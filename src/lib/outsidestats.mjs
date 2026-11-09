// Stats for draft prospects who play outside the CHL and USHL (NCAA, the US national program, and anything added by hand).
// Reads open stats pages at build time (College Hockey News, USA Hockey NTDP), so the numbers stay current without anyone editing.
import fs from "node:fs/promises";
import path from "node:path";
import { get } from "./http.mjs";
import { CONFIG } from "./paths.mjs";
import { normName } from "./moves.mjs";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const decode = (s) => s.replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&");

/** Four numbers (GP, G, A, PTS) following a player's name link in the page's HTML table row. */
function row(html, names, kind) {
  for (const n of names) {
    const name = esc(n).replace(/'/g, "(?:'|&#39;)");
    const re = kind === "chn"
      ? new RegExp(`>${name}</a>[^<]*</td>\\s*<td>(\\d+)</td>\\s*<td>(\\d+)</td>\\s*<td>(\\d+)</td>\\s*<td>(\\d+)</td>`, "i")
      : new RegExp(`>${name}</a>\\s*</td>\\s*<td[^>]*>(\\d+)</td>\\s*<td[^>]*>(\\d+)</td>\\s*<td[^>]*>(\\d+)</td>\\s*<td[^>]*>(\\d+)</td>`, "i");
    const m = html.match(re);
    if (m) return { gp: +m[1], g: +m[2], a: +m[3], p: +m[4] };
  }
  return null;
}

/** swehockey.se "players by team" page: every skater with GP, G, A, TP, under his team's heading. Names are written "Last, First". */
function swRow(html, swName) {
  const re = new RegExp(`<span title="">${esc(swName)}</span></strong></td>\\s*<td[^>]*>[^<]*</td>\\s*<td[^>]*>(\\d+)</td>\\s*<td[^>]*>(\\d+)</td>\\s*<td[^>]*>(\\d+)</td>\\s*<td[^>]*><strong>(\\d+)</strong>`, "i");
  const m = re.exec(html);
  if (!m) return null;
  const head = html.slice(0, m.index).match(/tdTitle d-none d-xl-table-cell" colspan="\d+">([^<]+)</g)?.at(-1)?.replace(/.*>/, "").replace(/<$/, "").trim();
  return { gp: +m[1], g: +m[2], a: +m[3], p: +m[4], team: head ?? null };
}
const swName = (name, p) => p.swName ?? (() => { const w = name.split(" "); return `${w.slice(1).join(" ")}, ${w[0]}`; })();

/** → Map(normName → { gp, g, a, p, pim, pm, team, league, url }) for every configured player we could read. */
export async function outsideStats(year = 2027) {
  const cfg = await fs.readFile(path.join(CONFIG, "draft", `${year}-outside-stats.json`), "utf8").then(JSON.parse).catch(() => null);
  const out = new Map();
  if (!cfg?.players) return out;
  const pages = {};
  for (const [name, p] of Object.entries(cfg.players)) {
    if (p.kind === "manual") { out.set(normName(name), { gp: p.gp, g: p.g, a: p.a, p: p.p, team: p.team, league: p.league, url: p.url ?? null, asOf: p.asOf ?? null }); continue; }
    if (!p.url) continue;
    pages[p.url] ??= await get(p.url, { ttl: 900, text: true }).catch(() => null);
    const html = decode(String(pages[p.url] ?? ""));
    if (p.kind === "swehockey") { const s = swRow(html, swName(name, p)); if (s) out.set(normName(name), { ...s, team: p.team ?? s.team, league: p.league, url: p.url }); continue; }
    const names = [name, p.alias, ...name.normalize("NFD").replace(/[̀-ͯ]/g, "").split("|")].filter(Boolean);
    const s = row(html, [...new Set(names)], p.kind);
    if (s) out.set(normName(name), { ...s, team: p.team, league: p.league, url: p.url });
  }
  return out;
}
