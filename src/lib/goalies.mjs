// Tonight's starting-goalie reports, from Daily Faceoff's public starting-goalies page. Each entry names the reporter
// or team account that announced the start and links their original post, so on the site the source shown is that
// post (credited "via Daily Faceoff"). Only the status, the goalie and the source link are used.
import { get } from "./http.mjs";
import { normName } from "./moves.mjs";

const PAGE = "https://www.dailyfaceoff.com/starting-goalies";

/** → { [teamAbbrev]: { name, status: "confirmed" | "likely", author, url, createdAt, text, via, viaUrl } } */
export async function goalieReports() {
  const html = await get(PAGE, { ttl: 600, text: true }).catch(() => null);
  const m = String(html ?? "").match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!m) return {};
  let games = [];
  try { games = JSON.parse(m[1])?.props?.pageProps?.data ?? []; } catch { return {}; }
  const out = {};
  for (const g of games) for (const s of ["home", "away"]) {
    const abbr = g[`${s}TeamAbbreviation`], status = String(g[`${s}NewsStrengthName`] ?? "").toLowerCase();
    if (!abbr || !g[`${s}GoalieName`] || !["confirmed", "likely"].includes(status)) continue;
    out[abbr] = {
      name: g[`${s}GoalieName`], status,
      author: g[`${s}NewsSourceName`] || "Daily Faceoff", url: g[`${s}NewsSourceUrl`] || PAGE,
      createdAt: g[`${s}NewsCreatedAt`] ?? null, text: String(g[`${s}NewsDetails`] ?? "").trim(),
      via: "Daily Faceoff", viaUrl: PAGE,
    };
  }
  return out;
}

/** The NHL player id for a reported goalie: same team, a goalie, same (accent-insensitive) name. */
export function goalieId(name, team, people) {
  const n = normName(name), last = n.split(" ").slice(1).join(" ");
  const gs = Object.values(people).filter((p) => p.team === team && p.pos === "G");
  return (gs.find((p) => normName(`${p.first} ${p.last}`) === n) ?? gs.find((p) => normName(p.last) === last))?.id ?? null;
}
