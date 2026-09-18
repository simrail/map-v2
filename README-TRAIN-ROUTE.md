# Train Route Feature (map package)

When a train is selected on the map, its full route is drawn along the real track
geometry, colored by drivability, with direction arrows along the line.

- **Green** — drivable in SimRail (exists in the wiki as available track)
- **Red** — real track, but not drivable in the game (e.g. the LK1 gap Myszków→Rozprza)
- **Grey** — no track data available; rendered as a straight line between stops

Controls — one row of three checkboxes in the selected-train panel, persisted in
`localStorage` via `SelectedTrainContext`:
- *Follow* — pans the map to keep the selected train centered (`followTrain`, `Map.tsx`)
- *Single* — hides every other train from the map while a train is selected
  (`onlySelectedTrain`, filter in `TrainsList.tsx`)
- *Route* — toggles the route layer (`showTrainRoute`, rendered by `TrainRoute.tsx`)

## Big picture

All routing is **precomputed at build time**; the browser never runs a router.
The generator (`packages/map/scripts/generate-rail-data.mjs`) downloads the SimRail
wiki interactive-map GeoJSONs plus every train timetable, snaps each station to one
canonical track node, A*-routes every consecutive-stop pair, and writes
`components/railData.json` (~170 KB, committed). At runtime a selected train only
fetches its timetable from the community EDR API and stitches precomputed polylines
together (`lib/trainRoute.ts`).

```
wiki map-data.json ─┐
route GeoJSONs ─────┤   generate-rail-data.mjs (build time / on demand)
station GeoJSONs ───┤   fetch → anchor → canonical nodes → A* → classify
timetables (API) ───┘            │
station overrides ───────────────┘└→ railData.json (committed)
                                          │
train click → EDR timetable → resolve stops → polyline lookup/stitch → Leaflet
```

## The generator, step by step

### Data sources

| Source | Provides |
|---|---|
| `wiki.simrail.eu/map/main-files/map-data.json` | Index of 106 lines + 161 stations |
| Route GeoJSONs (`/map/lk*.geojson`) | Per-line OSM track geometry. Lines can have two entries: drivable (`lk1.geojson`) and not-drivable (`lk1u.geojson`). Ways keep their OSM tags (`bridge`, `layer`, `tunnel`, …) |
| Station GeoJSONs (`/map/stations/*.geojson`) | Station drawings — through tracks (open LineStrings), area outlines (closed loops), platform polygons, or points |
| Timetables (`api1.aws.simrail.eu`, fallback: community EDR) | All trains' stop lists with line numbers (server `int1`) |
| `components/stations.json`, `stationsRemote.json`, `stations-open` API | In-game coordinates for dispatch posts and small stops missing from the wiki |
| `scripts/station-overrides.json` | Curated fixes; wins over every other source |

API responses are cached in `scripts/.cache/` (gitignored). Use `--refresh` to re-fetch.

### Step 1 — Station anchors

Station coordinates are extracted as the station's *middle*, never the first vertex
(that sat at the station's throat and made routes visibly stop at its edge):

- **Open LineStrings** (through tracks): arc-length midpoint of the longest one.
- **Closed-loop-only outlines** (~66 stations are drawn as area outlines): deferred —
  the game sources in Step 1b provide the precise in-game position; only stations with
  no game source fall back to the loop's centroid (the arc midpoint of a loop is an
  arbitrary point on its perimeter).
- **Polygons**: centroid of the largest ring. **Points**: as-is.

### Step 2 — Segments from timetables

A *segment* is a pair of consecutive **resolvable** stops (stops whose name matches a
station with coordinates; fuzzy "contains" matching resolves name variants like
"Warszawa Główna Towarowa" vs "…WOA"). Unresolvable intermediate stops are skipped and
their neighbors connected directly — their line numbers are still recorded.

Keys are the **sorted** pair of normalized names (`a|b`, `a < b`): both travel directions
of a hop share one entry, one A* run, and one geometry — out-and-back trains draw
identical lines. Each segment accumulates `allLines`, the union of line numbers from
every train on that pair in both directions (used for A* line preference).

