// Battle maps (P.kind "arena"): a square map a few kilometres across with named places, buildings, roads and
// bridges. Checks every layout and climate, the smaller sizes, and that the output is fixed for a seed.
// Battle maps are for design only: they have no Minecraft export.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildArena } from "./helpers/engine.mjs";

const LAND = { island: [0.5, 0.8], coast: [0.5, 0.85], inland: [0.8, 1] }; // share of the square that is land

const CASES = [
  ["ember-4", "island", "temperate"], ["kova-31", "island", "snow"], ["tidal-7", "coast", "desert"],
  ["brask-52", "inland", "jungle"], ["s20", "coast", "snow"], ["s37", "inland", "temperate"],
];

for (const [seed, layout, theme] of CASES) {
  test(`battle map "${seed}" · ${theme} ${layout}`, () => {
    const { E, W, ms } = buildArena(seed, { layout, theme });
    const { GW, GH, WX } = E.grid, hm = W.f.hm, at = (x, y) => hm[Math.floor(y * GH) * GW + Math.floor(x / WX * GW)];
    assert.equal(W.kind, "arena");
    assert.ok(W.land >= LAND[layout][0] && W.land <= LAND[layout][1], `land is ${Math.round(W.land * 100)}% of the map`);

    // places: about 2.6 per kilometre of map width, each standing on dry ground, one city first, names unique
    assert.ok(W.cities.length >= 18 && W.cities.length <= 21, `${W.cities.length} places`);
    assert.equal(W.cities[0].cls, "city");
    assert.equal(new Set(W.cities.map((c) => c.name)).size, W.cities.length, "two places share a name");
    for (const c of W.cities) assert.ok(at(c.x, c.y) >= 4, `${c.name} stands in the water`);
    const kinds = W.cities.filter((c) => c.cls === "site").map((c) => c.kind);
    assert.equal(new Set(kinds).size, kinds.length, "a compound kind repeats");

    // buildings: hundreds, all on land, and every city and town has some
    const b = W.bld, n = b.length / 5;
    assert.ok(n > 300, `only ${n} buildings`);
    for (let q = 0; q < b.length; q += 5) assert.ok(at(b[q], b[q + 1]) >= 2, "a building stands in the water");
    for (const c of W.cities) if (c.cls === "city" || c.cls === "town") assert.ok(c.pop >= 8, `${c.name} has ${c.pop} buildings`);

    // roads reach every place
    const reached = new Set();
    for (const r of W.routes) { reached.add(r.a); reached.add(r.b); }
    assert.equal(reached.size, W.cities.length, "a place has no road");
    assert.ok(W.net && W.net.km > 15, "road network too short");
    assert.ok(W.net.bridges >= 0 && W.net.bridges < 30, `${W.net.bridges} bridges`);
    assert.ok(ms.terrain + ms.roads < 8000, "too slow");
  });
}

test("battle map sizes: 4 and 6 km maps have fewer places", () => {
  for (const km of [4, 6]) {
    const { W } = buildArena("ember-4", { km });
    const want = Math.round(km * 2.6);
    assert.ok(W.cities.length >= want - 3 && W.cities.length <= want, `${km} km: ${W.cities.length} places`);
    assert.ok(W.bld.length / 5 > 60);
  }
});

test("battle map is fixed for a given seed", () => {
  const a = buildArena("tidal-7", { layout: "coast", theme: "desert" }).W, b = buildArena("tidal-7", { layout: "coast", theme: "desert" }).W;
  assert.deepEqual(a.cities.map((c) => c.name + c.kind), b.cities.map((c) => c.name + c.kind));
  assert.deepEqual(Array.from(a.bld.slice(0, 50)), Array.from(b.bld.slice(0, 50)));
  assert.equal(a.net.km, b.net.km);
});
