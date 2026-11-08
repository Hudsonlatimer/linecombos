// Rule-based post reader: no AI needed for most posts, because we already know every roster.
// "Suzuki - Caufield - Slafkovsky" → a forward line, matched to player ids by surname.
// Pure functions (shared with any worker).

export const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[’`]/g, "'").replace(/[^a-z' -]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Build a lookup from players: [{ id, first, last, team, pos }] (pos: C/L/R/D/G).
 * Teams can be NHL abbreviations or national team codes.
 */
export function buildIndex(players, teamAliases = {}) {
  const byLast = new Map(), byFull = new Map();
  for (const p of players) {
    const last = norm(p.last), full = norm(`${p.first} ${p.last}`);
    if (!last) continue;
    if (!byLast.has(last)) byLast.set(last, []);
    byLast.get(last).push(p);
    byFull.set(full, p);
    // "J. Slafkovsky" style
    const init = `${norm(p.first)[0] ?? ""} ${last}`;
    if (!byFull.has(init)) byFull.set(init, p); else byFull.set(init, null); // ambiguous initials
  }
  const aliases = [];
  for (const [team, words] of Object.entries(teamAliases)) for (const w of words) aliases.push([norm(w.replace(/^#/, "")), team, w.startsWith("#")]);
  return { byLast, byFull, aliases, players };
}

function teamMentions(text, idx) {
  const t = " " + norm(text.replace(/#/g, " ")) + " ";
  const hits = {};
  for (const [w, team] of idx.aliases) if (w && t.includes(` ${w} `)) hits[team] = (hits[team] || 0) + 1;
  return hits;
}

/** Match one name token ("Slafkovsky", "J. Slafkovsky", "Juraj Slafkovsky") → candidates. */
function matchToken(tok, idx) {
  let s = tok.replace(/\(.*?\)/g, " ").replace(/\b(c|a|g|lw|rw|ld|rd)\b\.?$/i, "");
  s = norm(s.replace(/\./g, " . ").replace(/\s+\.\s+/g, " "));
  s = s.replace(/^(l\d|d\d|g|pp\d|line \d|pair \d)\s+/, "").trim();
  if (!s || s.length < 2) return [];
  if (idx.byFull.get(s)) return [idx.byFull.get(s)];
  const parts = s.split(" ");
  // Try progressively shorter tails: "van riemsdyk", "riemsdyk"
  for (let i = 0; i < parts.length; i++) {
    const tail = parts.slice(i).join(" ");
    const c = idx.byLast.get(tail);
    if (c?.length) {
      if (c.length > 1 && i > 0) {
        const initial = parts[0][0];
        const narrowed = c.filter((p) => norm(p.first).startsWith(initial));
        if (narrowed.length) return narrowed;
      }
      return c;
    }
  }
  return [];
}

const SPLIT = /\s*(?:\s[-–—]\s|[–—]|(?<=[a-z.])-(?=[A-Z])|\s-|-\s)\s*/;

/** Pull dash-separated groups of names out of a post. */
function extractGroups(text, idx) {
  const segs = text.split(/\n|;|\||•|\/(?=\s)/).map((s) => s.trim()).filter(Boolean);
  const groups = [];
  for (const seg of segs) {
    const clean = seg.replace(/^[\s\d.)#:*-]*(?:(?:line|l|d|pair|pp|g|goalie|f|fwd)\s*\d*\s*[:.)-])?\s*/i, "");
    const toks = clean.split(SPLIT).map((t) => t.trim()).filter(Boolean);
    if (toks.length < 2 || toks.length > 5) continue;
    const matched = toks.map((t) => matchToken(t, idx));
    if (matched.filter((m) => m.length).length < Math.max(2, toks.length - 1)) continue;
    groups.push(matched);
  }
  return groups;
}

const RE = {
  roster: /\b(recall(?:ed|s)?|assign(?:ed|s)?|loan(?:ed)?|claim(?:ed)?|waivers|signed|sign(?:s|ing)|traded|acquire[ds]?|activated|reassigned|called up|sent down|placed .{0,40}\bon (?:ir|ltir|waivers)|pto)\b/i,
  injury: /\b(injur\w*|ir\b|ltir|day-to-day|upper[- ]body|lower[- ]body|out (?:indefinitely|for|tonight|with)|won'?t play|will miss|expected to return|return(?:s|ing)? to the lineup|week-to-week|game-time decision|did not return|didn'?t return|scratch(?:ed)?|illness)\b/i,
  goalie: /\b(start(?:s|ing)?\b(?! of)|in goal|in net|gets? the (?:start|net|nod)|between the pipes|first (?:goalie )?off the ice|starter)\b/i,
  lines: /\b(lines?|rushes|line combos|pairings?|warmups?|morning skate|pp1|pp2|power play)\b/i,
};

/**
 * parsePost(text, idx) → { type, team, lines, pairs, goalie, players, confidence }
 * type: lines | goalie | injury | roster | news | other
 */
export function parsePost(text, idx) {
  const groups = extractGroups(text, idx);
  const teamVotes = teamMentions(text, idx);
  const allCands = groups.flat().flat();
  // Single-name mentions anywhere in the text (for injury/roster/goalie posts).
  const words = norm(text).split(" ");
  const mentioned = [];
  for (let i = 0; i < words.length; i++) {
    for (const len of [3, 2, 1]) {
      const chunk = words.slice(i, i + len).join(" ");
      if (len === 1 && chunk.length < 4) continue;
      const hit = idx.byFull.get(chunk) || (len === 1 ? null : null);
      if (hit) { mentioned.push(hit); break; }
      if (len === 2) {
        const c = idx.byLast.get(words[i + 1]);
        if (c?.length && c.some((p) => norm(p.first) === words[i])) { mentioned.push(c.find((p) => norm(p.first) === words[i])); break; }
      }
    }
  }
  for (const p of [...allCands, ...mentioned]) teamVotes[p.team] = (teamVotes[p.team] || 0) + (allCands.includes(p) ? 1 : 2);
  const team = Object.entries(teamVotes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const pickOne = (cands) => cands.find((p) => p.team === team) ?? (cands.length === 1 ? cands[0] : null);

  const resolved = groups.map((g) => g.map(pickOne)).filter((g) => g.filter(Boolean).length >= 2);
  const lines = [], pairs = [];
  let goalie = null;
  for (const g of resolved) {
    const ps = g.filter(Boolean);
    if (ps.every((p) => p.pos === "D") && ps.length === 2) pairs.push(ps.map((p) => p.id));
    else if (ps.length >= 2 && ps.length <= 3 && ps.every((p) => p.pos !== "D" && p.pos !== "G")) lines.push(ps.map((p) => p.id));
    else if (ps.length === 2 && ps.every((p) => p.pos === "G")) goalie ??= ps[0].id; // "G: A - B" → first listed starts
  }
  const players = [...new Set([...resolved.flat().filter(Boolean), ...mentioned.filter((p) => p.team === team)].map((p) => p.id))];

  let type = "other";
  if (lines.length >= 2 || (lines.length >= 1 && pairs.length >= 1)) type = "lines";
  else if (RE.goalie.test(text) && mentioned.some((p) => p.pos === "G")) { type = "goalie"; goalie ??= mentioned.find((p) => p.pos === "G" && p.team === team)?.id ?? mentioned.find((p) => p.pos === "G").id; }
  else if (RE.roster.test(text) && players.length) type = "roster";
  else if (RE.injury.test(text) && players.length) type = "injury";
  else if (team) type = "news";

  const confidence = type === "lines" ? Math.min(1, (lines.length * 3 + pairs.length * 2) / 18) : players.length ? 0.8 : 0.4;
  return { type, team, lines, pairs, goalie, players, confidence: Math.round(confidence * 100) / 100 };
}
