// Line detection from NHL shift charts. Pure functions, no Node APIs:
// shared by the site build (Node) and the live game worker (Cloudflare).
//
// The game is cut into moments where the same skaters are on the ice. For each team we add up
// 5v5 time for every forward trio and D pair, PP/PK time for every unit, and count shots,
// attempts and goals for/against while each combo was out there.

export const secs = (t) => {
  if (!t) return 0;
  const [m, s] = String(t).split(":").map(Number);
  return m * 60 + s;
};

const keyOf = (ids) => [...ids].sort((a, b) => a - b).join("-");

export function rosterFromBox(box) {
  const players = {};
  for (const side of ["homeTeam", "awayTeam"]) {
    const stats = box?.playerByGameStats?.[side];
    if (!stats) continue;
    for (const grp of ["forwards", "defense", "goalies"]) {
      for (const p of stats[grp] || []) {
        players[p.playerId] = {
          id: p.playerId,
          name: p.name?.default ?? "",
          num: p.sweaterNumber ?? null,
          pos: grp === "forwards" ? "F" : grp === "defense" ? "D" : "G",
          posDetail: p.position,
          side: side === "homeTeam" ? "home" : "away",
          toi: p.toi ?? null,
          starter: !!p.starter,
          g: p.goals ?? 0, a: p.assists ?? 0, sog: p.sog ?? p.shotsAgainst ?? 0,
          svPct: p.savePctg ?? null,
        };
      }
    }
  }
  return players;
}

const ATTEMPTS = new Set(["shot-on-goal", "goal", "missed-shot", "blocked-shot"]);

