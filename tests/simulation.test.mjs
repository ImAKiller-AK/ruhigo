// History engine: the recorded ownership log must reproduce the simulation in every year, wars and pacts must be
// well formed, and the build must stay cut into short slices so the page never freezes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWorld } from "./helpers/engine.mjs";

const SEEDS = ["ember-4", "kova-31", "tidal-7", "brask-52"];

for (const seed of SEEDS) {
  test(`history of world "${seed}"`, () => {
    const { E, S, ms } = buildWorld(seed);
    const { GN, END_YEAR } = E;

    // replaying the log forwards, backwards and at random gives the same land per faction as the engine recorded
    const check = (y) => {
      const own = E.stateAt(y), count = new Int32Array(S.nF);
      for (let k = 0; k < GN; k++) if (own[k] >= 0) count[own[k]]++;
      assert.deepEqual(Array.from(count), Array.from(E.simEconomy(y).cells), `ownership replay differs in year ${y}`);
    };
    for (let y = 0; y <= END_YEAR; y++) check(y);
    for (let y = END_YEAR; y >= 0; y -= 7) check(y);
    for (let i = 0; i < 200; i++) check((i * 137) % (END_YEAR + 1));

    // no faction is wiped out or takes over the map (the balance the project wants to keep)
    const end = E.simEconomy(END_YEAR);
    for (let F = 0; F < S.nF; F++) {
      assert.ok(end.cells[F] > 0, `${S.factions[F].name} vanished`);
      assert.ok(end.cells[F] / S.landCells < 0.4, `${S.factions[F].name} holds ${Math.round(end.cells[F] / S.landCells * 100)}% of the land`);
    }

    for (const W of S.wars) {
      assert.ok(W.a < W.b && W.start >= 0 && W.start <= END_YEAR, `bad war ${W.name}`);
      assert.ok(W.end < 0 || W.end > W.start, `war ${W.name} ends before it starts`);
      assert.ok(E.warAt(W.a, W.b, W.start), `${W.name} is not reported in its first year`);
      assert.ok(W.att === W.a || W.att === W.b, `${W.name} has no attacker`);
      assert.ok(E.warLore(W.id).length > 40);
    }
    for (const P of S.pacts) {
      assert.ok(P.members.length >= 2 && !P.members.includes(P.target), `bad pact ${P.name}`);
      assert.ok(E.alliedAt(P.members[0], P.members[1], P.start), `${P.name} members not allied in year ${P.start}`);
      assert.ok(P.mode === (P.why === "wars" ? "offensive" : "defensive"), `${P.name} has the wrong kind`);
      // a defensive pact only goes to war when its target attacked one of the members first
      if (P.mode === "defensive") for (const wi of P.wars) {
        const W = S.wars[wi];
        assert.ok(W.att === P.target || W.joint, `defensive ${P.name} started ${W.name}`);
      }
      assert.ok(E.pactLore(P.id).length > 40);
    }

    assert.ok(ms.longestSlice < 150, `a background slice took ${ms.longestSlice.toFixed(0)} ms`);
    console.log(`  ${seed}: ${S.wars.length} wars, ${S.pacts.length} pacts, ${S.chCell.length} ownership changes; ` +
      `routes ${ms.routes.toFixed(0)} ms, history ${ms.history.toFixed(0)} ms in ${ms.slices} slices (longest ${ms.longestSlice.toFixed(1)} ms)`);
  });
}

// The balance of power on more worlds, including ones where a faction used to vanish or pass 40% of the land.
test("balance of power holds on a wider set of worlds", () => {
  const seeds = ["sel-173", "vash-303", "w333-9", "orin-290", "umber-56", "w666-18", "w851-23", "w740-20",
    "kova-17", "w185-5", "w703-19", "w407-11"];
  for (const seed of seeds) {
    const { E, S } = buildWorld(seed), end = E.simEconomy(E.END_YEAR);
    for (let F = 0; F < S.nF; F++) {
      assert.ok(end.cells[F] > 0, `${seed}: ${S.factions[F].name} vanished`);
      assert.ok(end.cells[F] / S.landCells < 0.4, `${seed}: ${S.factions[F].name} holds ${Math.round(end.cells[F] / S.landCells * 100)}% of the land`);
    }
  }
});

test("lore is fixed for a given seed", () => {
  const a = buildWorld("ember-4"), b = buildWorld("ember-4");
  assert.equal(a.E.cityLore(0), b.E.cityLore(0));
  assert.equal(a.E.factionLore(0), b.E.factionLore(0));
  assert.deepEqual(a.S.wars.map((w) => w.name), b.S.wars.map((w) => w.name));
});