### Step 2.5 — Canonical station nodes

Every station that participates in a segment is snapped **once** to a single graph node:

1. Nearest node on any of its *served lines* (the lines of all its segments), on the
   drivable-only graph;
2. else the same search on the full graph (non-drivable stations, e.g. Jęzor on LK171);
3. else the unrestricted nearest node.

Within 3 km (`SNAP_MAX_KM`) or the station is **dropped** from the gazetteer and
reported (the runtime then treats it like any unknown stop). The canonical coordinate
replaces the station's gazetteer coordinate, so the output is validated-on-track by
construction.

Because every segment touching a station routes to/from the same node, consecutive
segments share exact endpoints — the runtime needs no bridging, and routes pass through
a station's middle instead of ending at its throat.

### Graph construction (`rail-helpers.mjs`)

Nodes are unique coordinates (6-decimal dedup merges ways that share OSM nodes —
including at junctions). Edges are of two kinds:

- **Track edges** — consecutive points of a LineString, tagged with the line number
  from the route name. Parallel tracks of doubled lines never share coordinates, so
  the router can only change tracks via real junction/crossover geometry.
- **Endpoint-snap edges** — each LineString endpoint may connect to the nearest
  non-adjacent node within 500 m, bridging fragment gaps in the wiki data (e.g. a 257 m
  gap on LK139 near Brynów). The connection is only made if it keeps the way's heading
  within **60° at both ends**: real junctions and fragment bridges qualify, while a
  track crossing on a bridge/tunnel arrives perpendicular to the line below and is
  rejected. Without this filter the pass creates phantom junctions at every crossing
  (this actually happened: LK25 over LK1 south of Koluszki produced a >90° zigzag).

There is deliberately **no** all-pairs proximity mesh: the previous 15 m pass made up
48% of all edges, meshed the ~5 m-spaced parallel tracks of double lines, and let A*
zigzag between them.

### Step 3 — A* routing

Two graphs: drivable-only first (guarantees an all-green path), full graph as fallback
for hops that traverse non-drivable track. A* runs canonical node → canonical node with:

- **Line preference**: edges on the segment's timetable lines cost normal, others 10×
  (soft — junction connectors stay traversable).
- **Detour guard**: path > `2 × straight-line + 5 km` → rejected.
- **Foreign-line guard**: more than 5 km on a non-timetable line → rejected (the wiki
  lacks the right tracks; the hop renders grey). Skipped when the timetable provides no
  line hints at all (common on freight runs with `line 0` everywhere) — the detour guard
  alone decides.

Accepted paths get Z-shaped backtrack points removed and zero-length (sub-1 m) points
deduplicated, then are stored as Google Encoded Polylines (1e-5 precision ≈ 1.1 m).

### Step 4 — Drivability classification

Hops routed on the full graph are classified per point against the wiki's available /
not-available track geometry of the lines the path actually traversed (derived from the
path's edges — more accurate than timetable hints, and the only source for hint-less
freight hops). A point is **red** only if it is >50 m from any available track *and*
<200 m from a not-available track; otherwise green. Results are stored as boundary
indices (below).

### Step 5 — Output & reports

Reports to review on every run:

- **Dropped stations** — no track within 3 km of any source coordinate (bad wiki data).
  Fixable via `station-overrides.json`.
- **GREY RISK** — uncomputed stop pairs >50 km apart; these render as very long grey
  lines and usually indicate wiki data rot. Empty is good.
- **Computed / fallback counts** — a falling "Computed" number means the wiki changed
  or the pipeline regressed.

## Output format (`railData.json`)

```jsonc
{
  "version": 1,
  "knownStations": ["…"],        // in-game resolvable stations (resolved AND snapped);
                                 // the runtime trims routes to the first/last one
  "stations": { "name": [lat, lon] },  // normalized name → canonical on-track coordinate
  "segments": { "a|b": "…" },    // sorted key (a < b) → encoded polyline in KEY order
  "segmentColors": { "a|b": [[startIndex, colorCode], …] }  // boundaries in KEY order
}
```

