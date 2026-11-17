// One compact JSON file (data/app.json) with everything a phone app needs beyond predictions and awards:
// teams with lines and goalies, injuries, moves, news, standings, Cup odds, leaders, the mock draft and the World Juniors odds.
const nm = (ctx, id, fallback) => {
  const p = ctx.people?.[id];
  return p ? `${p.first} ${p.last}` : fallback ?? String(id);
};

export function appData(ctx) {
  const { T, cup } = ctx;
  const since = `${String(ctx.league.seasonId).slice(0, 4)}-07-01`;
  const teams = Object.values(T).map((t) => {
    const last = t.last;
    const name = (id) => last?.players?.[id]?.name ?? nm(ctx, id);
    const lines = (last?.lines ?? []).slice(0, 4).map((l) => l.ids.map((id) => ({ id, n: name(id) })));
    const pairs = (last?.pairs ?? []).slice(0, 3).map((l) => l.ids.map((id) => ({ id, n: name(id) })));
    const g = t.goalies?.projected;
    const o = cup.odds[t.abbrev] ?? {};
    return {
      abbrev: t.abbrev, name: t.name, common: t.common, conf: t.conf, div: t.div, color: t.color, color2: t.color2,
      gp: t.gp, w: t.w, l: t.l, otl: t.otl, pts: t.pts, gf: t.gf, ga: t.ga, l10: t.l10, streak: t.streak, rank: t.leagueSeq,
      next: t.next ? { opp: t.next.opp, home: t.next.home, start: t.next.startUTC, b2b: t.next.b2b } : null,
      last: last ? { opp: last.opp, home: last.home, score: last.score, result: last.result, date: last.date } : null,
      lines, pairs, goalie: g ? { id: g, n: t.goalies.starts?.find((s) => s.id === g)?.name ?? nm(ctx, g), reason: t.goalies.reason } : null,
      odds: { playoffs: o.playoffs, cup: o.cup, div: o.div, pts: o.pts, final: o.final },
    };
  });
  const round = (x, d = 3) => (x == null ? null : +x.toFixed(d));
  const wj = ctx.wjc?.forecast?.odds ?? {};
  const consensus = (ctx.draftClass?.players ?? []).filter((p) => p.consensus).sort((a, b) => a.consensus - b.consensus).slice(0, 32)
    .map((p) => ({ rank: p.consensus, name: p.name, pos: p.pos ?? "", club: p.now ? `${p.team} ${p.league ?? ""}`.trim() : p.nowTeam ?? (p.last ? `${p.last.team} ${p.last.league}` : "") }));
  return {
    builtAt: ctx.site.builtAt, today: ctx.league.today,
    teams,
    injuries: ctx.injuries.slice(0, 60).map((i) => ({ id: i.id, team: i.team, name: i.name, pos: i.pos, status: i.status, body: i.body, ret: i.returnDate, note: (i.short ?? "").slice(0, 220) })),
    moves: ctx.tx.filter((m) => m.date >= since && ["trade", "sign", "waivers", "recall", "assign", "release", "suspension", "fine"].includes(m.kind)).slice(0, 60).map((m) => ({ date: m.date, team: m.team, kind: m.kind, text: m.text })),
    discipline: (ctx.discipline ?? []).slice(0, 12).map((d) => ({ date: d.date, team: d.team, kind: d.kind, title: d.title })),
    news: ctx.posts.filter((p) => p.parsed?.team).slice(0, 40).map((p) => ({ team: p.parsed.team, author: p.author, text: (p.text ?? "").slice(0, 240), at: p.createdAt, url: p.link ?? p.url })),
    leaders: Object.fromEntries(Object.entries(ctx.leaders.skaters ?? {}).map(([k, list]) => [k, list.slice(0, 10).map((p) => ({ id: p.id, n: `${p.firstName.default} ${p.lastName.default}`, team: p.teamAbbrev, v: p.value }))])),
    mockDraft: consensus,
    wjc: Object.values(wj).sort((a, b) => b.gold - a.gold).map((t) => ({ code: t.code, group: t.group, gold: round(t.gold), medal: round(t.medal), final: round(t.final) })),
  };
}
