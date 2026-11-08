// Line combinations from Daily Faceoff's public team pages. Each team's page names the reporter or team account its
// latest lines came from and links that original post; the site shows that post as the source ("via Daily Faceoff").
// Only the combinations and the source are used.
import { get, pool } from "./http.mjs";
import { normName } from "./moves.mjs";

const BASE = "https://www.dailyfaceoff.com/teams";

const nextData = (html) => {
  const m = String(html ?? "").match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
};

/** Map a Daily Faceoff player name to an NHL id: same team first, then anyone (recent trades), by full name then last name. */
function matcher(people) {
  const all = Object.values(people).filter((p) => p.first && p.last);
  const full = (p) => normName(`${p.first} ${p.last}`);
  return (name, team, goalie) => {
    const n = normName(name), last = n.split(" ").slice(1).join(" "), tail = n.split(" ").at(-1);
    const pools = [all.filter((p) => p.team === team), all];
    for (const ps of pools) {
      const pos = (p) => (goalie ? p.pos === "G" : p.pos !== "G");
      const hit = ps.find((p) => full(p) === n) ?? ps.find((p) => normName(p.last) === last && pos(p)) ?? (ps === pools[0] ? ps.find((p) => normName(p.last) === tail && pos(p)) : null);
      if (hit) return hit.id;
    }
    return null;
  };
}

/** What a team's lines are based on. Daily Faceoff's sourceName is either a reporter/team account (a real report),
 *  "Last Game (YYYY-MM-DD)" (they copied the last game's lineup, linked to NHL.com), or "DFO Projections" (their guess).
 *  Only a reporter's post counts as Reported. Private links (e.g. an internal Slack) fall back to the team page. */
function source(c, viaUrl) {
  const name = String(c.sourceName ?? "").trim(), url = String(c.source ?? "").trim();
  const last = name.match(/^last game\s*\((\d{4}-\d\d-\d\d)\)/i);
  if (last) return { kind: "lastgame", author: `last game's lineup (${last[1]})`, url: url || viaUrl, lastGame: last[1] };
  if (!name || /dfo projection|daily faceoff projection/i.test(name)) return { kind: "projection", author: "Daily Faceoff projection", url: viaUrl };
  const isPublic = /^https?:\/\//.test(url) && !/slack\.com|localhost|internal/i.test(url);
  return { kind: "report", author: name, url: isPublic ? url : viaUrl };
}

/** → { [abbrev]: { lines, pairs, pp, pk, goalies, author, url, createdAt, via, viaUrl, unmatched } } */
export async function dfoLines(teams, people) {
  const idOf = matcher(people);
  const out = {};
  await pool(teams, 4, async (t) => {
    const viaUrl = `${BASE}/${t.slug}/line-combinations`;
    const c = nextData(await get(viaUrl, { ttl: 1800, text: true }).catch(() => null))?.props?.pageProps?.combinations;
    if (!c?.players?.length) return;
    const unmatched = [];
    const group = (g, order) => {
      const ps = c.players.filter((p) => p.groupIdentifier === g).sort((a, b) => order.indexOf(a.positionIdentifier) - order.indexOf(b.positionIdentifier));
      // Players we can't match (not on an NHL roster in our data) stay in the line as a name-only card.
      return ps.map((p) => { const id = idOf(p.name, t.abbrev, /^g/.test(p.positionIdentifier)); if (!id) unmatched.push(p.name); return id ?? `name:${p.name}|${p.jerseyNumber ?? ""}`; });
    };
    const F = ["lw", "c", "rw"], D = ["ld", "rd"], SK = ["sk1", "sk2", "sk3", "sk4", "sk5"];
    out[t.abbrev] = {
      lines: ["f1", "f2", "f3", "f4"].map((g) => group(g, F)).filter((l) => l.length),
      pairs: ["d1", "d2", "d3"].map((g) => group(g, D)).filter((l) => l.length),
      pp: ["pp1", "pp2"].map((g) => group(g, SK)).filter((l) => l.length),
      pk: ["pk1", "pk2"].map((g) => group(g, SK)).filter((l) => l.length),
      goalies: group("g", ["g1", "g2"]),
      ...source(c, viaUrl), createdAt: c.updatedAt ?? null,
      via: "Daily Faceoff", viaUrl, unmatched: [...new Set(unmatched)],
    };
  });
  return out;
}
