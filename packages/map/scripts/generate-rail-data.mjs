#!/usr/bin/env node

/**
 * generate-rail-data.mjs — Precomputes the train route geometry the map
 * draws for a selected train (lib/trainRoute.ts).
 *
 *   pnpm generate:rail-data            # uses scripts/.cache where present
 *   pnpm generate:rail-data --refresh  # re-downloads everything
 *
 * Output: components/railData.json
 *
 * ── Inputs ────────────────────────────────────────────────────────────────
 *   - SimRail wiki map (wiki.simrail.eu/map): one GeoJSON per railway line
 *     (LK1, LK4, …), split into the part available in the game and the part
 *     that isn't, plus station shapes. Line geometry is raw OpenStreetMap:
 *     one feature per track (a double-track line is two parallel ways),
 *     only `usage=main` tracks — so the crossovers between them are missing
 *     — and bridges/tunnels tagged `bridge`/`tunnel`/`layer`.
 *   - Station coordinates: wiki station shapes, local stations*.json, the
 *     SimRail panel API and scripts/station-overrides.json (wins).
 *   - Timetables of every train on one server (official API, community EDR
 *     as fallback). Each point has a name and `line`: the line the train
 *     departs that point on. Most points (junction posts, "PZS …") have no
 *     coordinates, but their line numbers still tell us every line a train
 *     uses between two stations.
 *
 * ── Pipeline ──────────────────────────────────────────────────────────────
 *   1. Fetch the inputs (cached in scripts/.cache).
 *   2. Collect station pairs: consecutive timetable points that have
 *      coordinates form a leg A→B. For each pair, record the lines its legs
 *      use, the line at A and at B. Legs touching line 0 or a line the wiki
 *      doesn't have are left out: there's no track to draw them on.
 *   3. Build the track graph (rail-helpers.mjs, buildRailGraph). Lines join
 *      only where OSM gives them a shared node, i.e. real junctions — never
 *      where they merely cross, as on a bridge. Connectors stand in for what
 *      the export lacks: crossovers between tracks of one line (≤20m apart,
 *      parallel, not on bridges/tunnels), clipped way ends (≤30m), and
 *      "line connectors" between different lines running side by side,
 *      which only line changes may use (below).
 *   4. Route each leg with A* strictly on its timetable lines, from the
 *      track of A's line nearest to A to the track of B's line nearest to B.
 *   5. Join consecutive legs. Where two legs meet at station S, simply
 *      concatenating them can be wrong: the train may change lines at S
 *      (the legs end on different tracks), or S's nearest track may not be
 *      the one the train passes on (the legs overshoot and come back). For
 *      every (previous station, S, next station) seen in a timetable, the
 *      last ~1km into S and first ~1km out of it are re-routed as one path.
 *      Only here, within 2km of S, may the route use S's other lines and
 *      switch between side-by-side lines. The result is stored only where it
 *      differs from plain concatenation.
 *   6. Write railData.json; stations are placed on their busiest line.
 *   7. Draw every timetable's route with the app's code and check it for
 *      off-track jumps and hairpins (check-routes.mjs). Exits with code 1 if
 *      the check fails.
 *
 * ── Output (railData.json) ────────────────────────────────────────────────
 *   stations       name → [lat, lon]
 *   knownStations  names the route may start/end at
 *   segments       "a|b" (a < b) → encoded polyline (precision 1e5), a→b
 *   segmentColors  "a|b" → [[first point index, 0 = available | 1 = not
 *                  available in the game], …]
 *   joins          "p|s|n" (p < n) → { cut: [points to drop from the end of
 *                  the p→s leg, points to drop from the start of the s→n
 *                  leg], points: encoded polyline p-side → n-side,
 *                  colors: colour runs of points, as in segmentColors }
 *
 * ── Reading the log ───────────────────────────────────────────────────────
 *   "off the wiki network"  legs over lines the wiki lacks — expected; the
 *                           app draws them grey or skips them.
 *   "failed"                a leg whose stations aren't near its lines or
 *                           whose lines don't connect: usually a wrong
 *                           station coordinate (fix in station-overrides
 *                           .json) or a gap in the wiki geometry.
 *   "Dropped"               a station with no track within 3km — again
 *                           usually a wrong coordinate.
 *   Route check failures list where jumps/hairpins happen and an example
 *   train; render that train on the map to see what's wrong.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkRoutes } from "./check-routes.mjs";
import {
	buildRailGraph,
	encodePolyline,
	findPath,
	haversineKm,
	nearestNode,
	normalizeName,
	parseWikiRoute,
	simplifyIndices,
	waysFromRouteGeoJson,
} from "./rail-helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, ".cache");
const OUTPUT_PATH = path.join(__dirname, "..", "components", "railData.json");
// The repository formatter; generated files are committed, so they're kept
// in its format (`pnpm format:check` runs in CI).
const OXFMT = path.join(
	__dirname,
	"..",
	"..",
	"..",
	"node_modules",
	".bin",
	"oxfmt",
);

const OFFICIAL_TIMETABLE_BASE =
	"https://api1.aws.simrail.eu:8082/api/getAllTimetables";
const EDR_COMMUNITY_BASE = "https://simrail-edr.emeraldnetwork.xyz";
const PANEL_BASE = "https://panel.simrail.eu:8084";
const WIKI_MAP_DATA_URL =
	"https://wiki.simrail.eu/map/main-files/map-data.json";
const WIKI_BASE = "https://wiki.simrail.eu";
const USER_AGENT = "simrail-app-map-route-generator/1.0";
// Max distance from a station's coordinate to the track it's placed on.
const SNAP_MAX_KM = 3.0;
// Douglas-Peucker tolerance for the output polylines. Also smooths out the
// few-metre hops between parallel tracks.
const SIMPLIFY_KM = 0.005;
// Radius around a station in which a join may use the station's other
// lines and switch between side-by-side lines.
const STATION_AREA_KM = 2;
// How far into and out of a station a join re-routes the legs.
const JOIN_KM = 1;
// segmentColors codes.
const GREEN = 0; // available in the game
const RED = 1; // not available
const TIMETABLE_SERVER = "int1";

fs.mkdirSync(CACHE_DIR, { recursive: true });
const refresh = process.argv.includes("--refresh");

async function cachedFetchJson(url, cacheName) {
	const cachePath = path.join(CACHE_DIR, cacheName);
	if (!refresh && fs.existsSync(cachePath)) {
		return JSON.parse(fs.readFileSync(cachePath, "utf8"));
	}
	const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
	const json = await res.json();
	fs.writeFileSync(cachePath, JSON.stringify(json));
	return json;
}

async function pool(items, limit, fn) {
	let idx = 0;
	const workers = Array.from(
		{ length: Math.min(limit, items.length) },
		async () => {
			while (idx < items.length) {
				const i = idx++;
				await fn(items[i], i);
			}
		},
	);
	await Promise.all(workers);
}

function extractStationAnchor(gj) {
	const lines = [];
	const rings = [];
	let point = null;
	for (const f of gj.features || []) {
		const g = f.geometry;
		if (!g) continue;
		if (g.type === "LineString") lines.push(g.coordinates);
		else if (g.type === "MultiLineString") lines.push(...g.coordinates);
		else if (g.type === "Polygon") rings.push(g.coordinates[0]);
		else if (g.type === "MultiPolygon") {
			for (const p of g.coordinates) rings.push(p[0]);
		} else if (g.type === "Point") point = g.coordinates;
	}
	const arcLenKm = (ls) => {
		let len = 0;
		for (let i = 1; i < ls.length; i++) {
			len += haversineKm([ls[i - 1][1], ls[i - 1][0]], [ls[i][1], ls[i][0]]);
		}
		return len;
	};
	const vertexCentroid = (ls) => {
		let lat = 0;
		let lon = 0;
		for (const c of ls) {
			lat += c[1];
			lon += c[0];
		}
		return [lat / ls.length, lon / ls.length];
	};
	if (lines.length > 0) {
		const open = [];
		const loops = [];
		for (const ls of lines) {
			if (ls.length < 2) continue;
			const closed =
				haversineKm(
					[ls[0][1], ls[0][0]],
					[ls[ls.length - 1][1], ls[ls.length - 1][0]],
				) *
					1000 <
				5;
			if (closed) loops.push(ls);
			else open.push(ls);
		}
		if (open.length > 0) {
			let best = null;
			let bestLen = -1;
			for (const ls of open) {
				const len = arcLenKm(ls);
				if (len > bestLen) {
					bestLen = len;
					best = ls;
				}
			}
			const target = bestLen / 2;
			let acc = 0;
			for (let i = 1; i < best.length; i++) {
				const seg = haversineKm(
					[best[i - 1][1], best[i - 1][0]],
					[best[i][1], best[i][0]],
				);
				if (acc + seg >= target) {
					const t = seg === 0 ? 0 : (target - acc) / seg;
					return {
						anchor: [
							best[i - 1][1] + (best[i][1] - best[i - 1][1]) * t,
							best[i - 1][0] + (best[i][0] - best[i - 1][0]) * t,
						],
						loopOnly: false,
					};
				}
				acc += seg;
			}
			const last = best[best.length - 1];
			return { anchor: [last[1], last[0]], loopOnly: false };
		}
		if (loops.length > 0) {
			let best = null;
			let bestLen = -1;
			for (const ls of loops) {
				const len = arcLenKm(ls);
				if (len > bestLen) {
					bestLen = len;
					best = ls;
				}
			}
			return { anchor: vertexCentroid(best), loopOnly: true };
		}
		const only = lines.find((ls) => ls.length >= 1);
		return only
			? { anchor: [only[0][1], only[0][0]], loopOnly: false }
			: { anchor: null, loopOnly: false };
	}
	if (rings.length > 0) {
		const size = (r) => {
			let mnLat = 1e9,
				mnLon = 1e9,
				mxLat = -1e9,
				mxLon = -1e9;
			for (const c of r) {
				if (c[1] < mnLat) mnLat = c[1];
				if (c[1] > mxLat) mxLat = c[1];
				if (c[0] < mnLon) mnLon = c[0];
				if (c[0] > mxLon) mxLon = c[0];
			}
			return mxLat - mnLat + (mxLon - mnLon);
		};
		const ring = rings.reduce((a, b) => (size(b) > size(a) ? b : a));
		if (ring.length === 0) return { anchor: null, loopOnly: false };
		return { anchor: vertexCentroid(ring), loopOnly: false };
	}
	if (point && point.length >= 2)
		return { anchor: [point[1], point[0]], loopOnly: false };
	return { anchor: null, loopOnly: false };
}

async function main() {
	const t0 = Date.now();
	const log = (msg) =>
		console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

	log("Step 1: Fetch wiki map-data.json + timetables (parallel)");

	const wikiPromise = (async () => {
		log("  [wiki] Fetching map-data.json...");
		const wikiMapData = await cachedFetchJson(
			WIKI_MAP_DATA_URL,
			"wiki_map_data.json",
		);
		log(
			`  [wiki] Routes: ${wikiMapData.routes.length}, Stations: ${wikiMapData.stations.length}`,
		);

		log("  [wiki] Fetching route geometries...");
		// Kept in the wiki's route order, not fetch completion order: the
		// graph's node numbering (and so path tie-breaks) follows it.
		const waysByRoute = wikiMapData.routes.map(() => []);
		await pool(wikiMapData.routes, 10, async (route, i) => {
			const lk = parseWikiRoute(route);
			if (!lk) return;
			try {
				const gj = await cachedFetchJson(WIKI_BASE + route.url, lk.cacheName);
				waysByRoute[i] = waysFromRouteGeoJson(gj, lk.line, lk.available);
			} catch (err) {
				log(`  [wiki] Failed ${route.name}: ${err.message}`);
			}
		});
		const routeWays = waysByRoute.flat();
		log(`  [wiki] Track ways: ${routeWays.length}`);

		log("  [wiki] Fetching station coordinates...");
		const stationCoords = new Map();
		const knownStations = new Set();
		const wikiLoopCentroids = new Map();
		await pool(wikiMapData.stations, 10, async (station) => {
			const norm = normalizeName(station.name);
			const cacheName = `wiki_station_${station.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}.json`;
			try {
				const gj = await cachedFetchJson(WIKI_BASE + station.url, cacheName);
				const { anchor, loopOnly } = extractStationAnchor(gj);
				if (!anchor) return;
				if (loopOnly) {
					wikiLoopCentroids.set(norm, anchor);
				} else {
					stationCoords.set(norm, anchor);
					knownStations.add(norm);
				}
			} catch {}
		});
		log(
			`  [wiki] Stations with coords: ${stationCoords.size} (+${wikiLoopCentroids.size} loop-only, deferred)`,
		);

		return {
			stationCoords,
			knownStations,
			routeWays,
			wikiLoopCentroids,
		};
	})();

	const timetablesPromise = (async () => {
		const cachePath = path.join(CACHE_DIR, "all_timetables.json");
		if (!refresh && fs.existsSync(cachePath)) {
			log("  [timetables] Cached");
			return;
		}
		log("  [timetables] Fetching from official API...");
		try {
			const resp = await fetch(
				`${OFFICIAL_TIMETABLE_BASE}?serverCode=${TIMETABLE_SERVER}`,
				{ headers: { "User-Agent": USER_AGENT } },
			);
			if (resp.ok) {
				const list = await resp.json();
				const all = (Array.isArray(list) ? list : list.data || [])
					.filter(
						(tt) =>
							tt.trainNoLocal &&
							Array.isArray(tt.timetable) &&
							tt.timetable.length > 0,
					)
					.map((tt) => ({
						trainNo: tt.trainNoLocal,
						timetable: tt.timetable,
					}));
				if (all.length > 0) {
					fs.writeFileSync(cachePath, JSON.stringify(all));
					log(`  [timetables] Official: ${all.length} timetables`);
					return;
				}
				log("  [timetables] Official API returned no timetables");
			}
		} catch (err) {
			log(`  [timetables] Official API failed: ${err.message}`);
		}
		log("  [timetables] Falling back to community EDR...");
		const trainsResp = await cachedFetchJson(
			`${PANEL_BASE}/trains-open?serverCode=${TIMETABLE_SERVER}`,
			`trains_${TIMETABLE_SERVER}.json`,
		);
		const trainList = trainsResp.data || [];
		const all = [];
		await pool(trainList, 20, async (train) => {
			try {
				const res = await fetch(
					`${EDR_COMMUNITY_BASE}/train/${TIMETABLE_SERVER}/${train.TrainNoLocal}`,
					{ headers: { "User-Agent": USER_AGENT } },
				);
				if (!res.ok) return;
				const tt = await res.json();
				if (Array.isArray(tt) && tt.length > 0) {
					all.push({ trainNo: train.TrainNoLocal, timetable: tt });
				}
			} catch {}
		});
		if (all.length === 0) {
			throw new Error("No timetables returned by either data source");
		}
		fs.writeFileSync(cachePath, JSON.stringify(all));
		log(`  [timetables] Community EDR: ${all.length} timetables`);
	})();

	const { stationCoords, knownStations, routeWays, wikiLoopCentroids } =
		await wikiPromise;
	await timetablesPromise;

	log("Step 1b: Supplement station coordinates from local files + API");
	const localCatalogs = [
		"stations.json",
		"stationsPassenger.json",
		"stationsRemote.json",
	].flatMap((file) =>
		JSON.parse(
			fs.readFileSync(path.join(__dirname, "..", "components", file), "utf8"),
		),
	);
	for (const s of localCatalogs) {
		if (s.Name && s.Latititude && s.Longitude) {
			const norm = normalizeName(s.Name);
			if (!stationCoords.has(norm)) {
				stationCoords.set(norm, [s.Latititude, s.Longitude]);
				knownStations.add(norm);
			}
		}
	}

	const serversResp = await cachedFetchJson(
		`${PANEL_BASE}/servers-open`,
		"servers.json",
	);
	const servers = serversResp.data.filter((s) => s.IsActive);
	for (const server of servers) {
		try {
			const resp = await cachedFetchJson(
				`${PANEL_BASE}/stations-open?serverCode=${server.ServerCode}`,
				`stations_${server.ServerCode}.json`,
			);
			if (resp.data) {
				for (const s of resp.data) {
					if (s.Name && s.Latititude && s.Longitude) {
						const norm = normalizeName(s.Name);
						if (!stationCoords.has(norm)) {
							stationCoords.set(norm, [s.Latititude, s.Longitude]);
							knownStations.add(norm);
						}
					}
				}
			}
		} catch {}
	}
	log(`  Total stations with coords: ${stationCoords.size}`);

	const overridesPath = path.join(__dirname, "station-overrides.json");
	if (fs.existsSync(overridesPath)) {
		const overrides = JSON.parse(fs.readFileSync(overridesPath, "utf8"));
		for (const [name, coord] of Object.entries(overrides)) {
			const norm = normalizeName(name);
			const prev = stationCoords.get(norm);
			stationCoords.set(norm, coord);
			knownStations.add(norm);
			log(
				`  Override [${name}]: ${prev ? `${prev.map((x) => x.toFixed(3)).join(",")} -> ` : ""}${coord.map((x) => x.toFixed(3)).join(",")}`,
			);
		}
	}

	let loopFallbackCount = 0;
	for (const [norm, coord] of wikiLoopCentroids) {
		if (!stationCoords.has(norm)) {
			stationCoords.set(norm, coord);
			knownStations.add(norm);
			loopFallbackCount++;
		}
	}
	if (loopFallbackCount > 0) {
		log(`  Loop-centroid fallbacks (no game coordinate): ${loopFallbackCount}`);
	}

	log("Step 2: Collect station pairs from timetables");
	const allTimetables = JSON.parse(
		fs.readFileSync(path.join(CACHE_DIR, "all_timetables.json"), "utf8"),
	);

	/** The timetable's points that have a position: { name, index }[]. */
	function timetableStations(timetable) {
		const out = [];
		timetable.forEach((entry, index) => {
			const raw = entry.nameOfPoint || entry.nameForPerson;
			if (!raw) return;
			const name = normalizeName(raw);
			// Points without coordinates (junction posts, PZS…) are skipped.
			if (!stationCoords.has(name)) return;
			if (name !== out[out.length - 1]?.name) out.push({ name, index });
		});
		return out;
	}

	// A timetable point's `line` is the line the train departs it on, so a
	// leg A→B leaves A on A's line and arrives at B on the line of the point
	// before B. Intermediate points (junction posts, PZS…) have no
	// coordinates but still tell us every line the leg uses.
	const wikiLines = new Set(routeWays.map((w) => w.line));
	const lineOf = (entry) => String(Number(entry.line) || "") || null;
	const count = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
	// Line counts, most frequent first; ties by line number, so the result
	// doesn't depend on the order the timetables come in.
	const byFrequency = (counts) =>
		[...counts.entries()]
			.sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
			.map(([line]) => line);
	const mostCommon = (counts) => byFrequency(counts)[0] ?? null;
	const pairs = new Map();
	for (const { timetable } of allTimetables) {
		if (!Array.isArray(timetable)) continue;
		const stops = timetableStations(timetable);
		for (let k = 1; k < stops.length; k++) {
			const from = stops[k - 1];
			const to = stops[k];
			const legEntries = timetable.slice(from.index, to.index);
			const fromLine = lineOf(timetable[from.index]);
			const toLine = lineOf(timetable[to.index - 1]);
			const [a, b, aLine, bLine] =
				from.name < to.name
					? [from.name, to.name, fromLine, toLine]
					: [to.name, from.name, toLine, fromLine];
			const key = `${a}|${b}`;
			let pair = pairs.get(key);
			if (!pair) {
				pair = {
					key,
					a,
					b,
					aLines: new Map(),
					bLines: new Map(),
					lines: new Set(),
				};
				pairs.set(key, pair);
			}
			// Skip timetables where part of the leg runs on track the wiki
			// doesn't have (line 0 = outside the playable area); other trains
			// may still run the same leg on known lines.
			const legLines = legEntries.map(lineOf);
			if (legLines.some((line) => !line || !wikiLines.has(line))) continue;
			if (aLine) count(pair.aLines, aLine);
			if (bLine) count(pair.bLines, bLine);
			for (const line of legLines) pair.lines.add(line);
		}
	}
	log(`  Station pairs: ${pairs.size}`);

	log("Step 3: Build track graph");
	const graph = buildRailGraph(routeWays);
	log(
		`  Nodes: ${graph.stats.nodes}, edges: ${graph.stats.edges} (track connectors: ${graph.stats.trackConnectors}, line connectors: ${graph.stats.lineConnectors}, dead-end connectors: ${graph.stats.deadEndConnectors}, ignored fragments: ${graph.stats.fragments})`,
	);

	// Lines each station is served by, busiest first.
	const stationLineCounts = new Map();
	for (const pair of pairs.values()) {
		for (const [name, lines] of [
			[pair.a, pair.aLines],
			[pair.b, pair.bLines],
		]) {
			if (!stationLineCounts.has(name)) stationLineCounts.set(name, new Map());
			const counts = stationLineCounts.get(name);
			for (const [l, n] of lines) counts.set(l, (counts.get(l) ?? 0) + n);
		}
	}
	const stationLines = new Map(
		[...stationLineCounts].map(([name, counts]) => [name, byFrequency(counts)]),
	);

	// A station's point on a given line: the track of that line nearest to
	// the station.
	const stationNodeCache = new Map();
	const stationNode = (name, line) => {
		const key = `${name}|${line}`;
		if (!stationNodeCache.has(key)) {
			const anchor = stationCoords.get(name);
			stationNodeCache.set(
				key,
				anchor
					? nearestNode(
							graph,
							anchor,
							line ? new Set([line]) : null,
							SNAP_MAX_KM,
						)
					: -1,
			);
		}
		return stationNodeCache.get(key);
	};

	// Turns a path into its simplified vertices (node ids) plus colour runs
	// [first vertex index, colour]. Connectors take the colour of the track
	// before them.
	const simplifyPath = (from, edgePath) => {
		const nodes = [from];
		const colors = [];
		for (const e of edgePath) {
			const edge = graph.edges[e];
			nodes.push(edge.a === nodes[nodes.length - 1] ? edge.b : edge.a);
			colors.push(edge.line === null ? null : edge.available ? GREEN : RED);
		}
		for (let i = 0; i < colors.length; i++) {
			colors[i] ??=
				i > 0 ? colors[i - 1] : (colors.find((c) => c !== null) ?? GREEN);
		}
		const keep = new Set([0]);
		const runStarts = [];
		for (let i = 0; i < colors.length;) {
			let j = i;
			while (j < colors.length && colors[j] === colors[i]) j++;
			runStarts.push([i, colors[i]]);
			const run = nodes.slice(i, j + 1);
			for (const k of simplifyIndices(
				run.map((n) => graph.coords[n]),
				SIMPLIFY_KM,
			)) {
				keep.add(i + k);
			}
			i = j;
		}
		const kept = [...keep].sort((a, b) => a - b);
		const vertexOf = new Map(kept.map((k, v) => [k, v]));
		return {
			nodes: kept.map((k) => nodes[k]),
			boundaries:
				runStarts.length > 0
					? runStarts.map(([i, color]) => [vertexOf.get(i), color])
					: [[0, GREEN]],
		};
	};
	const polylineKm = (nodes) => {
		let km = 0;
		for (let i = 1; i < nodes.length; i++) {
			km += haversineKm(graph.coords[nodes[i - 1]], graph.coords[nodes[i]]);
		}
		return km;
	};
	const encodeNodes = (nodes) =>
		encodePolyline(nodes.map((n) => graph.coords[n]));

	log("Step 4: Route legs between stations");
	// A leg runs strictly on the lines its timetable points are on, from
	// the departure line's track at A to the arrival line's track at B.
	const legs = new Map();
	const failures = [];
	let offNetwork = 0;
	for (const pair of pairs.values()) {
		if (pair.lines.size === 0) {
			offNetwork++;
			continue;
		}
		const endOn = (name, preferred) => {
			for (const line of new Set([preferred, ...pair.lines])) {
				if (!line) continue;
				const node = stationNode(name, line);
				if (node >= 0) return node;
			}
			return -1;
		};
		const from = endOn(pair.a, mostCommon(pair.aLines));
		const to = endOn(pair.b, mostCommon(pair.bLines));
		if (from < 0 || to < 0) {
			failures.push(`${pair.key}: station not near its lines`);
			continue;
		}
		// It may switch between two of its lines where they run side by side
		// (the switch is at a timetable point without coordinates).
		const onLeg = (node) =>
			[...graph.nodeLines[node]].some((l) => pair.lines.has(l));
		const edgePath = findPath(graph, from, to, (e) =>
			e.line === null
				? !e.crossLine || (onLeg(e.a) && onLeg(e.b))
				: pair.lines.has(e.line),
		);
		if (!edgePath) {
			failures.push(
				`${pair.key}: no path on lines ${[...pair.lines].join(",")}`,
			);
			continue;
		}
		legs.set(pair.key, { ...simplifyPath(from, edgePath), lines: pair.lines });
	}
	log(
		`  Routed: ${legs.size}/${pairs.size}, off the wiki network: ${offNetwork}, failed: ${failures.length}`,
	);
	for (const f of failures) log(`    - ${f}`);

	log("Step 5: Join consecutive legs at stations");
	// Two legs meeting at S each end on their own line's track nearest to
	// S, which needn't be where the train passes: it may change lines at S,
	// or S's nearest track may be a parallel one. A join replaces the last
	// ~1km of the leg into S and the first ~1km of the leg out of it with
	// the shortest path between those points. It may use the station's
	// other lines — and switch between lines running side by side — only
	// within the station area.
	const orientedLeg = (from, to) => {
		const leg = legs.get(from < to ? `${from}|${to}` : `${to}|${from}`);
		if (!leg) return null;
		return { ...leg, nodes: from < to ? leg.nodes : [...leg.nodes].reverse() };
	};
	const joins = {};
	const seenTriples = new Set();
	let joinFailures = 0;
	for (const { timetable } of allTimetables) {
		if (!Array.isArray(timetable)) continue;
		const names = timetableStations(timetable).map((stop) => stop.name);
		for (let i = 1; i < names.length - 1; i++) {
			// Canonical direction: from the alphabetically smaller neighbour.
			// A train reversing at S (same neighbour both sides) keeps its
			// out-and-back.
			const [prev, station, next] =
				names[i - 1] < names[i + 1]
					? [names[i - 1], names[i], names[i + 1]]
					: [names[i + 1], names[i], names[i - 1]];
			const key = `${prev}|${station}|${next}`;
			if (prev === next || seenTriples.has(key)) continue;
			seenTriples.add(key);
			const inLeg = orientedLeg(prev, station);
			const outLeg = orientedLeg(station, next);
			if (!inLeg || !outLeg) continue;

			// Reach back at most to the middle of each leg, so the joins at
			// both ends of a short leg never overlap.
			const inMid = Math.ceil((inLeg.nodes.length - 1) / 2);
			const outMid = Math.floor((outLeg.nodes.length - 1) / 2);
			let cutIn = inLeg.nodes.length - 1;
			while (cutIn > inMid && polylineKm(inLeg.nodes.slice(cutIn)) < JOIN_KM)
				cutIn--;
			let cutOut = 0;
			while (
				cutOut < outMid &&
				polylineKm(outLeg.nodes.slice(0, cutOut + 1)) < JOIN_KM
			)
				cutOut++;

			const center = graph.coords[inLeg.nodes[inLeg.nodes.length - 1]];
			const stationOwn = new Set(stationLines.get(station) ?? []);
			const inArea = (e) =>
				haversineKm(graph.coords[e.a], center) <= STATION_AREA_KM;
			const edgePath = findPath(
				graph,
				inLeg.nodes[cutIn],
				outLeg.nodes[cutOut],
				(e) =>
					(e.line === null && !e.crossLine) ||
					inLeg.lines.has(e.line) ||
					outLeg.lines.has(e.line) ||
					((e.crossLine || stationOwn.has(e.line)) && inArea(e)),
			);
			const legsMeet = inLeg.nodes[inLeg.nodes.length - 1] === outLeg.nodes[0];
			if (!edgePath) {
				if (!legsMeet) joinFailures++;
				continue;
			}
			const { nodes, boundaries } = simplifyPath(inLeg.nodes[cutIn], edgePath);
			const concatKm =
				polylineKm(inLeg.nodes.slice(cutIn)) +
				polylineKm(outLeg.nodes.slice(0, cutOut + 1));
			// Only worth storing where plain concatenation is wrong.
			if (legsMeet && polylineKm(nodes) > concatKm - 0.02) continue;
			joins[key] = {
				cut: [inLeg.nodes.length - 1 - cutIn, cutOut],
				points: encodeNodes(nodes),
				// A join may cross track that isn't available in the game.
				colors: boundaries,
			};
		}
	}
	log(
		`  Joins: ${Object.keys(joins).length} (of ${seenTriples.size} station passes), unroutable line changes: ${joinFailures}`,
	);

	log("Step 6: Write output");
	const segments = {};
	const segmentColors = {};
	for (const [key, leg] of legs) {
		segments[key] = encodeNodes(leg.nodes);
		segmentColors[key] = leg.boundaries;
	}
	const stations = {};
	for (const [name, coord] of stationCoords) {
		const lines = stationLines.get(name);
		if (!lines) {
			stations[name] = coord;
			continue;
		}
		// Draw the station on its busiest line.
		const node = [...lines, null]
			.map((line) => stationNode(name, line))
			.find((n) => n >= 0);
		if (node === undefined) {
			log(`  Dropped (no track within ${SNAP_MAX_KM}km): ${name}`);
			knownStations.delete(name);
			continue;
		}
		stations[name] = graph.coords[node];
	}
	// Sorted by plain code-unit order (not locale-aware), so regenerating
	// only produces a diff when the data changes.
	const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
	const sortKeys = (obj) =>
		Object.fromEntries(Object.entries(obj).sort(([a], [b]) => byName(a, b)));
	const output = {
		version: 2,
		knownStations: [...knownStations]
			.filter((name) => name in stations)
			.sort(byName),
		stations: sortKeys(stations),
		segments: sortKeys(segments),
		segmentColors: sortKeys(segmentColors),
		joins: sortKeys(joins),
	};
	fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output));
	execFileSync(OXFMT, [OUTPUT_PATH], { stdio: "ignore" });
	log(
		`  Written ${OUTPUT_PATH} (${(fs.statSync(OUTPUT_PATH).size / 1024).toFixed(0)} KB)`,
	);

	log("Step 7: Check the routes (scripts/check-routes.mjs)");
	const { ok } = await checkRoutes({ log });
	if (!ok) process.exitCode = 1;
	log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
	console.error("FATAL:", err);
	process.exit(1);
});
