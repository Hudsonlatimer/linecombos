import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIndex, parsePost } from "../src/core/parse.mjs";

const P = (id, first, last, team, pos) => ({ id, first, last, team, pos });
const players = [
  P(1, "Nick", "Suzuki", "MTL", "C"), P(2, "Cole", "Caufield", "MTL", "R"), P(3, "Juraj", "Slafkovský", "MTL", "L"),
  P(4, "Kirby", "Dach", "MTL", "C"), P(5, "Alex", "Newhook", "MTL", "C"), P(6, "Oliver", "Kapanen", "MTL", "R"),
  P(7, "Lane", "Hutson", "MTL", "D"), P(8, "Noah", "Dobson", "MTL", "D"), P(9, "Kaiden", "Guhle", "MTL", "D"),
  P(10, "Alexandre", "Carrier", "MTL", "D"), P(11, "Jakub", "Dobeš", "MTL", "G"), P(12, "Jacob", "Fowler", "MTL", "G"),
  P(20, "John", "Tavares", "TOR", "C"), P(21, "Kailer", "Yamamoto", "UTA", "R"), P(22, "Gregor", "Biber", "UTA", "D"),
  P(30, "Arttu", "Hyry", "FIN", "L"),
];
const idx = buildIndex(players, { MTL: ["#GoHabsGo", "Canadiens"], TOR: ["#Leafs"], UTA: ["#TusksUp", "Utah"] });

test("line rushes with dashes and an accent-free surname", () => {
  const r = parsePost("Canadiens line rushes at morning skate:\nSuzuki - Caufield - Slafkovsky\nNewhook - Dach - Kapanen\n\nHutson - Dobson\nGuhle - Carrier", idx);
  assert.equal(r.type, "lines");
  assert.equal(r.team, "MTL");
  assert.deepEqual(r.lines, [[1, 2, 3], [5, 4, 6]]);
  assert.deepEqual(r.pairs, [[7, 8], [9, 10]]);
});

test("en dashes and initials", () => {
  const r = parsePost("#GoHabsGo warmups\nN. Suzuki–C. Caufield–J. Slafkovsky\nK. Dach–A. Newhook–O. Kapanen", idx);
  assert.equal(r.type, "lines");
  assert.equal(r.lines.length, 2);
});

test("goalie start", () => {
  const r = parsePost("Jakub Dobes will start in goal tonight for the Canadiens.", idx);
  assert.equal(r.type, "goalie");
  assert.equal(r.goalie, 11);
});

test("roster move", () => {
  const r = parsePost("Utah has recalled Gregor Biber from Tucson. #TusksUp", idx);
  assert.equal(r.type, "roster");
  assert.equal(r.team, "UTA");
  assert.deepEqual(r.players, [22]);
});

test("injury", () => {
  const r = parsePost("Utah has placed Kailer Yamamoto on IR. #TusksUp", idx);
  assert.ok(["roster", "injury"].includes(r.type));
  assert.equal(r.team, "UTA");
});

test("return to lineup", () => {
  const r = parsePost("John Tavares is expected to return to the #Leafs lineup tomorrow.", idx);
  assert.equal(r.type, "injury");
  assert.equal(r.team, "TOR");
});

test("unrelated post", () => {
  const r = parsePost("Mike Babcock suiting up in the British Hockey League, circa 1987.", idx);
  assert.equal(r.type, "other");
});
