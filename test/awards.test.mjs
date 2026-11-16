import test from "node:test";
import assert from "node:assert/strict";
import { awardRaces, shares, shrink } from "../public/assets/awardsmodel.js";

const sk = (id, name, team, pos, gp, g, a, extra = {}) => ({ playerId: id, skaterFullName: name, teamAbbrevs: team, positionCode: pos, gamesPlayed: gp, goals: g, assists: a, points: g + a, shots: g * 8, shootingPct: 0.125, penaltyMinutes: 4, timeOnIcePerGame: 1100, isRookie: false, faceoffWinPct: null, adv: { satRelative: 0.01, takeaways: 10 }, ...extra });
const gk = (id, name, team, gp, w, sv, sa) => ({ playerId: id, goalieFullName: name, teamAbbrevs: team, gamesPlayed: gp, wins: w, saves: Math.round(sv * sa), shotsAgainst: sa, savePct: sv, goalsAgainstAverage: 2.4, shutouts: 1, isRookie: false });
const teams = { AAA: { gp: 20, pts: 30, ptsPct: 0.75, rw: 12, ga: 50 }, BBB: { gp: 20, pts: 18, ptsPct: 0.45, rw: 6, ga: 70 } };
const skaters = [
  sk(1, "Star One", "AAA", "C", 20, 12, 18), sk(2, "Star Two", "BBB", "R", 20, 14, 10), sk(3, "Hot Streak", "BBB", "L", 4, 5, 3),
  sk(4, "Blue Liner", "AAA", "D", 20, 4, 14, { timeOnIcePerGame: 1500 }), sk(5, "Kid", "BBB", "C", 20, 8, 9, { isRookie: true }), sk(6, "Filler", "AAA", "L", 20, 3, 3),
];
const goalies = [gk(10, "Wall", "AAA", 16, 12, 0.927, 400), gk(11, "Brick", "BBB", 16, 6, 0.9, 420), gk(12, "Backup", "AAA", 2, 2, 0.96, 50)];

test("shares add to 1 and favour the higher score", () => {
  const s = shares([2, 1, 0]);
  assert.ok(Math.abs(s.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(s[0] > s[1] && s[1] > s[2]);
});
test("shrink pulls small samples to the league rate", () => {
  assert.ok(Math.abs(shrink(8, 4, 0.5, 6) - 1.1) < 1e-9); // raw 2.0 per game becomes 1.1
  assert.ok(Math.abs(shrink(40, 20, 0.5, 0) - 2) < 1e-9);
});
test("a 4-game heater cannot lead Hart or Byng, and rookies are separated", () => {
  const R = awardRaces({ skaters, goalies, teams });
  assert.notEqual(R.voted.hart[0].name, "Hot Streak");
  assert.ok(!R.voted.hart.some((c) => c.name === "Hot Streak"));
  assert.deepEqual(R.voted.calder.map((c) => c.name), ["Kid"]);
  assert.deepEqual(R.voted.norris.map((c) => c.name), ["Blue Liner"]);
  assert.ok(!R.voted.vezina.some((c) => c.name === "Backup"));
  assert.ok(Math.abs(R.voted.hart.reduce((a, c) => a + c.share, 0) - 1) < 1e-9);
});
test("stat races use the NHL tiebreakers and pace", () => {
  const R = awardRaces({ skaters: [...skaters, sk(7, "Tie Fewer", "AAA", "C", 10, 12, 18)], goalies, teams });
  assert.equal(R.races.artRoss[0].name, "Tie Fewer"); // 30 points in fewer games wins the tie
  assert.equal(R.races.artRoss[0].pace, Math.round((30 / 10) * 82));
  assert.equal(R.races.presidents[0].team, "AAA");
  assert.equal(R.races.jennings[0].team, "AAA");
});
test("traded players count for their current team", () => {
  const R = awardRaces({ skaters: [sk(8, "Traded", "AAA,BBB", "C", 20, 20, 20), ...skaters], goalies, teams });
  assert.equal(R.races.artRoss[0].team, "BBB");
});
