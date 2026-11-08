// Game predictor maths, shared by the build (pre-game odds, backtest) and the browser (live odds).
// Goals for each team are Poisson with a rate from the two teams' ratings; a live game plays out only the time left,
// from the current score, with power plays and pulled goalies changing the rates.

export const REG = 3600; // seconds of regulation

/** Poisson pmf table 0..n */
function pmf(l, n = 14) {
  const out = [Math.exp(-l)];
  for (let k = 1; k <= n; k++) out.push((out[k - 1] * l) / k);
  return out;
}

/**
 * Regulation score distribution from goal rates for the time left (home rate lh, away rate la), starting at diff d (home − away).
 * Returns { win, tie, loss, dist } where dist[k] is P(final home−away = k) in regulation, and a joint score grid.
 * tieBoost: regulation ties happen a bit more often than independent Poisson says (score effects); fitted.
 */
export function regulation(lh, la, d = 0, tieBoost = 0) {
  const ph = pmf(lh), pa = pmf(la);
  let win = 0, tie = 0, loss = 0;
  const grid = [];
  for (let i = 0; i < ph.length; i++) for (let j = 0; j < pa.length; j++) {
    const p = ph[i] * pa[j], f = d + i - j;
    if (f > 0) win += p; else if (f < 0) loss += p; else tie += p;
    if (p > 1e-4) grid.push([i, j, p]);
  }
  const s = win + tie + loss;
  win /= s; tie /= s; loss /= s;
  if (tieBoost) { const t2 = Math.min(0.6, tie * (1 + tieBoost)), k = (1 - t2) / (1 - tie || 1); win *= k; loss *= k; tie = t2; }
  return { win, tie, loss, grid };
}

/** P(home wins | tied after regulation). Regular season: 5 min of 3v3, then a shootout (close to a coin flip). */
export function overtime(lh, la, { playoff = false, otLeft = 300, P = DEFAULTS } = {}) {
  const share = 0.5 + P.otSkill * (lh / (lh + la) - 0.5);
  if (playoff) return share; // sudden death until someone scores
  const rate = P.otRate * (otLeft / 300); // chance someone scores in the OT time left
  const pGoal = 1 - Math.exp(-rate);
  return pGoal * share + (1 - pGoal) * (0.5 + P.soSkill * (lh / (lh + la) - 0.5));
}

export const DEFAULTS = {
  home: 1.04, // home teams score ~4% more, road teams ~4% less
  tieBoost: 0.4, // matches the real share of games that go to overtime (~23%)
  otSkill: 0.6, soSkill: 0.15,
  otRate: -Math.log(1 - 0.62), // ~62% of regular-season OTs end before the shootout
  spread: 1,
  b2b: 0.08, // second night of a back-to-back: ~8% fewer goals for, more against
  ppRate: 6.8 / 3600, // goals per second for a team on a 5v4 (about 6.8 per 60)
  pkRate: 0.8 / 3600, // shorthanded goals per second
};

/** Pre-game: expected goals for each side. r = { lg, home: {att, def, g, b2b}, away: {...} }; g = starting goalie factor (1 = average). */
export function rates(r, P = DEFAULTS) {
  const h = r.home, a = r.away;
  let lh = r.lg * h.att * a.def * (a.g ?? 1) * P.home;
  let la = (r.lg * a.att * h.def * (h.g ?? 1)) / P.home;
  if (h.b2b) { lh *= 1 - P.b2b; la *= 1 + P.b2b; }
  if (a.b2b) { la *= 1 - P.b2b; lh *= 1 + P.b2b; }
  // Spread: how far apart to set the two teams (fitted; >1 means the ratings undersell real gaps).
  const m = Math.sqrt(lh * la), s = P.spread ?? 1;
  return { lh: m * (lh / m) ** s, la: m * (la / m) ** s };
}

