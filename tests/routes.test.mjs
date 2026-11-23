// Trade routes: every settlement is reachable, and paths only step between neighbouring cells.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWorld } from "./helpers/engine.mjs";

test("trade network connects every settlement", () => {
  const { E } = buildWorld("ember-4");
  const { W0, GW } = E, n = W0.cities.length;
  assert.ok(W0.routes.length >= n - 1, `only ${W0.routes.length} routes for ${n} towns`);

  const parent = [...Array(n).keys()], find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (const r of W0.routes) {
    parent[find(r.a)] = find(r.b);
    assert.equal(r.path[0], W0.cities[r.a].k);
    assert.equal(r.path[r.path.length - 1], W0.cities[r.b].k);
    for (let q = 1; q < r.path.length; q++) {
      const a = r.path[q - 1], b = r.path[q];
      assert.ok(Math.abs((a % GW) - (b % GW)) <= 1 && Math.abs(Math.floor(a / GW) - Math.floor(b / GW)) <= 1, "path jumps a cell");
    }
  }
  assert.equal(new Set(W0.cities.map((_, i) => find(i))).size, 1, "some towns are cut off from the network");
  assert.ok(W0.net && W0.net.km > 0);
});
