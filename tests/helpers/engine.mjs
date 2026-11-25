// Loads the browser-free part of Worldsmith (terrain, routes, simulation, Minecraft export, formatting) into Node.
// The page runs as one script, so the modules share a scope; this concatenates the same files and hands back
// the functions the tests need. Rendering, panels and interaction touch the DOM and are left out.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENGINE = ["01-noise.js", "02-world.js", "03-language.js", "04-drainage.js", "05-routes.js",
  "06-simulation.js", "07-minecraft-export.js", "09-format.js"];

export function loadEngine() {
  const code = ENGINE.map((f) => fs.readFileSync(path.join(root, "src/js", f), "utf8")).join("");
  globalThis.document ??= { getElementById: () => ({}) };
  const api = `
return {
  P, setSeed, setKind, analyseWorld, elev, meters, routeTask, simTask, MCX,
  get W0(){return W0;}, get SIM(){return SIM;}, setSim(v){SIM=v;},
  stateAt, simEconomy, tension, frontAt, warAt, warsAt, pactsAt, alliedAt, routeStatus,
  cityLore, factionLore, routeLore, warLore, pactLore, GN, GW, GH, END_YEAR,
  get grid(){return {GW,GH,GN,WX,MPU,CELL_M};},
  newRun(){routeGen++;simGen++;return {routeGen,simGen};}
};`;
  return new Function('"use strict";\n' + code + api)();
}

// A world with the page's default sliders, its trade routes and its 300 years of history, built synchronously.
export function buildWorld(seed = "ember-4") {
  const E = loadEngine();
  Object.assign(E.P, { sea: 0.04, scale: 4.2 - 2.3, rough: 0.5, temp: 0 });
  E.setSeed(seed);
  E.analyseWorld();
  const run = E.newRun();
  const t0 = performance.now();
  for (const t = E.routeTask(run.routeGen, () => {}); !t.next().done;);
  const t1 = performance.now();
  const g = E.simTask(run.simGen, () => {});
  let r, slices = 0, longest = 0, last = performance.now();
  for (;;) { r = g.next(); const n = performance.now(); longest = Math.max(longest, n - last); last = n; slices++; if (r.done) break; }
  E.setSim(r.value);
  return { E, S: r.value, ms: { routes: t1 - t0, history: performance.now() - t1, slices, longestSlice: longest } };
}

// A battle map (see P.kind "arena") with its roads, built synchronously.
export function buildArena(seed = "ember-4", opts = {}) {
  const E = loadEngine();
  Object.assign(E.P, { sea: 0.04, scale: 1.9, rough: 0.5, temp: 0, kind: "arena", km: 8, theme: "temperate", layout: "island" }, opts);
  E.setKind();
  E.setSeed(seed);
  const t0 = performance.now();
  E.analyseWorld();
  const t1 = performance.now();
  const run = E.newRun();
  for (const t = E.routeTask(run.routeGen, () => {}); !t.next().done;);
  return { E, W: E.W0, ms: { terrain: t1 - t0, roads: performance.now() - t1 } };
}
