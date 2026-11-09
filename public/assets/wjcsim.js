// World Juniors tournament simulation. Pure functions, shared by the build (pre-computed odds) and the browser
// (live odds that react to results, your edits and rating changes).
//
// A game is two Poisson goal counts with rates set by the rating gap; regulation ties go to overtime and a shootout.
// Group stage: round robin in two groups of five (3 points regulation win, 2 overtime or shootout win, 1 overtime loss).
// Then the top four of each group play quarterfinals, the two fifth-place teams play one relegation game, and the medal games follow.

const C_GAP = 0.2;      // how fast scoring rates move with the rating gap
const TIE_BOOST = 0.08; // regulation ties are a touch more common than independent goals say
export const QF_SLOTS = [{ n: 22, a: ["A", 1], b: ["B", 4] }, { n: 23, a: ["B", 2], b: ["A", 3] }, { n: 24, a: ["B", 1], b: ["A", 4] }, { n: 25, a: ["A", 2], b: ["B", 3] }];

export function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function poisson(l, r) { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; }
const pmf = (l, n = 16) => { const o = [Math.exp(-l)]; for (let k = 1; k <= n; k++) o.push((o[k - 1] * l) / k); return o; };

/** Expected goals for each side, from the two ratings. */
export function rates(ra, rb, T = 5.8) { const d = ra - rb; return [(T / 2) * Math.exp(C_GAP * d), (T / 2) * Math.exp(-C_GAP * d)]; }

/** One game: win chance for A (overtime included), overtime chance, expected goals, likeliest scores. */
export function gameProb(ra, rb, { T = 5.8 } = {}) {
  const [la, lb] = rates(ra, rb, T), pa = pmf(la), pb = pmf(lb);
  let win = 0, tie = 0, loss = 0; const grid = [];
  for (let i = 0; i < pa.length; i++) for (let j = 0; j < pb.length; j++) {
    const p = pa[i] * pb[j]; grid.push([i, j, p]);
    if (i > j) win += p; else if (i < j) loss += p; else tie += p;
  }
  const s = win + tie + loss; win /= s; tie /= s; loss /= s;
  const t2 = Math.min(0.5, tie * (1 + TIE_BOOST)), k = (1 - t2) / (1 - tie); win *= k; loss *= k;
  const otA = 0.5 + 0.25 * (la / (la + lb) - 0.5);
  grid.sort((x, y) => y[2] - x[2]);
  return { win: win + t2 * otA, regWin: win, regLoss: loss, ot: t2, otA, la, lb, top: grid.slice(0, 3).map(([a, b, p]) => ({ a, b, p })) };
}

const pairKey = (a, b) => [a, b].sort().join("|");

/**
 * Simulate the tournament.
 * teams: [{ code, group }], schedule: [{ n, a, b, round }], ratings: { code: goals/game vs average },
 * results: { [gameNo]: { a, b, ot } } for finished group games (a/b follow the schedule's order),
 * playoffResults: { "A|B": { winner, goals: { A: n, B: n } } } for finished playoff games (codes sorted in the key).
 */