- Color codes: `0` green, `1` red, `2` grey (no data for those tracks).
- A hop missing from `segments` renders as a grey straight line between the two
  canonical coordinates.
- **Reversal contract**: polylines and boundary indices are in key order. When a train
  travels `b → a`, the runtime reverses the decoded points *and* the sub-segment order
  (slicing by boundary indices happens in key order; the runtime's double-reverse
  handles direction — see git history for the bug this caused).

## Runtime behavior (`lib/trainRoute.ts`, `TrainRoute.tsx`)

1. Train selected → `getTrainRoute()` (memoized per `serverCode|trainNo`; concurrent
   calls share one promise).
2. Timetable fetched from `https://simrail-edr.emeraldnetwork.xyz/train/{server}/{train}`
   and cached for the session.
3. Stops resolved via the gazetteer (`normalizeName`: NFC → trim → collapse whitespace →
   lowercase); unknown stops are skipped and neighbors connected.
4. Route trimmed to the first/last known station.
5. For each consecutive stop pair: look up the sorted key; if missing, draw a grey
   straight line. Otherwise decode, apply the reversal contract, split at color
   boundaries, and merge adjacent same-color sub-segments (exact — endpoints are shared
   canonical nodes; the merged polyline simply drops the duplicated join point).
6. Real reversals (a train backing out of a terminus) and loops (e.g. the Muchowiec
   loop) are drawn **as-is** — doubled lines are correct train movement; there is
   deliberately no "out-and-back cleanup" (a previous dedup pass amputated legitimate
   track, producing multi-km straight lines).
7. `TrainRoute.tsx` renders one polyline per colored segment plus an SVG arrow per km
   traveled (rotation from the local bearing; size scales with zoom). Note: arrows are
   SVG triangles, not text glyphs — font metrics render `>` off-center in Firefox.

## Why grey (straight) lines appear

A hop renders grey when `segments` has no geometry for that stop pair. This is a
deliberate fallback: the runtime still draws a straight line between the two stations'
canonical coordinates, so the route stays continuous — "we know the train runs A→B,
but there is no track geometry for it" — instead of silently vanishing. Note that only
*resolvable* stops are drawn at all (off-map stops like Gdańsk are skipped, and the
route is trimmed to the first/last known station), so grey lines always run between
real, validated station positions and meet green/red track wherever wiki coverage
resumes — which is why a route can leave known track, cross unknown territory as grey,
and land on a known station further along the line.

Causes, most frequent first:

1. **The line doesn't exist in the wiki.** Timetable line numbers don't always match
   wiki route names (timetable "131" is wiki LK543/542) and some lines aren't drawn at
   all (e.g. the Zakopane branch, LK 94/97/98). Every hop on such a corridor is grey.
2. **The wiki has the line, but not that section** — the tracks are missing, isolated
   fragments A* can't reach, or the would-be path violates the sanity guards (detour /
   foreign-line). Current examples: `krzewie|koło` (42 km of LK3), `koniecpol|żelisławice`
   (LK572), `sosnowiec maczki|jęzor`. These are wiki data gaps, not code bugs.
3. **A dropped station stretches a hop.** If a station fails canonical snapping (bad
   source coordinates — e.g. Maków Podhalański), the runtime skips it and connects its
   *neighbors* directly. That long neighbor-pair was never computed (no timetable runs
   it as a single hop with usable lines), so it draws as one long grey chord. The
   generator's dropped-station report names the culprits.
4. **Zero-length hops (invisible, cosmetic).** Small halts often share a canonical node
   with their parent station (e.g. `piotrków trybunalski|… towarowa`, the Łódź Olechów
   PZS pairs): A* start==end yields no polyline, and the grey line is 0 km long.

