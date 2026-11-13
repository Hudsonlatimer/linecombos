import { test } from "node:test";
import assert from "node:assert/strict";
import { txKind, txPieces, tradeShape, tradeKey, gamesIn, parseDiscipline } from "../src/lib/moves.mjs";

test("trade sentences split into the two sides", () => {
  const wright = tradeShape("Traded C Shane Wright to Nashville Predators for RW Matthew Wood.");
  assert.deepEqual(wright, { sends: "C Shane Wright", other: "Nashville Predators", gets: "RW Matthew Wood" });
  const helle = tradeShape("Acquired G Connor Hellebuyck from Winnipeg in exchange for Fs Dawson Mercer, Alexander Command and Nick Bjugstad.");
  assert.equal(helle.gets, "G Connor Hellebuyck");
  assert.equal(helle.other, "Winnipeg");
  assert.match(helle.sends, /^Fs Dawson Mercer/);
  assert.equal(tradeKey(wright), tradeKey(tradeShape("Traded RW Matthew Wood to Seattle for C Shane Wright.")));
  assert.equal(tradeKey(helle), tradeKey(tradeShape("Acquired Fs Dawson Mercer from New Jersey in exchange for G Connor Hellebuyck.")));
  assert.equal(tradeShape("Recalled F Sam O'Reilly from Syracuse (AHL)."), null);
});

test("a transaction blurb becomes one classified move per sentence", () => {
  const pieces = txPieces({
    date: "2026-10-07", team: "BUF",
    text: "Signed D Louis Crevier to a four-year contract. Recalled D Dennis Gilbert from Rochester (AHL). Placed G Alex Lyon on injured reserve.",
  });
  assert.deepEqual(pieces.map((p) => p.kind), ["sign", "recall", "injury"]);
  assert.equal(txKind("Suspended F Hayden Hodgson for two games."), "suspension");
  assert.equal(txKind("Fined D Jacob Trouba $5,000."), "fine");
  assert.equal(gamesIn("Charlie McAvoy suspended six regular-season games for actions in Boston Bruins game"), 6);
  assert.equal(gamesIn("suspended two games"), 2);
});

test("player safety cards become suspensions and skip hearings", () => {
  const html = `
    <a class="nhl-c-card-wrap -story" href="/news/hodgson-suspended">
      <h3 class="fa-text__title">Hayden Hodgson suspended two games for actions in Senators game</h3>
      <time datetime="2026-10-31T00:35:07"></time>
    </a>
    <a class="nhl-c-card-wrap -story" href="/news/hodgson-again">
      <h3 class="fa-text__title">Ottawa Senators Hayden Hodgson suspended two games</h3>
      <time datetime="2026-10-31T12:00:00"></time>
    </a>
    <a class="nhl-c-card-wrap -story" href="/news/nazar">
      <h3 class="fa-text__title">Chicago Blackhawks Frank Nazar suspended two games for illegal check</h3>
      <time datetime="2026-10-20T00:00:00"></time>
    </a>
    <a class="nhl-c-card-wrap -story" href="/news/mason-marchment-fined-maximum-for-roughing">
      <h3 class="fa-text__title">Marchment fined maximum for roughing in Sharks game</h3>
      <time datetime="2026-11-10T00:00:00"></time>
    </a>
    <a class="nhl-c-card-wrap -story" href="/news/hearing">
      <h3 class="fa-text__title">Hodgson to have a player safety hearing</h3>
      <time datetime="2026-10-30T00:00:00"></time>
    </a>`;
  const teams = [
    { abbrev: "OTT", name: "Ottawa Senators", place: "Ottawa", common: "Senators" },
    { abbrev: "CHI", name: "Chicago Blackhawks", place: "Chicago", common: "Blackhawks" },
    { abbrev: "SJS", name: "San Jose Sharks", place: "San Jose", common: "Sharks" },
  ];
  const rows = parseDiscipline(html, teams);
  assert.equal(rows.length, 3);
  const fine = rows.find((r) => r.kind === "fine");
  assert.equal(fine.name, "Mason Marchment");
  assert.match(fine.title, /Mason Marchment fined/);
  assert.equal(fine.team, "SJS");
  const hodgson = rows.find((r) => r.name === "Hayden Hodgson");
  assert.equal(hodgson.games, 2);
  assert.equal(hodgson.team, "OTT");
  assert.equal(hodgson.url, "https://www.nhl.com/news/hodgson-suspended");
  assert.equal(rows.find((r) => r.team === "CHI").name, "Frank Nazar");
});