/** analyze({ shifts, box, plays }) → { home, away, dataThrough } */
export function analyze({ shifts, box, plays = [] }) {
  const players = rosterFromBox(box);
  // Faceoffs taken tell us who actually played centre, whatever the roster says.
  const fo = {};
  for (const pl of plays) if (pl.typeDescKey === "faceoff") for (const id of [pl.details?.winningPlayerId, pl.details?.losingPlayerId]) if (id) fo[id] = (fo[id] ?? 0) + 1;
  /** Forwards in display order: left wing, centre, right wing. */
  const orderFwd = (ids) => {
    if (ids.length !== 3) return ids;
    const byFo = [...ids].sort((a, b) => (fo[b] ?? 0) - (fo[a] ?? 0));
    const c = (fo[byFo[0]] ?? 0) >= 2 && (fo[byFo[0]] ?? 0) > (fo[byFo[1]] ?? 0) ? byFo[0] : ids.find((id) => players[id]?.posDetail === "C") ?? byFo[0];
    const w = ids.filter((id) => id !== c);
    const rank = (id) => ({ L: 0, C: 1, R: 2 }[players[id]?.posDetail] ?? 1);
    w.sort((a, b) => rank(a) - rank(b));
    return [w[0], c, w[1]];
  };
  /** Power play / PK units: forwards first (centre in the middle when there are three), then defence. */
  const orderUnit = (ids) => {
    const f = ids.filter((id) => players[id]?.pos === "F"), d = ids.filter((id) => players[id]?.pos !== "F");
    return [...(f.length === 3 ? orderFwd(f) : f.sort((a, b) => (fo[b] ?? 0) - (fo[a] ?? 0))), ...d];
  };
  const list = (shifts || [])
    .filter((s) => s.typeCode === 517 && s.period <= 7 && players[s.playerId])
    .map((s) => {
      const base = (s.period - 1) * 1200;
      return { pid: s.playerId, a: base + secs(s.startTime), b: base + secs(s.endTime), period: s.period };
    })
    .filter((s) => s.b > s.a);

  const cuts = [...new Set(list.flatMap((s) => [s.a, s.b]))].sort((x, y) => x - y);
  const intervals = [];
  const starts = [...list].sort((x, y) => x.a - y.a);
  let si = 0;
  const active = new Set();
  for (let i = 0; i < cuts.length - 1; i++) {
    const t0 = cuts[i], t1 = cuts[i + 1];
    while (si < starts.length && starts[si].a <= t0) active.add(starts[si++]);
    for (const s of [...active]) if (s.b <= t0) active.delete(s);
    const on = { home: { F: [], D: [], G: 0 }, away: { F: [], D: [], G: 0 } };
    const seen = new Set();
    for (const s of active) {
      if (s.a > t0 || s.b < t1 || seen.has(s.pid)) continue;
      seen.add(s.pid);
      const p = players[s.pid];
      if (p.pos === "G") on[p.side].G++;
      else on[p.side][p.pos].push(p.id);
    }
    intervals.push({ t0, t1, period: Math.floor(t0 / 1200) + 1, on });
  }

  // Events → the interval that ends at or after them (t0 < t <= t1): a goal ends the shift.
  const events = [];
  for (const pl of plays) {
    if (!ATTEMPTS.has(pl.typeDescKey)) continue;
    if (pl.periodDescriptor?.periodType === "SO") continue;
    const d = pl.details || {};
    const shooter = d.scoringPlayerId ?? d.shootingPlayerId;
    const side = players[shooter]?.side;
    if (!side) continue;
    const t = (pl.periodDescriptor.number - 1) * 1200 + secs(pl.timeInPeriod);
    events.push({ t, side, type: pl.typeDescKey });
  }
  const findInterval = (t) => {
    let lo = 0, hi = intervals.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (intervals[mid].t1 >= t) { ans = mid; hi = mid - 1; } else lo = mid + 1;
    }
    return ans >= 0 && intervals[ans].t0 < t ? intervals[ans] : null;
  };
  for (const e of events) e.iv = findInterval(e.t);

  const result = {};
  for (const side of ["home", "away"]) {
    const opp = side === "home" ? "away" : "home";
    const trios = new Map(), pairs = new Map(), ppU = new Map(), pkU = new Map();
    const trioP = {}; // per period
    const toi = { es: 0, pp: 0, pk: 0 };
    const esToi = {}, ppToi = {}, pkToi = {}; // each player's own seconds by strength: decides which line is 1st, 2nd, ...
    const bump = (m, ids, dt) => { for (const id of ids) m[id] = (m[id] ?? 0) + dt; };
    const blank = () => ({ sec: 0, cf: 0, ca: 0, sf: 0, sa: 0, gf: 0, ga: 0 });
    const add = (m, ids, dt) => {
      const k = keyOf(ids);
      if (!m.has(k)) m.set(k, blank());
      m.get(k).sec += dt;
    };
    const state = new Map(); // interval → { trio, pair, pp, pk }
    for (const iv of intervals) {
      const us = iv.on[side], them = iv.on[opp];
      const nUs = us.F.length + us.D.length, nThem = them.F.length + them.D.length;
      if (us.G !== 1 || them.G !== 1 || nUs > 5 || nThem > 5 || nUs < 3 || nThem < 3) continue;
      const dt = iv.t1 - iv.t0, st = {};
      if (nUs === 5 && nThem === 5) {
        toi.es += dt;
        bump(esToi, [...us.F, ...us.D], dt);
        if (us.F.length === 3) {
          add(trios, us.F, dt); st.trio = keyOf(us.F);
          trioP[iv.period] ??= new Map(); add(trioP[iv.period], us.F, dt);
        }
        if (us.D.length === 2) { add(pairs, us.D, dt); st.pair = keyOf(us.D); }
      } else if (nUs > nThem) { toi.pp += dt; bump(ppToi, [...us.F, ...us.D], dt); add(ppU, [...us.F, ...us.D], dt); st.pp = keyOf([...us.F, ...us.D]); }
      else if (nUs < nThem) { toi.pk += dt; bump(pkToi, [...us.F, ...us.D], dt); add(pkU, [...us.F, ...us.D], dt); st.pk = keyOf([...us.F, ...us.D]); }
      state.set(iv, st);
    }
    // On-ice event counts per combo.
    for (const e of events) {
      const st = e.iv && state.get(e.iv);
      if (!st) continue;
      const mine = e.side === side;
      for (const [m, k] of [[trios, st.trio], [pairs, st.pair], [ppU, st.pp], [pkU, st.pk]]) {
        if (!k || !m.has(k)) continue;
        const c = m.get(k);
        if (mine) { c.cf++; if (e.type === "shot-on-goal" || e.type === "goal") c.sf++; if (e.type === "goal") c.gf++; }
        else { c.ca++; if (e.type === "shot-on-goal" || e.type === "goal") c.sa++; if (e.type === "goal") c.ga++; }
      }
    }

    const ranked = (m) => [...m.entries()].sort((a, b) => b[1].sec - a[1].sec).map(([k, v]) => ({ ids: k.split("-").map(Number), ...v }));
    const pick = (m, max, minSec) => {
      const used = new Set(), out = [];
      for (const c of ranked(m)) {
        if (out.length >= max || c.sec < minSec) break;
        if (c.ids.some((id) => used.has(id))) continue;
        c.ids.forEach((id) => used.add(id)); out.push(c);
      }
      // 11F/7D lineups: fill the last slot with a combo that adds an unused player.
      for (const c of ranked(m)) {
        if (out.length >= max || c.sec < minSec) break;
        if (out.some((o) => keyOf(o.ids) === keyOf(c.ids))) continue;
        if (!c.ids.some((id) => !used.has(id))) continue;
        c.ids.forEach((id) => used.add(id)); out.push({ ...c, shared: true });
      }
      return out;
    };
    const units = (m, minSec) => {
      const out = [];
      for (const c of ranked(m).filter((c) => c.ids.length >= 4 && c.sec >= minSec)) {
        if (out.length >= 2) break;
        if (out.every((o) => o.ids.filter((id) => c.ids.includes(id)).length <= 1)) out.push(c);
      }
      return out;
    };

    const mine = Object.values(players).filter((p) => p.side === side);
    // Grouping comes from who played together most; NUMBERING comes from the players' own ice time.
    // (Sorting by time-together put an intact 4th line above a top line that got split up for the PP or a line
    // blender.) A combo's depth = its members' average of 5v5 + power-play time for forwards (4th liners don't
    // get PP time, and PK minutes would promote checkers), and all situations for D pairs.
    const own = (id) => (esToi[id] ?? 0) + (ppToi[id] ?? 0) + (players[id]?.pos === "D" ? pkToi[id] ?? 0 : 0);
    // Trios use the middle player's time (one PP specialist can't drag two depth forwards up); pairs the average.
    const depth = (c) => {
      const v = c.ids.map(own).sort((a, b) => a - b);
      return v.length === 3 ? v[1] : v.reduce((s, x) => s + x, 0) / v.length;
    };
    // (Opening-shift rotation order was tried as the numbering signal and rejected: coaches often open with a
    // matchup or checking line, which put McDavid's line 2nd and Tampa's checkers 1st.)
    const byDepth = (list) => list.sort((a, b) => depth(b) - depth(a));
    const lines = byDepth(pick(trios, 4, 30)), dpairs = byDepth(pick(pairs, 3, 30));
    const placed = new Set([...lines, ...dpairs].flatMap((c) => c.ids));
    const periods = Object.keys(trioP).map(Number).sort((a, b) => a - b);
    const byPeriod = Object.fromEntries(periods.map((p) => [p, byDepth(pick(trioP[p], 4, 20)).map((c) => orderFwd(c.ids))]));

    result[side] = {
      toi, lines: lines.map((c) => ({ ...c, ids: orderFwd(c.ids) })), pairs: dpairs,
      pp: units(ppU, 20).map((c) => ({ ...c, ids: orderUnit(c.ids) })), pk: units(pkU, 20).map((c) => ({ ...c, ids: orderUnit(c.ids) })),
      extras: mine.filter((p) => p.pos !== "G" && !placed.has(p.id)).map((p) => p.id),
      dressed: mine.map((p) => p.id),
      // The box score's starter flag can be missing mid-game; fall back to the goalie with shifts in this game.
      goalie: mine.find((p) => p.pos === "G" && p.starter)?.id ?? list.filter((s) => players[s.pid]?.side === side && players[s.pid].pos === "G").at(0)?.pid ?? null,
      byPeriod,
      players: Object.fromEntries(mine.map((p) => [p.id, p])),
      // Each skater's depth seconds this game: forwards 5v5 + power play (scoring lines get PP time, checkers' PK time is left
      // out), D all situations. Averaged over several games by the caller to number the lines.
      depthToi: Object.fromEntries(mine.filter((p) => p.pos !== "G" && own(p.id) > 0).map((p) => [p.id, own(p.id)])),
    };
  }
  result.dataThrough = list.length ? Math.max(...list.map((s) => s.b)) : 0;
  return result;
}

/** Same trio/pair as before? */
export const sameCombo = (a, b) => keyOf(a) === keyOf(b);
export { keyOf };