The generator's **GREY RISK** report flags the worst offenders at build time (currently
`kraków główny|mysłowice`, 60 km, and `myszków|dionizów`). If one bothers you: check
whether the wiki added the missing line, fix bad stations via overrides, regenerate.
Grey cannot be "fixed" in runtime code — it is the no-data signal by design.

## Design decisions worth knowing

| Decision | Why |
|---|---|
| One canonical node per station | Independent per-segment snapping disagreed at shared stations; the runtime bridged the mismatch with straight lines (498 junctions had ≥10 m bridges, worst 2.7 km across Kraków Płaszów). With canonical nodes: 0. |
| Sorted-pair keys | Halves A* runs; out-and-back trains draw identical geometry; forces explicit direction handling (the reversal contract). |
| Endpoint-only snapping + heading filter | Parallel tracks of double lines must not be cross-connected (the old 15 m all-pairs mesh did), and bridge/tunnel crossings must not become phantom junctions. |
| No runtime heuristics | The old runtime had straight-line bridging, a >50 km grey guard, and an out-and-back dedup — all papering over generator data. All three removed; the generator now validates its own output instead. |
| Timetable hints are soft (10×), guards are hard | Hints pick the right corridor when several exist; guards reject paths the wiki can't support. |

## Running the generator

```bash
cd packages/map
pnpm generate:rail-data          # uses scripts/.cache/ (~1s)
pnpm generate:rail-data --refresh # re-fetch everything from the wiki/APIs (~3s)
```

Regeneration checklist:

1. Check the log: dropped stations, grey-risk entries, computed/fallback counts.
2. Spot-check in dev (`pnpm dev`): a Warszawa Wschodnia reversal train, an LK1 long haul
   (red gap Myszków→Rozprza stays red), and anything the report flagged.
3. Commit the regenerated `railData.json` together with any script changes.

## Fixing a misplaced station

Add it to `packages/map/scripts/station-overrides.json` (`{ "name": [lat, lon] }`,
normalized lowercase key) and regenerate. Overrides win over every other source.
Current example: `maków podhalański` — its wiki geometry is drawn ~200 km off.

## Key files

| File | Purpose |
|---|---|
| `packages/map/scripts/generate-rail-data.mjs` | Generator (fetch → anchor → snap → A* → classify → railData.json) |
| `packages/map/scripts/rail-helpers.mjs` | Graph builder (endpoint snap + heading filter), A* router, nearest-node finder, polyline codec |
| `packages/map/scripts/station-overrides.json` | Curated station coordinate fixes |
| `packages/map/components/railData.json` | Generated data (committed) |
| `packages/map/lib/trainRoute.ts` | Runtime assembly (lookup, reversal, color split, merge, caching) |
| `packages/map/components/TrainRoute.tsx` | Rendering (polylines + arrows), respects `showTrainRoute` |
| `packages/map/contexts/SelectedTrainContext.tsx` | Selected train + persisted toggles |

Tuning knobs (in the scripts): `SNAP_MAX_KM` (3 km), endpoint tolerance (500 m),
`MAX_ALIGN_DEG` (60°), detour guard (2× + 5 km), foreign-line allowance (5 km),
line-preference penalty (10×), `ARROW_SPACING_KM` (1, runtime).

## Validation state (last regeneration)

334 computed segments, 19 grey; 270 stations; zero join gaps between consecutive
segments, zero zero-length edges, no direction-duplicated keys, zero mid-path spikes
across all 1973 timetables (only genuine at-station reversals). The Żakowice
Południowe→Koluszki bridge crossing routes via the real LK537 corridor (sharpest turn
33°, previously an 84° phantom via LK25→LK1).

Known data gaps (wiki, not code): `sosnowiec maczki|jęzor`, `koniecpol|żelisławice`,
`idzikowice|radzice` (isolated track fragments in the wiki GeoJSONs), plus two long
grey pairs (`kraków główny|mysłowice`, `myszków|dionizów`). A few wiki ways are sparse
(few vertices), so some hops are multi-km straight chords — real straight track, not
rendering bugs (e.g. the 3.1 km chord on Sławków–Olkusz).