export function simulate({ teams, schedule, ratings, results = {}, playoffResults = {}, T = 5.8, sims = 20000, seed = 20261226 }) {
  const codes = teams.map((t) => t.code), grp = Object.fromEntries(teams.map((t) => [t.code, t.group]));
  const groups = { A: codes.filter((c) => grp[c] === "A"), B: codes.filter((c) => grp[c] === "B") };
  const gGames = schedule.filter((g) => /^Group/.test(g.round));
  const rt = (c) => ratings[c] ?? 0;
  const cache = new Map();
  const pWin = (a, b) => { const k = `${a}|${b}`; let v = cache.get(k); if (v == null) { v = gameProb(rt(a), rt(b), { T }).win; cache.set(k, v); } return v; };
  const fixed = (a, b) => playoffResults[pairKey(a, b)]?.winner ?? null;
  const decide = (a, b, r) => fixed(a, b) ?? (r() < pWin(a, b) ? a : b);

  const games = {};
  for (const g of gGames) {
    const p = gameProb(rt(g.a), rt(g.b), { T });
    games[g.n] = { n: g.n, a: g.a, b: g.b, pa: +p.win.toFixed(4), pb: +(1 - p.win).toFixed(4), ot: +p.ot.toFixed(3), la: +p.la.toFixed(2), lb: +p.lb.toFixed(2),
      top: p.top.map((x) => ({ a: x.a, b: x.b, p: +x.p.toFixed(3) })), result: results[g.n] ?? null };
  }

  const r = rng(seed);
  const acc = Object.fromEntries(codes.map((c) => [c, { rank: [0, 0, 0, 0, 0], pts: 0, qf: 0, sf: 0, final: 0, gold: 0, silver: 0, bronze: 0, rel: 0 }]));
  const slotSeen = {};
  const note = (slot, a, b) => { const k = `${a}-${b}`; const m = (slotSeen[slot] ??= {}); m[k] = (m[k] ?? 0) + 1; };

  for (let s = 0; s < sims; s++) {
    const st = Object.fromEntries(codes.map((c) => [c, { pts: 0, gf: 0, ga: 0 }]));
    for (const g of gGames) {
      const res = results[g.n];
      let ga, gb, ot = null;
      if (res) { ga = res.a; gb = res.b; ot = res.ot ?? null; }
      else {
        const [la, lb] = rates(rt(g.a), rt(g.b), T);
        ga = poisson(la, r); gb = poisson(lb, r);
        if (ga === gb) { ot = "OT"; if (r() < 0.5 + 0.25 * (la / (la + lb) - 0.5)) ga++; else gb++; }
      }
      const A = st[g.a], B = st[g.b]; A.gf += ga; A.ga += gb; B.gf += gb; B.ga += ga;
      const aw = ga > gb;
      if (ot) { (aw ? A : B).pts += 2; (aw ? B : A).pts += 1; } else (aw ? A : B).pts += 3;
    }
    const order = {};
    for (const G of ["A", "B"]) {
      const tb = Object.fromEntries(groups[G].map((c) => [c, r()]));
      order[G] = [...groups[G]].sort((x, y) => st[y].pts - st[x].pts || (st[y].gf - st[y].ga) - (st[x].gf - st[x].ga) || st[y].gf - st[x].gf || tb[y] - tb[x]);
      order[G].forEach((c, i) => { acc[c].rank[i]++; acc[c].pts += st[c].pts; });
    }
    { const a = order.A[4], b = order.B[4]; const w = decide(a, b, r); acc[w === a ? b : a].rel++; }
    const at = (G, i) => order[G][i - 1];
    const qf = QF_SLOTS.map((q) => [at(...q.a), at(...q.b)]);
    qf.forEach(([a, b], i) => { acc[a].qf++; acc[b].qf++; note(`QF${i + 1}`, a, b); });
    const w = qf.map(([a, b]) => decide(a, b, r));
    const sfPairs = [[w[0], w[1]], [w[2], w[3]]];
    sfPairs.forEach(([a, b], i) => { acc[a].sf++; acc[b].sf++; note(`SF${i + 1}`, a, b); });
    const sw = sfPairs.map(([a, b]) => decide(a, b, r)), sl = sfPairs.map(([a, b], i) => (sw[i] === a ? b : a));
    acc[sw[0]].final++; acc[sw[1]].final++; note("Final", sw[0], sw[1]);
    const gold = decide(sw[0], sw[1], r); acc[gold].gold++; acc[gold === sw[0] ? sw[1] : sw[0]].silver++;
    acc[decide(sl[0], sl[1], r)].bronze++;
    note("Bronze", sl[0], sl[1]);
  }

  const odds = {};
  for (const c of codes) {
    const a = acc[c];
    odds[c] = { code: c, group: grp[c], rating: rt(c), pts: +(a.pts / sims).toFixed(2), rank: a.rank.map((x) => +(x / sims).toFixed(4)), winGroup: a.rank[0] / sims, qf: a.qf / sims, sf: a.sf / sims, final: a.final / sims,
      gold: a.gold / sims, silver: a.silver / sims, bronze: a.bronze / sims, medal: (a.gold + a.silver + a.bronze) / sims, rel: a.rel / sims, top2: (a.rank[0] + a.rank[1]) / sims };
  }

  // Mock bracket: seed each group by expected finish, then take the favourite (or the actual winner) in every game.
  const seedOrder = (G) => [...groups[G]].sort((x, y) => odds[y].pts - odds[x].pts || odds[y].rating - odds[x].rating);
  const SO = { A: seedOrder("A"), B: seedOrder("B") };
  const get = ([G, i]) => SO[G][i - 1];
  const mk = (n, label, a, b) => {
    const p = pWin(a, b), pr = gameProb(rt(a), rt(b), { T }), fx = playoffResults[pairKey(a, b)] ?? null;
    return { n, label, a, b, pa: +p.toFixed(3), win: fx ? fx.winner : p >= 0.5 ? a : b, la: +pr.la.toFixed(1), lb: +pr.lb.toFixed(1), result: fx ? { a: fx.goals?.[a] ?? null, b: fx.goals?.[b] ?? null, ot: fx.ot ?? null } : null };
  };
  const bQF = QF_SLOTS.map((q, i) => mk(q.n, `Quarterfinal ${i + 1}`, get(q.a), get(q.b)));
  const bSF = [mk(26, "Semifinal 1", bQF[0].win, bQF[1].win), mk(27, "Semifinal 2", bQF[2].win, bQF[3].win)];
  const loser = (m) => (m.win === m.a ? m.b : m.a);
  const bBronze = mk(28, "Bronze medal", loser(bSF[0]), loser(bSF[1]));
  const bFinal = mk(29, "Gold medal", bSF[0].win, bSF[1].win);
  const bRel = mk(21, "Relegation", SO.A[4], SO.B[4]);
  const bracket = { seeds: SO, qf: bQF, sf: bSF, bronze: bBronze, final: bFinal, relegation: bRel, champion: bFinal.win, silver: loser(bFinal), bronzeWinner: bBronze.win };
  const slots = Object.fromEntries(Object.entries(slotSeen).map(([k, m]) => [k, Object.entries(m).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([pair, n]) => ({ pair: pair.split("-"), p: +(n / sims).toFixed(3) }))]));
  return { sims, T, odds, games, bracket, slots, groups };
}

