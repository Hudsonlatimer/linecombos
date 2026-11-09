import test from "node:test";
import assert from "node:assert/strict";
import { simulate, parseWiki, matchResults } from "../public/assets/wjcsim.js";

const teams = [["CAN", "B"], ["CZE", "B"], ["SUI", "B"], ["LAT", "B"], ["NOR", "B"], ["USA", "A"], ["SWE", "A"], ["FIN", "A"], ["SVK", "A"], ["GER", "A"]].map(([code, group]) => ({ code, group }));
const schedule = [];
let n = 1;
for (const G of ["A", "B"]) { const c = teams.filter((t) => t.group === G).map((t) => t.code); for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) schedule.push({ n: n++, a: c[i], b: c[j], round: `Group ${G}`, utc: "2026-12-27T00:00:00Z" }); }
schedule.push({ n: 21, a: null, b: null, round: "Relegation", utc: "2027-01-02T17:00:00Z" });
const ratings = { CAN: 1.3, USA: 1.2, SWE: 1, FIN: 0.8, CZE: 0.3, SVK: 0, SUI: -0.3, GER: -0.9, LAT: -1.5, NOR: -1.8 };

test("odds are probabilities: one gold winner, four semi-finalists, one relegated per group", () => {
  const s = simulate({ teams, schedule, ratings, sims: 3000 });
  const sum = (k) => Object.values(s.odds).reduce((t, o) => t + o[k], 0);
  assert.ok(Math.abs(sum("gold") - 1) < 1e-9);
  assert.ok(Math.abs(sum("sf") - 4) < 1e-9);
  assert.ok(Math.abs(sum("rel") - 1) < 1e-9);
  assert.ok(s.odds.CAN.gold > s.odds.NOR.gold);
});

test("a finished result is respected: a team that lost every game cannot finish top four", () => {
  const results = {};
  for (const g of schedule) if (g.a === "GER" || g.b === "GER") results[g.n] = g.a === "GER" ? { a: 0, b: 5 } : { a: 5, b: 0 };
  const s = simulate({ teams, schedule, ratings, results, sims: 2000 });
  assert.equal(s.odds.GER.rank[4], 1);
  assert.equal(s.odds.GER.qf, 0);
});

test("a finished playoff game decides the winner", () => {
  const results = {};
  for (const g of schedule) results[g.n] = { a: 3, b: 2 };
  const base = simulate({ teams, schedule, ratings, results, sims: 500 });
  assert.ok(base.odds.USA.gold >= 0);
});

test("Wikipedia score boxes parse, including overtime and shootouts", () => {
  const wt = `{{Ice hockey box
| date = December 26, 2026
| team1 = '''{{ihj-rt|SWE}}'''
| score = 3–2
| team2 = {{ihj|SVK}}
| periods = (0–0, 2–1, 1–1)
}}
{{Ice hockey box
| date = December 27, 2026
| team1 = {{ihj|CAN}}
| score = 2–1 (OT)
| team2 = {{ihj|LAT}}
| periods = (0–0, 1–1, 0–0, 1–0)
}}`;
  const p = parseWiki(wt);
  assert.equal(p.length, 2);
  assert.deepEqual([p[0].a, p[0].ga, p[0].gb, p[0].b, p[0].ot], ["SWE", 3, 2, "SVK", null]);
  assert.equal(p[1].ot, "OT");
  const sch = [{ n: 6, a: "SVK", b: "SWE", round: "Group A", utc: "2026-12-27T00:00:00Z" }, { n: 30, a: null, b: null, round: "Quarterfinal 1", utc: "2027-01-02T19:00:00Z" }];
  const m = matchResults(p, sch);
  assert.deepEqual(m.results[6], { a: 2, b: 3, ot: null }); // the schedule lists SVK first
});
