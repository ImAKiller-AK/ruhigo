// Minecraft export: builds a small Bedrock world and, when Python 3 is installed, reads it back with the
// independent checker in tools/verify_mcworld.py (zip, level.dat, LevelDB log, sub-chunks, biomes, heightmaps).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadEngine } from "./helpers/engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "tests/out");

for (const [name, spec] of [
  ["whole world, miniature", { W: 512, H: 256, x0: 0, y0: 0, span: 2 }],
  ["zoomed area with a capital", { W: 256, H: 256, x0: 1.0873, y0: 0.67301, span: 0.0004 }],
]) {
  test(`Minecraft export: ${name}`, async (t) => {
    const E = loadEngine();
    Object.assign(E.P, { sea: 0.04, scale: 1.9, rough: 0.5, temp: 0 });
    E.setSeed("ember-4");
    E.analyseWorld();
    const res = await E.MCX.build({ ...spec, name: "Test · Worldsmith", progress: () => {}, cancelled: () => false });
    assert.equal(res.chunks, (spec.W / 16) * (spec.H / 16));
    assert.ok(res.blob.size > 1000);

    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, name.replace(/[^a-z]+/gi, "-") + ".zip");
    fs.writeFileSync(file, Buffer.from(await res.blob.arrayBuffer()));

    const py = spawnSync("python3", ["--version"]);
    if (py.error || py.status !== 0) { t.skip("python3 not installed: structure not checked"); return; }
    const v = spawnSync("python3", ["-I", path.join(root, "tools/verify_mcworld.py"), file, "--quiet"], { encoding: "utf8" });
    assert.equal(v.status, 0, "verify_mcworld.py failed:\n" + v.stdout + v.stderr);
  });
}
