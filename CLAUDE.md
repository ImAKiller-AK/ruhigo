# Worldsmith

Procedural world generator that runs as one self-contained web page, published as a claude.ai artifact.
It has two workspaces: **Generation** (terrain, climate, rivers, settlements, Minecraft Bedrock export) and
**Simulation** (trade routes, factions, 300 years of borders, wars and pacts on a timeline).

The owner writes in Spanish: answer in Spanish. The page's interface text is in English; keep it that way
unless asked.

## Commands

```bash
npm run build   # src/ -> dist/worldsmith.html (to publish) and dist/preview.html (to open locally)
npm test        # engine tests in Node: history replay, balance on 16 worlds, routes, Minecraft export (~35 s)
npm run check   # fails if dist/worldsmith.html is out of date with src/
```

No dependencies to install. Node 20+ is required; Python 3 is optional and lets the Minecraft test read the
exported world back with `tools/verify_mcworld.py`.

Always edit `src/`, then `npm run build` and `npm test`. Never edit `dist/` by hand.

## How the code is put together

`scripts/build.mjs` inlines `src/styles.css` and every `src/js/*.js` (in file-name order) into
`src/page.html`. The JS files are **not modules**: they are concatenated into a single
`(()=>{ "use strict"; … })();` block and share one scope. So:

- no `import`/`export`; a file can use anything declared in an earlier file, and functions declared in any
  file (function declarations are hoisted);
- the number prefix is the load order; keep top-level code that touches the DOM in `08-` and later;
- `tests/helpers/engine.mjs` loads `01`–`07` and `09` into Node, so those files must not touch the DOM at
  the top level.

| File | Contents |
|---|---|
| `01-noise.js` | seeded random (`mulberry32`), simplex noise, `fbm` |
| `02-world.js` | parameters `P`, `elev`, `meters`, `climate`, the 18 biomes `B` |
| `03-language.js` | name generator per world |
| `04-drainage.js` | `setSeed`, `analyseWorld`: 560×280 analysis grid, priority-flood drainage, rivers, settlements; fills `W0` |
| `05-routes.js` | `CostField` (terrain friction), `MinHeap`, A* `Pathfinder`, cooperative scheduler `sched`, `routeTask` |
| `06-simulation.js` | resources, faction spread, the history engine (wars, pacts), lookups such as `stateAt`, procedural lore |
| `07-minecraft-export.js` | `MCX.build`: writes a Bedrock world (level.dat + LevelDB log) as a zip |
| `08-rendering.js` | map canvas: progressive rendering, overlays |
| `09-format.js` | number and coordinate formatting |
| `10-panel.js` | terrain readout, world stats, legend, sliders, `regenerate`, `newSeed` |
| `11-interaction.js` | pan, zoom, pinch, keyboard, layer buttons |
| `12-minecraft-panel.js` | the export section of the Generation tab |
| `13-sim-ui.js` | tabs, selection and inspector, timeline playback, simulation layers drawing |
| `14-boot.js` | start-up |

## Data worth knowing

- `W0` (per world): `cities`, river `buckets`, analysis fields `f` (`hm` elevation, `bio`, `isR`, `acc`,
  `recv`…), `routes` (cell paths), `costField`, `net` (drawable road polylines).
- `SIM` (per simulation run), built in the background by `simTask` → `history`:
  - ownership log: `chCell`/`chTo` (every change of owner, in order), `yearStart` (where each year starts in
    the log) and `keys` (a full ownership snapshot every `KEY` years). `stateAt(y)` = nearest snapshot +
    replay. Scrubbing and playback never simulate anything; they only read these tables.
  - per-year tables: `ecoY` (land, production, population per faction), `tens` (tension per pair),
    `fLen`/`fBar`/`fReach` (shared frontier), `cityFY` (town owner).
  - events: `wars` (`a`, `b`, `att` attacker, `start`, `end`, `gain`, `towns`, `pact`, `joint`) and `pacts`
    (`target`, `members`, `mode` offensive/defensive, `start`, `end`, `why`, `wars`).
- Long jobs are generators pumped by `sched` in ~10 ms slices so the page never freezes; anything new and
  heavy must follow the same pattern (`yield` often, check `gen !== simGen` to stop when the world changes).

## Decisions the owner has made

- Keep the balance of power: wars move frontiers but do not wipe factions out or let one empire dominate.
  Capitals cannot fall. The tests fail if a faction vanishes or ends above 40% of the land (checked on 16 worlds).
  Mechanisms: a faction holding a third of the land stops absorbing free land (`CLAIM_CAP`; held-back cells are
  offered again each year), its armies thin out past a quarter (`STRETCH_AT`), and war cannot push a faction
  below half of the most land it ever held (`KEEP`).
- Conflict escalation: tension ≥ 0.75 (`WAR_AT`) on a shared frontier starts a war; the stronger side is the
  attacker. A frontier that stays strained (tension ≥ `GRUDGE_AT`) piles up grievances that add to tension
  until a war or calmer years clear them, so long-strained borders eventually fight; truly calm worlds can
  still stay at peace (about 1 in 5).
- Pacts are mixed by motive (chosen by the owner): against a faction that keeps winning wars the pact is
  **offensive** (members back every war against the target, open joint fronts, +0.15 tension); against one that
  is merely much stronger it is **defensive** (members only help, and only join in, when the target attacked
  first). Defensive pacts mostly deter: few end up fighting.
- Interface principle is zero clutter: dark survey-instrument style, technical type, subtle borders, no
  pop-ups; detail appears with zoom or selection.

## Open points

- Tension, grudge and war weights are tuned on 48 seeds: about 6 wars per world on average, about 1 world in 5
  without war, no faction above 36%. The default seed (`ember-4`) has 11 wars and 5 pacts.
- The Minecraft export has been checked with `tools/verify_mcworld.py` but never opened inside Minecraft.
- The page has been tested in desktop and phone-sized Chrome, not on a real phone.

## Publishing

The live page is the claude.ai artifact https://claude.ai/artifact/WhWcodcMqiFq8mCLaqzMSn (title
"Worldsmith"). To update it, read it first with the Artifact tool, then publish `dist/worldsmith.html` with
that `url`. It declares the `downloads` capability (used by the Minecraft export); omitting `capabilities`
on a republish keeps it.

Artifact rules that matter here: the file has no `<!doctype>`, `<html>`, `<head>` or `<body>` (the host
adds them); scripts may only come from the allowed CDNs and fonts only from Google Fonts; downloads must go
through the `downloads` capability (`window.claude.use("downloads")`). `dist/preview.html` adds the document
skeleton and a local stand-in for that capability so the page also works when opened from disk.