/** Full pre-game prediction from rates. */
export function predictGame(lh, la, { playoff = false, P = DEFAULTS } = {}) {
  const R = regulation(lh, la, 0, P.tieBoost);
  const ot = overtime(lh, la, { playoff, P });
  const home = R.win + R.tie * ot;
  // Most likely scores and totals
  const grid = R.grid.sort((x, y) => y[2] - x[2]);
  const top = grid.slice(0, 3).map(([h, a, p]) => ({ h, a, p }));
  const totalOver = (n) => grid.reduce((s, [h, a, p]) => s + (h + a > n ? p : 0), 0);
  const cover = grid.reduce((s, [h, a, p]) => s + (h - a >= 2 ? p : 0), 0), coverAway = grid.reduce((s, [h, a, p]) => s + (a - h >= 2 ? p : 0), 0);
  return { home, away: 1 - home, regWin: R.win, regLoss: R.loss, ot: R.tie, lh, la, top, over55: totalOver(5.5), over65: totalOver(6.5), homeBy2: cover, awayBy2: coverAway };
}

/**
 * Live: win probability from the game state.
 * s = { hg, ag, period, left (seconds left in the period), playoff, ppHome, ppAway (seconds of power play left), enHome, enAway (goalie pulled) }
 * Rates lh, la are per regulation game (60 min); they're scaled to the time left. A pulled goalie in a close late game
 * roughly triples the leading team's scoring and doubles the trailing team's.
 */
export function liveProb(lh, la, s, P = DEFAULTS) {
  const d = s.hg - s.ag;
  if (s.final) return d > 0 ? 1 : d < 0 ? 0 : 0.5;
  const per = s.period ?? 1;
  if (per >= 4) {
    // Overtime (tied by definition, unless it just ended)
    if (d) return d > 0 ? 1 : 0;
    if (s.shootout) return 0.5 + P.soSkill * (lh / (lh + la) - 0.5);
    return overtime(lh, la, { playoff: s.playoff, otLeft: s.left ?? 300, P });
  }
  const left = Math.max(0, (3 - per) * 1200 + (s.left ?? 1200));
  let eh = (lh / REG) * left, ea = (la / REG) * left;
  // Power play time left: the team's normal rate for those seconds is replaced by the PP (or shorthanded) rate.
  // (Their normal rate already includes some PP time, so only part of it is removed.)
  if (s.ppHome) { eh += s.ppHome * (P.ppRate - (lh / REG) * 0.5); ea += s.ppHome * (P.pkRate - (la / REG) * 0.6); }
  if (s.ppAway) { ea += s.ppAway * (P.ppRate - (la / REG) * 0.5); eh += s.ppAway * (P.pkRate - (lh / REG) * 0.6); }
  // Late-game goalie pull: the trailing team (down 1–2) pulls with ~2:30 left in regulation.
  if (per === 3 && (d === 1 || d === 2 || d === -1 || d === -2)) {
    const pull = Math.min(left, s.enHome || s.enAway ? left : 150 + (Math.abs(d) - 1) * 60);
    const trail = d > 0 ? "a" : "h", base = pull / REG;
    const add = (l, k) => l * base * (k - 1);
    if (trail === "a") { eh += add(lh, 3.2); ea += add(la, 2.2); } else { ea += add(la, 3.2); eh += add(lh, 2.2); }
  }
  eh = Math.max(eh, 1e-6); ea = Math.max(ea, 1e-6);
  const R = regulation(eh, ea, d, left > 600 ? P.tieBoost * (left / REG) : 0);
  return R.win + R.tie * overtime(lh, la, { playoff: s.playoff, P });
}

/** NHL play-by-play situationCode: [away goalie, away skaters, home skaters, home goalie], e.g. "1451" = home PP. */
export function situation(code) {
  const c = String(code ?? "1551");
  return { awayG: c[0] === "1", away: +c[1], home: +c[2], homeG: c[3] === "1" };
}
