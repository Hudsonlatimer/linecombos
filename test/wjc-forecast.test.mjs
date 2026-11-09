import test from "node:test";
import assert from "node:assert/strict";
import { gameProb, rates } from "../src/lib/wjcpredict.mjs";
import { nationFromHome } from "../src/render/geo.mjs";

test("win probabilities are symmetric and sum to one", () => {
  const a = gameProb(1.2, -0.4), b = gameProb(-0.4, 1.2);
  assert.ok(Math.abs(a.win + b.win - 1) < 1e-9);
  assert.ok(a.win > 0.5 && b.win < 0.5);
  assert.ok(Math.abs(gameProb(0.3, 0.3).win - 0.5) < 1e-9);
});

test("a bigger rating gap means a bigger favourite and a more lopsided score", () => {
  assert.ok(gameProb(2, -1.5).win > gameProb(1, -0.5).win);
  const [la, lb] = rates(2, -1.5);
  assert.ok(la > 4 && lb < 2);
});

test("hometown strings map to a country", () => {
  assert.equal(nationFromHome("Calgary, AB").name, "Canada");
  assert.equal(nationFromHome("Minneapolis, MN").name, "United States");
  assert.equal(nationFromHome("Zurich, ZH, Switzerland").name, "Switzerland");
  assert.equal(nationFromHome(""), null);
});