// ---------- results from Wikipedia ----------
// Wikipedia's tournament page holds one {{Ice hockey box}} per game, filled in as games finish.
/** Wikitext → [{ a, b, ga, gb, ot, date }] for every finished game it lists. */
export function parseWiki(wikitext, validCodes) {
  const out = [], text = String(wikitext ?? ""), re = /\{\{\s*Ice hockey box/gi;
  let m;
  while ((m = re.exec(text))) {
    let depth = 0, i = m.index, end = -1;
    for (; i < text.length - 1; i++) {
      if (text[i] === "{" && text[i + 1] === "{") { depth++; i++; } else if (text[i] === "}" && text[i + 1] === "}") { depth--; i++; if (!depth) { end = i + 1; break; } }
    }
    if (end < 0) break;
    const block = text.slice(m.index, end); re.lastIndex = end;
    const f = (k) => (block.match(new RegExp(`\\|\\s*${k}\\s*=\\s*([^\\n]*)`, "i")) ?? [])[1] ?? "";
    const code = (s) => (s.match(/\{\{\s*[a-z-]+\s*\|\s*([A-Z]{3})/i) ?? [])[1]?.toUpperCase();
    const a = code(f("team1")), b = code(f("team2")), sc = f("score"), sm = sc.match(/(\d+)\s*[–\-]\s*(\d+)/);
    if (!a || !b || !sm || (validCodes && (!validCodes.has(a) || !validCodes.has(b)))) continue;
    const periods = (f("periods").match(/\d+\s*[–\-]\s*\d+/g) ?? []).length;
    const ot = /\b(OT|SO|GWS|overtime|shootout)\b/i.test(sc) ? (/\b(SO|GWS|shootout)\b/i.test(sc) ? "SO" : "OT") : periods > 3 ? "OT" : null;
    const d = Date.parse(`${f("date").replace(/\[|\]/g, "").trim()} UTC`);
    out.push({ a, b, ga: +sm[1], gb: +sm[2], ot, date: Number.isNaN(d) ? null : new Date(d).toISOString().slice(0, 10) });
  }
  return out;
}

/** Split parsed games into group results (by schedule game number) and playoff results (by team pair). */
export function matchResults(parsed, schedule) {
  const results = {}, playoffResults = {};
  const group = schedule.filter((g) => /^Group/.test(g.round)), firstPlayoff = (schedule.find((g) => !/^Group/.test(g.round))?.utc ?? "9999").slice(0, 10);
  for (const p of parsed) {
    const isPlayoff = p.date && p.date >= firstPlayoff;
    if (!isPlayoff) {
      const g = group.find((x) => pairKey(x.a, x.b) === pairKey(p.a, p.b));
      if (g && !results[g.n]) results[g.n] = g.a === p.a ? { a: p.ga, b: p.gb, ot: p.ot } : { a: p.gb, b: p.ga, ot: p.ot };
    } else {
      playoffResults[pairKey(p.a, p.b)] = { winner: p.ga > p.gb ? p.a : p.b, goals: { [p.a]: p.ga, [p.b]: p.gb }, ot: p.ot };
    }
  }
  return { results, playoffResults };
}
