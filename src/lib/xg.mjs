// Expected goals (xG): the chance each unblocked shot becomes a goal, from where and how it was taken.
// A logistic model on distance, angle, shot type, rebounds, rushes and strength, fitted on NHL play-by-play.
// Team xG is a steadier read of how well a team plays than goals, so the game predictor rates teams on it.

const TYPES = ["wrist", "snap", "slap", "backhand", "tip-in", "deflected", "wrap-around"];
const SHOTS = new Set(["shot-on-goal", "missed-shot", "goal"]);
const secs = (t) => { const [m, s] = String(t ?? "0:0").split(":").map(Number); return m * 60 + s; };

/** Every unblocked shot in a game with its features. Shootout attempts are skipped; empty-net shots are flagged. */
export function shotsOf(pbp) {
  const home = pbp?.homeTeam?.id, out = [];
  let prev = null;
  for (const p of pbp?.plays ?? []) {
    const pd = p.periodDescriptor ?? {};
    if (pd.periodType === "SO") break;
    const d = p.details ?? {}, t = (pd.number - 1) * 1200 + secs(p.timeInPeriod);
    if (SHOTS.has(p.typeDescKey) && d.xCoord != null) {
      const isHome = d.eventOwnerTeamId === home;
      // The net being shot at. Checked against the feed's coordinates: when homeTeamDefendingSide is "right",
      // home shots are at negative x, so the home team shoots at x = -89.
      const defLeft = p.homeTeamDefendingSide === "left";
      const netX = (isHome ? defLeft : !defLeft) ? 89 : -89;
      const dx = Math.abs(netX - d.xCoord), dy = Math.abs(d.yCoord ?? 0);
      const dist = Math.hypot(dx, dy), angle = (Math.atan2(dy, Math.max(dx, 0.5)) * 180) / Math.PI;
      const sc = String(p.situationCode ?? "1551");
      const [aG, aS, hS, hG] = [sc[0] === "1", +sc[1], +sc[2], sc[3] === "1"];
      const mine = isHome ? hS : aS, theirs = isHome ? aS : hS, en = isHome ? !aG : !hG;
      const rebound = prev && prev.shot && prev.home === isHome && t - prev.t <= 3;
      // Zone codes are from the event owner's view; flip them to the shooter's view.
      const pz = prev && (prev.home === isHome ? prev.zone : { O: "D", D: "O", N: "N" }[prev.zone]);
      const rush = prev && t - prev.t <= 4 && pz && pz !== "O";
      out.push({ by: d.shootingPlayerId ?? d.scoringPlayerId ?? null, a1: d.assist1PlayerId ?? null, a2: d.assist2PlayerId ?? null, goalie: d.goalieInNetId ?? null, home: isHome, t, goal: p.typeDescKey === "goal", dist, angle, type: d.shotType ?? "wrist", rebound: !!rebound, rush: !!rush, pp: mine > theirs, sh: mine < theirs, ev5: mine === 5 && theirs === 5, en, angleChange: rebound ? Math.abs(angle - prev.angle) : 0 });
      prev = { t, home: isHome, shot: true, zone: d.zoneCode, angle };
    } else if (d.zoneCode || p.typeDescKey === "blocked-shot") prev = { t, home: d.eventOwnerTeamId === home, shot: false, zone: d.zoneCode };
  }
  return out;
}

export function features(s) {
  const ld = Math.log(Math.max(s.dist, 1));
  return [1, ld, s.dist / 100, s.angle / 90, (s.angle / 90) ** 2, ...TYPES.map((t) => +(s.type === t)), +s.rebound, (s.angleChange / 90) * +s.rebound, +s.rush, +s.pp, +s.sh];
}

/** Fit by gradient descent with a little L2. Returns coefficient list. */
export function fit(shots, { iters = 1500, lr = 2, l2 = 1e-5 } = {}) {
  const X = shots.map(features), y = shots.map((s) => +s.goal), n = X.length, k = X[0].length;
  const w = new Array(k).fill(0); w[0] = Math.log(0.07 / 0.93);
  // Adam
  const m = new Array(k).fill(0), v = new Array(k).fill(0);
  for (let it = 1; it <= iters; it++) {
    const g = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      let z = 0; for (let j = 0; j < k; j++) z += w[j] * X[i][j];
      const e = 1 / (1 + Math.exp(-z)) - y[i];
      for (let j = 0; j < k; j++) g[j] += e * X[i][j];
    }
    for (let j = 0; j < k; j++) {
      const gj = g[j] / n + (j ? l2 * w[j] : 0);
      m[j] = 0.9 * m[j] + 0.1 * gj; v[j] = 0.999 * v[j] + 0.001 * gj * gj;
      w[j] -= (lr * 0.1 * (m[j] / (1 - 0.9 ** it))) / (Math.sqrt(v[j] / (1 - 0.999 ** it)) + 1e-8);
    }
  }
  return w;
}

export const xgOf = (w, s) => { const f = features(s); let z = 0; for (let j = 0; j < f.length; j++) z += w[j] * f[j]; return 1 / (1 + Math.exp(-z)); };

/** Per-team totals for one game: xG (all situations and 5v5, empty-net shots excluded) and unblocked shots,
 *  plus each goalie's expected and actual goals against (for goals saved above expected). */
export function gameXg(w, pbp) {
  const o = { h: { xg: 0, xg5: 0, ff: 0 }, a: { xg: 0, xg5: 0, ff: 0 }, goalies: {} };
  const lastG = {};
  for (const s of shotsOf(pbp)) {
    if (s.en) continue;
    const x = xgOf(w, s), side = s.home ? o.h : o.a;
    side.xg += x; side.ff++;
    if (s.ev5) side.xg5 += x;
    const def = s.home ? "a" : "h", g = s.goalie ?? lastG[def];
    if (s.goalie) lastG[def] = s.goalie;
    if (g) { const q = (o.goalies[g] ??= { xga: 0, ga: 0 }); q.xga += x; q.ga += +s.goal; }
  }
  for (const k of ["h", "a"]) for (const f of ["xg", "xg5"]) o[k][f] = +o[k][f].toFixed(3);
  for (const q of Object.values(o.goalies)) q.xga = +q.xga.toFixed(3);
  return o;
}

/** Each skater's individual production in one game (empty-net shots and goals left out): { id: { x: ixG, g, a1, a2 } }. */
export function playerGame(w, pbp) {
  const o = {};
  const P = (id) => (o[id] ??= { x: 0, g: 0, a1: 0, a2: 0 });
  for (const s of shotsOf(pbp)) {
    if (s.en || !s.by) continue;
    P(s.by).x += xgOf(w, s);
    if (s.goal) { P(s.by).g++; if (s.a1) P(s.a1).a1++; if (s.a2) P(s.a2).a2++; }
  }
  return o;
}
