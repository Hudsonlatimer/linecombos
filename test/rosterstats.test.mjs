import test from "node:test";
import assert from "node:assert/strict";
import { fmt, pick } from "../src/lib/rosterstats.mjs";

test("roster stat formats", () => {
  assert.equal(fmt("p1", 0.597), "59.7%");
  assert.equal(fmt("sp1", 0.196), "+19.6%");
  assert.equal(fmt("sp1", -0.04), "-4.0%");
  assert.equal(fmt("d3", 0.929), ".929");
  assert.equal(fmt("d3", 1.086), "1.086");
  assert.equal(fmt("sec", 823.8), "13:44");
  assert.equal(fmt("s0", -2), "-2");
  assert.equal(fmt("s0", 4), "+4");
  assert.equal(fmt("n0", null), "—");
  assert.equal(pick({ percentages: { satRelative: 0.196 } }, "percentages.satRelative"), 0.196);
  assert.equal(pick({ summary: { goals: 0 } }, "summary.goals"), 0);
  assert.equal(pick({ summary: {} }, "summary.goals"), null);
});
