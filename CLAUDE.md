# Worldsmith

Procedural world generator that runs as one self-contained web page, published as a claude.ai artifact.
It makes two kinds of map (`P.kind`):

- **Planet** (`"world"`): a whole world. Two workspaces: **Generation** (terrain, climate, rivers,
  settlements, Minecraft Bedrock export) and **Simulation** (trade routes, factions, 300 years of borders,
  wars and pacts on a timeline).
- **Battle map** (`"arena"`): a square map 4, 6 or 8 km across in the style of battle-royale maps, with a
  climate theme (temperate, snow, desert, jungle), a layout (island, coastal, inland), named places (cities,
  towns, villages, compounds such as a military base or quarry), buildings, town streets, roads and bridges.
  Generation tab only; the Simulation tab and the Minecraft export are hidden (battle maps are for design).

The owner writes in Spanish: answer in Spanish. The page's interface text is in English; keep it that way
unless asked.

## Commands

```bash
npm run build   # src/ -> dist/worldsmith.html (to publish) and dist/preview.html (to open locally)
npm test        # engine tests in Node: history replay, balance on 16 worlds, routes, battle maps, Minecraft export (~50 s)
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
| `02-world.js` | parameters `P`, map extent `WX`/`MPU`, `elev`, `meters`, `climate` (each dispatches to a planet or a battle-map version), the 18 biomes `B`, battle-map `THEMES` and `LAYOUTS` |
| `03-language.js` | name generator per world |
| `04-drainage.js` | `setKind` (grid and extent per map kind), `setSeed`, `analyseWorld`: analysis grid (560×280 planet, 400×400 battle map), priority-flood drainage, rivers, settlements; `arenaPlaces`: battle-map places, buildings and streets; fills `W0` |
| `05-routes.js` | `CostField` (terrain friction; on battle maps water costs `BRIDGE` per cell and grade matters), `MinHeap`, A* `Pathfinder`, cooperative scheduler `sched`, `routeTask` |
| `06-simulation.js` | resources, faction spread, the history engine (wars, pacts), lookups such as `stateAt`, procedural lore |
| `07-minecraft-export.js` | `MCX.build`: writes a Bedrock world (level.dat + LevelDB log) as a zip |
| `08-rendering.js` | map canvas: progressive rendering, overlays; battle maps: `aerial` colouring (`AERIAL` palettes), lettered grid, buildings, place labels |
| `09-format.js` | number and coordinate formatting |
| `10-panel.js` | terrain readout, world stats, legend, sliders, `regenerate`, `newSeed`, map kind (`applyKind`, links via `hashFor`/`parseHash`) |
| `11-interaction.js` | pan, zoom, pinch, keyboard, layer buttons |
| `12-minecraft-panel.js` | the export section of the Generation tab |
| `13-sim-ui.js` | tabs, selection and inspector, timeline playback, simulation layers drawing, battle-map roads |
| `14-boot.js` | start-up |

## Data worth knowing

- Geometry: planet x ∈ [0,2], y ∈ [0,1], 2 units = 40,000 km; battle map x, y ∈ [0,1], 1 unit = `P.km` km.
  Use `WX` (map width in units), `MPU` (metres per unit) and `CELL_M` (metres per analysis cell), never a
  literal 2 or 40,000; `GW`/`GH`/`GN` change with the kind (call `setKind()` after changing `P.kind`/`P.km`).
- `W0` (per world): `kind`, `cities`, river `buckets`, analysis fields `f` (`hm` elevation, `bio`, `isR`, `acc`,
  `recv`…), `routes` (cell paths), `costField`, `net` (drawable road polylines, `km`, `bridges`). Battle maps
  add `bld` (buildings as x, y, w, h, angle ×5 in world units), `streets` (x1, y1, x2, y2 ×4), `deco`
  (landmark ground marks from `siteLayout`), `farms` (farmstead cells), `ring` (ring-road cell paths) and
  `tracks` (dirt-track polylines, built after the roads by `trackTask`); their
  `cities` carry `cls` (city/town/village/site), `kind` ("Town", "Quarry"…), `r` (radius m) and `pop`
  (number of buildings). Battle-map roads are built in the Generation tab by `regenerate`.
- Links: `#seed` is a planet, `#seed@a8.snow.island` a battle map (size, theme, layout). The history engine
  in `06` is a function called `history`, which shadows `window.history` inside the page: write
  `window.history`.
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

- Battle maps (asked for by the owner, modelled on 8×8 km battle-royale maps): original names and layouts,
  sizes 4/6/8 km, about 2.6 named places per km of width, relief organised in regions (one or two blocks
  of low, rounded, browner hills (about 220 m at most by default, 330 m in the desert); broad, gently rolling lowland with a few irregular lakes; ragged coasts),
  never aggressive, and shaded softly so the map reads as brightly lit, one or two broad rivers crossing many maps so roads need bridges, farmsteads scattered
  over open country and joined to the roads by dirt tracks, a ring road a few hundred metres in from the
  shore or map edge, and compounds drawn with their own silhouettes (runway and hangars, stadium bowl,
  cooling towers, quarry terraces, piers, prison walls, tank farms, rail sidings…); every map of 6 km or
  more has a military base in its most remote compound; harbours only beside the sea or a big lake.
  Towns grow organically: a winding main street (two in a city), side streets branching off, houses lining
  them and facing them, cleared ground around; roofs mostly cream with grey, terracotta, slate and white.
  Rivers about 130–180 m wide; shores alternate sandy bays and dark rocky stretches; a wavering reddish
  play-zone line just inside the map edge with hatching outside.
  Snow maps: dark pine woods, frozen lakes (pale blue ice with cracks; the sea only freezes at the shore),
  grey rock streaks on ridges, wind-drift texture, frozen streams, trodden ground around towns.
  Desert maps: hills 1.5× higher than other climates, red rock banded by strata on mesas and slopes,
  rippled dunes in some basins, pale dry washes (more drainage lines, read smoothly between cells), scrub
  thicker along the washes, green at lake shores (oases). No farmland on snow or desert maps.
  `W0.f.sea` marks open-sea water (reaches the map edge) as opposed to lakes. No faction simulation and no Minecraft export on battle maps: the owner wants them as
  pure design, as close as possible to the look of battle-royale maps.
- Battle-map look ("Aerial" layer): an aerial-photo style, not flat biome colours. Muted ground per climate,
  woods shaded continuously from a regional density (soft dark mottling from afar, fading through scrub into open ground; sunlit crowns only once they are a few pixels wide, so nothing looks splattered), patches of brown bare earth, farmland parcels, bare rock on steep slopes, turquoise shallows and slate deep water, texture laid
  in world space so it holds still while panning; pale roads with a faint shadow, grey bridges, cream
  buildings, white place names with a soft dark halo and no markers. Names and layouts stay original.

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
- Battle maps have been compared by eye with reference maps on desktop and phone-sized Chrome.

## Publishing

The live page is the claude.ai artifact https://claude.ai/artifact/WhWcodcMqiFq8mCLaqzMSn (title
"Worldsmith"). To update it, read it first with the Artifact tool, then publish `dist/worldsmith.html` with
that `url`. It declares the `downloads` capability (used by the Minecraft export); omitting `capabilities`
on a republish keeps it.

Artifact rules that matter here: the file has no `<!doctype>`, `<html>`, `<head>` or `<body>` (the host
adds them); scripts may only come from the allowed CDNs and fonts only from Google Fonts; downloads must go
through the `downloads` capability (`window.claude.use("downloads")`). `dist/preview.html` adds the document
skeleton and a local stand-in for that capability so the page also works when opened from disk.
