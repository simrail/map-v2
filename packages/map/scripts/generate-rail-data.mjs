#!/usr/bin/env node
/**
 * generate-rail-data.mjs — Generator script for railData.json.
 *
 * This script fetches data from the SimRail wiki interactive map and the
 * SimRail timetable API, then pre-computes track-following route geometries
 * between every pair of consecutive timetable stops. The output is committed
 * to the repository as components/railData.json and loaded at runtime by
 * lib/trainRoute.ts.
 *
 * Data sources:
 *   1. Wiki interactive map (wiki.simrail.eu/map/) — provides:
 *      - Route GeoJSON files: exact OSM track geometry per railway line (LK1,
 *        LK4, LK62, etc.), split into "available" (drivable in SimRail) and
 *        "not available" (not drivable) sections. Some lines have two entries
 *        with different URLs (e.g. lk1.geojson vs lk1u.geojson).
 *      - Station GeoJSON files: track geometry at each station/signal box,
 *        used to extract station coordinates. Geometry types include
 *        LineString, MultiLineString, Polygon, and Point.
 *      - map-data.json: master index of routes and stations with metadata
 *        (type: "po"/"border"/"playable:false", available: true/false).
 *   2. SimRail official timetable API (api1.aws.simrail.eu) — provides all
 *      train timetables (stop lists with line numbers). Falls back to the
 *      community EDR API (simrail-edr.emeraldnetwork.xyz) if the official
 *      API is down.
 *   3. Local station files (components/stations.json, stationsRemote.json) —
 *      supplement the wiki's 161 stations with additional coordinates for
 *      small stops (e.g. Sprowa, Józefinów) that aren't in the wiki.
 *   4. SimRail stations-open API (panel.simrail.eu:8084) — provides
 *      coordinates for dispatch stations (e.g. Pruszków, Grodzisk Mazowiecki).
 *
 * Pipeline:
 *   Step 1:  Fetch wiki map-data.json + route GeoJSONs + station GeoJSONs +
 *            timetables (all in parallel). Cache all responses to disk.
 *   Step 1b: Supplement station coordinates from local files + stations-open API
 *            (the wiki doesn't include all timetable stops).
 *   Step 2:  Collect unique segments from timetables. A segment is a pair of
 *            consecutive stops that both have coordinates. Stops without
 *            coordinates (signal boxes, off-map stations) are skipped, and
 *            the surrounding resolvable stops are connected directly. Each
 *            segment records allLines (all line numbers between the from and
 *            to stops, including skipped intermediates) for A* line preference.
 *   Step 3:  Compute A* routes for each segment. Build a rail graph (CSR format)
 *            from wiki track geometry. For each segment:
 *            - Snap from/to station coordinates to graph nodes, preferring the
 *              from-stop's departure line (prevents snapping to wrong parallel
 *              tracks at junctions).
 *            - Try A* with the from-stop's line as preferred (non-preferred
 *              edges cost 10x more but are still traversable for junction
 *              connectors). Fallback to allLines, then unconstrained with
 *              detour guard (>1.5x straight-line distance = rejected).
 *            - Skip segments whose timetable line number doesn't exist in the
 *              wiki (e.g. line 131 maps to wiki LK543/LK542, not LK131).
 *            - Remove backtracking points (Z-shaped edges) iteratively.
 *   Step 4:  Determine per-segment drivability (green/red) by classifying each
 *            point along the path against the wiki's available and not-available
 *            track geometry. A point is red only if it's NOT on an available
 *            track (>50m away) AND close to a not-available track (<200m).
 *            This avoids false reds from parallel available/not-available tracks.
 *            Store results as color boundaries: [startIndex, colorCode] pairs.
 *            colorCode: 0=green, 1=red, 2=grey (no wiki data).
 *   Step 5:  Write the output JSON file.
 *
 * Usage: node packages/map/scripts/generate-rail-data.mjs [--refresh]
 *
 * --refresh: Forces re-fetching from the APIs (ignores cache).
 *            Without --refresh, all API responses are cached in scripts/.cache/
 *            and reused on subsequent runs for fast iteration (~1s vs ~5s).
 *
 * Output format (railData.json):
 *   {
 *     knownStations: string[],              // Normalized station names (define playable area for route trimming)
 *     stations: { [name]: [lat, lon] },    // Station coordinate gazetteer (normalized name → [lat, lon])
 *     segments: { [key]: string },          // Google Encoded Polylines (key = "fromNorm|toNorm")
 *     segmentColors: { [key]: number[][] } // Color boundaries: [[startIndex, colorCode], ...]
 *                                          // colorCode: 0=green (drivable), 1=red (non-drivable), 2=grey (no data)
 *   }
 *
 * The runtime (lib/trainRoute.ts) decodes each segment's polyline and splits
 * it at the color boundaries to render green/red/grey sub-segments on the map.
 * Adjacent same-color sub-segments are merged for rendering efficiency.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	buildGraphFromRoutes,
	encodePolyline,
	haversineKm,
	makeNearestNode,
	makeRouter,
	normalizeName,
} from "./rail-helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, ".cache");
const OUTPUT_PATH = path.join(__dirname, "..", "components", "railData.json");

const OFFICIAL_TIMETABLE_BASE =
	"https://api1.aws.simrail.eu:8082/api/getAllTimetables";
const EDR_COMMUNITY_BASE = "https://simrail-edr.emeraldnetwork.xyz";
const PANEL_BASE = "https://panel.simrail.eu:8084";
const WIKI_MAP_DATA_URL =
	"https://wiki.simrail.eu/map/main-files/map-data.json";
const WIKI_BASE = "https://wiki.simrail.eu";
const USER_AGENT = "simrail-app-map-route-generator/1.0";
const SNAP_MAX_KM = 3.0;
const TIMETABLE_SERVER = "int1";

fs.mkdirSync(CACHE_DIR, { recursive: true });
const refresh = process.argv.includes("--refresh");

/**
 * Fetches JSON from a URL and caches it to disk.
 * On subsequent runs (without --refresh), the cached file is used directly.
 */
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

/**
 * Runs async tasks with bounded concurrency.
 * Creates `limit` concurrent workers that pull from a shared index.
 */
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

async function main() {
	const t0 = Date.now();
	const log = (msg) =>
		console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

	// ========================================================================
	// Step 1: Fetch wiki map-data.json + timetables (parallel)
	// ========================================================================

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

		// --- Fetch route GeoJSON files ---
		// Each route has a URL to a GeoJSON file with track geometry (LineStrings).
		// Some lines have TWO entries: "available" (drivable) and "not available"
		// (not drivable), with different URLs (e.g. lk1.geojson vs lk1u.geojson).
		log("  [wiki] Fetching route geometries...");
		const routeFeatures = [];
		await pool(wikiMapData.routes, 10, async (route) => {
			const match = route.name.match(/^LK(\d+)$/);
			if (!match) return;
			const lineNo = match[1];
			const isAvailable = route.available !== false;
			// Cache name includes availability flag to avoid collisions.
			const cacheName = `wiki_route_${route.name.replace(/[^a-zA-Z0-9]/g, "_")}_${isAvailable ? "avail" : "notavail"}.json`;
			try {
				const gj = await cachedFetchJson(WIKI_BASE + route.url, cacheName);
				for (const f of gj.features || []) {
					routeFeatures.push({
						geometry: f.geometry,
						refs: [lineNo],
						available: isAvailable,
					});
				}
			} catch (err) {
				log(`  [wiki] Failed ${route.name}: ${err.message}`);
			}
		});
		log(`  [wiki] Route features: ${routeFeatures.length}`);

		// --- Fetch station GeoJSON files ---
		// Each station has a URL to a GeoJSON file. We extract a coordinate
		// from the first feature (LineString, Polygon, or Point geometry).
		log("  [wiki] Fetching station coordinates...");
		const stationCoords = new Map();
		const knownStations = new Set();
		await pool(wikiMapData.stations, 10, async (station) => {
			const norm = normalizeName(station.name);
			const cacheName = `wiki_station_${station.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}.json`;
			try {
				const gj = await cachedFetchJson(WIKI_BASE + station.url, cacheName);
				for (const f of gj.features || []) {
					const g = f.geometry;
					if (!g?.coordinates?.[0]) continue;
					let coord;
					// GeoJSON coordinates are [lon, lat]; we store [lat, lon].
					if (g.type === "LineString") coord = g.coordinates[0];
					else if (g.type === "MultiLineString") coord = g.coordinates[0]?.[0];
					else if (g.type === "Point") coord = g.coordinates;
					else if (g.type === "Polygon") coord = g.coordinates[0]?.[0];
					if (coord && coord.length >= 2) {
						stationCoords.set(norm, [coord[1], coord[0]]);
						knownStations.add(norm);
						break;
					}
				}
			} catch {
				// skip
			}
		});
		log(`  [wiki] Stations with coords: ${stationCoords.size}`);

		return { wikiMapData, stationCoords, knownStations, routeFeatures };
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
				const all = (Array.isArray(list) ? list : list.data || []).map(
					(tt) => ({
						trainNo: tt.trainNoLocal,
						timetable: tt.timetable || [],
					}),
				);
				fs.writeFileSync(cachePath, JSON.stringify(all));
				log(`  [timetables] Official: ${all.length} timetables`);
				return;
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
			} catch {
				// skip
			}
		});
		fs.writeFileSync(cachePath, JSON.stringify(all));
		log(`  [timetables] Community EDR: ${all.length} timetables`);
	})();

	const { wikiMapData, stationCoords, knownStations, routeFeatures } =
		await wikiPromise;
	await timetablesPromise;

	// Supplement station coordinates with local files and the SimRail API.
	// The wiki station list (161 stations) doesn't include all timetable stops
	// (e.g. Pruszków, Grodzisk Mazowiecki, Sprowa, Korytów). These are available
	// from the local stations.json/stationsRemote.json files and the stations-open API.
	log("Step 1b: Supplement station coordinates from local files + API");
	const localBundled = JSON.parse(
		fs.readFileSync(
			path.join(__dirname, "..", "components", "stations.json"),
			"utf8",
		),
	);
	const localRemote = JSON.parse(
		fs.readFileSync(
			path.join(__dirname, "..", "components", "stationsRemote.json"),
			"utf8",
		),
	);
	for (const s of [...localBundled, ...localRemote]) {
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
		} catch {
			// skip
		}
	}
	log(`  Total stations with coords: ${stationCoords.size}`);

	// ========================================================================
	// Step 2: Collect segments from timetables
	// ========================================================================
	// A "segment" is a pair of consecutive stops that both have coordinates.
	// Stops without coordinates (signal boxes, off-map stations) are skipped,
	// and the surrounding resolvable stops are connected directly.

	log("Step 2: Collect segments from timetables");
	const allTimetables = JSON.parse(
		fs.readFileSync(path.join(CACHE_DIR, "all_timetables.json"), "utf8"),
	);

	const wikiStationList = wikiMapData.stations;

	/**
	 * Resolves a raw station name to a normalized name with coordinates.
	 * First tries exact match, then fuzzy "contains" matching against the
	 * wiki station list (e.g. "Warszawa Główna Towarowa" matches
	 * "Warszawa Główna Towarowa WOA").
	 */
	function resolveStationCoords(rawName) {
		const norm = normalizeName(rawName);
		if (stationCoords.has(norm)) return norm;
		for (const ws of wikiStationList) {
			const sn = normalizeName(ws.name);
			if (sn.includes(norm) || norm.includes(sn)) {
				const c = stationCoords.get(sn);
				if (c) {
					stationCoords.set(norm, c);
					knownStations.add(norm);
					return norm;
				}
			}
		}
		return null;
	}

	const segments = new Map();
	for (const tt of allTimetables) {
		const entries = tt.timetable;
		if (!Array.isArray(entries)) continue;
		let lastResolved = -1;
		for (let i = 0; i < entries.length; i++) {
			const name = entries[i].nameOfPoint || entries[i].nameForPerson;
			if (!name) continue;
			const resolved = resolveStationCoords(name);
			const hasCoords = !!resolved;
			if (hasCoords && lastResolved >= 0 && lastResolved !== i) {
				const fromName =
					entries[lastResolved].nameOfPoint ||
					entries[lastResolved].nameForPerson;
				const fromResolved =
					resolveStationCoords(fromName) || normalizeName(fromName);
				const key = `${fromResolved}|${resolved}`;
				const line = Number(entries[lastResolved].line) || 0;
				const toLine = Number(entries[i].line) || 0;
				// Collect ALL line numbers between the from and to stops
				// (including skipped intermediate stops). This ensures the
				// A* prefers the correct connecting lines even when intermediate
				// stops without coordinates are skipped.
				const allLines = new Set();
				if (line > 0) allLines.add(String(line));
				if (toLine > 0) allLines.add(String(toLine));
				for (let j = lastResolved + 1; j < i; j++) {
					const midLine = Number(entries[j]?.line) || 0;
					if (midLine > 0) allLines.add(String(midLine));
				}
				if (!segments.has(key)) {
					segments.set(key, {
						key,
						from: fromName,
						to: name,
						line: line > 0 ? String(line) : null,
						toLine: toLine > 0 ? String(toLine) : null,
						toLineWas0: toLine === 0,
						allLines: [...allLines],
						label: `${fromName} → ${name}`,
					});
				} else {
					const existing = segments.get(key);
					for (const l of allLines) {
						if (!existing.allLines.includes(l)) {
							existing.allLines.push(l);
						}
					}
				}
			}
			if (hasCoords) lastResolved = i;
		}
	}
	log(`  Unique segments: ${segments.size}`);

	// Prepare work segments: replace station names with coordinates.
	const workSegments = [];
	let noCoordsCount = 0;
	for (const seg of segments.values()) {
		const fromCoord = stationCoords.get(normalizeName(seg.from));
		const toCoord = stationCoords.get(normalizeName(seg.to));
		if (!fromCoord || !toCoord) {
			noCoordsCount++;
			continue;
		}
		seg.from = fromCoord;
		seg.to = toCoord;
		workSegments.push(seg);
	}
	log(`  Work segments: ${workSegments.length} (skipped ${noCoordsCount})`);

	// Build a set of line numbers that exist in the wiki route data.
	// Used to skip segments whose timetable line number doesnt correspond
	// to any wiki track (e.g. line 131 in the timetable corresponds to
	// wiki LK543/LK542, not LK131).
	const wikiLineNumbers = new Set();
	for (const r of wikiMapData.routes) {
		const match = r.name.match(/^LK(\d+)$/);
		if (match) wikiLineNumbers.add(match[1]);
	}

	// ========================================================================
	// Step 3: Compute A* routes
	// ========================================================================
	// Build two rail graphs from wiki route features:
	//   - graphAvail: only available (drivable) tracks
	//   - graphFull: all tracks (available + not-available)
	// For each segment, try A* on graphAvail first. If a path is found, the
	// entire segment is green (no availability classification needed). If no
	// path exists on available tracks, fall back to graphFull and classify
	// per-point availability (may produce red sub-segments).

	log("Step 3: Compute A* routes");

	// Factory: builds nearest-node finder, line-membership table, preferred-line
	// snap function, and A* router for a given graph.
	function makeGraphHelpers(g) {
		const nearest = makeNearestNode(g, 0.02, SNAP_MAX_KM);
		const router = makeRouter(g);

		const nLines = new Map();
		for (let u = 0; u < g.coords.length; u++) {
			for (let p = g.start[u]; p < g.start[u + 1]; p++) {
				const e = g.adjEdge[p];
				const refs = g.erefs[e];
				if (!refs) continue;
				for (const r of refs) {
					if (!nLines.has(r)) {
						nLines.set(r, new Uint8Array(g.coords.length));
					}
					nLines.get(r)[u] = 1;
				}
			}
		}

		const pGrids = new Map();
		const GRID = 0.02;
		function snap(point, preferredLine) {
			const global = nearest(point);
			if (!preferredLine || global.distKm > SNAP_MAX_KM) return global;
			const hasLine = nLines.get(preferredLine);
			if (!hasLine) return global;
			if (hasLine[global.index]) return global;

			if (!pGrids.has(preferredLine)) {
				const grid = new Map();
				for (let i = 0; i < g.coords.length; i++) {
					if (!hasLine[i]) continue;
					const [nlat, nlon] = g.coords[i];
					const key = `${Math.floor(nlat / GRID)},${Math.floor(nlon / GRID)}`;
					if (!grid.has(key)) grid.set(key, []);
					grid.get(key).push(i);
				}
				pGrids.set(preferredLine, grid);
			}
			const grid = pGrids.get(preferredLine);

			const [lat, lon] = point;
			const cx = Math.floor(lat / GRID);
			const cy = Math.floor(lon / GRID);
			let bestIdx = -1;
			let bestDist = Infinity;
			for (let r = 0; r <= 10; r++) {
				for (let dx = -r; dx <= r; dx++) {
					for (let dy = -r; dy <= r; dy++) {
						if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
						const cell = grid.get(`${cx + dx},${cy + dy}`);
						if (!cell) continue;
						for (const idx of cell) {
							const d = haversineKm(g.coords[idx], point);
							if (d < bestDist) {
								bestDist = d;
								bestIdx = idx;
							}
						}
					}
				}
				if (bestIdx >= 0 && bestDist < SNAP_MAX_KM) break;
			}
			if (bestIdx >= 0 && bestDist < SNAP_MAX_KM) {
				return { index: bestIdx, distKm: bestDist };
			}
			return global;
		}

		return {
			snap,
			router,
			graph: g,
			nodeHasLine: (nodeIdx, lineNo) => {
				const hl = nLines.get(lineNo);
				return hl ? hl[nodeIdx] === 1 : false;
			},
		};
	}

	const graphAvail = buildGraphFromRoutes(
		routeFeatures.filter((f) => f.available),
	);
	const graphFull = buildGraphFromRoutes(routeFeatures);
	const helpersAvail = makeGraphHelpers(graphAvail);
	const helpersFull = makeGraphHelpers(graphFull);
	log(
		`  Graph avail: ${graphAvail.coords.length} nodes, full: ${graphFull.coords.length} nodes`,
	);

	const routeSegments = {};
	const segmentLines = {};
	const segmentUsedFullGraph = new Set();
	let computed = 0;
	let fallback = 0;
	let computedAvail = 0;
	let computedFull = 0;

	// Try to route a segment on a given graph (helpers). Returns encoded polyline
	// or null. Handles snapping, A* with line preference, fallbacks, and detour guard.
	function tryRoute(seg, helpers) {
		const { snap, router, graph } = helpers;
		const lines = seg.allLines || [seg.line, seg.toLine].filter(Boolean);

		const fromSnap = snap(seg.from, seg.line);
		const toSnap = snap(seg.to, seg.toLine);

		if (
			fromSnap.index < 0 ||
			toSnap.index < 0 ||
			fromSnap.distKm > SNAP_MAX_KM ||
			toSnap.distKm > SNAP_MAX_KM
		) {
			return null;
		}

		// If the from-stop originally had line 0 (we borrowed the to-line),
		// verify that the from-stop actually snapped to the preferred line.
		// If it snapped to a different line's tracks (e.g. Jęzor snaps to
		// LK171 instead of LK163), the from-stop is off the drivable network
		// and the segment should be skipped.
		if (seg.fromHadLine0) {
			const hasLine = helpers.nodeHasLine?.(fromSnap.index, seg.line);
			if (!hasLine) return null;
		}

		const straightKm = haversineKm(seg.from, seg.to);
		let pathIndices = null;

		// Helper: compute total path distance (from-station → path → to-station).
		function pathKmOf(indices) {
			let total = 0;
			let prev = seg.from;
			for (const idx of indices) {
				total += haversineKm(prev, graph.coords[idx]);
				prev = graph.coords[idx];
			}
			total += haversineKm(prev, seg.to);
			return total;
		}

		// Helper: reject paths with excessive detour. The threshold scales
		// with distance: short segments (where rail curves add proportionally
		// more distance) get a more lenient allowance via an absolute bonus.
		//   maxPathKm = straightKm * 2 + 5  (5km absolute bonus, 2× ratio)
		// So a 1.25km segment allows up to 7.5km, while a 85km segment
		// allows up to 175km. This accommodates real rail routes that zigzag
		// through junctions (e.g. Płyćwia→Bełchów via Skierniewice is 22.6km
		// for 12km straight).
		function acceptPath(indices) {
			if (!indices || indices.length < 2) return false;
			if (straightKm > 0) {
				const maxPathKm = straightKm * 2 + 5;
				if (pathKmOf(indices) > maxPathKm) return false;
			}
			return true;
		}

		// Helper: verify the path only uses lines listed in the timetable.
		// Edges with no line ref (snap/connector edges) are always allowed.
		// Non-timetable lines are allowed for short distances (junction
		// connectors, e.g. LK537 bridges LK535 and LK1 at Koluszki).
		// If the path uses a non-timetable line for more than 5km total,
		// the wiki doesn't have the correct tracks for this segment and the
		// route should be shown as grey instead.
		const timetableLines = new Set(lines);
		function usesOnlyTimetableLines(indices, allowedLines) {
			if (!indices) return false;
			const nonTtKm = new Map(); // lineNo → km on non-timetable lines
			for (let i = 0; i < indices.length - 1; i++) {
				for (
					let p = graph.start[indices[i]];
					p < graph.start[indices[i] + 1];
					p++
				) {
					if (graph.adjOther[p] !== indices[i + 1]) continue;
					const refs = graph.erefs[graph.adjEdge[p]];
					if (!refs || refs.length === 0) continue; // connector edge
					for (const r of refs) {
						if (!allowedLines.has(r)) {
							const edgeKm = graph.adjDist[p];
							nonTtKm.set(r, (nonTtKm.get(r) || 0) + edgeKm);
						}
					}
					break;
				}
			}
			// Reject if any non-timetable line is used for more than 5km.
			for (const km of nonTtKm.values()) {
				if (km > 5) return false;
			}
			return true;
		}

		// Try A* with from-stop's line, then to-stop's line.
		if (seg.line && wikiLineNumbers.has(seg.line)) {
			const p = router(fromSnap.index, toSnap.index, seg.line);
			if (acceptPath(p) && usesOnlyTimetableLines(p, timetableLines))
				pathIndices = p;
		}
		if (!pathIndices && seg.toLine && wikiLineNumbers.has(seg.toLine)) {
			const p = router(fromSnap.index, toSnap.index, seg.toLine);
			if (acceptPath(p) && usesOnlyTimetableLines(p, timetableLines))
				pathIndices = p;
		}
		// Try with all lines (for multi-line segments).
		if (!pathIndices && lines.length > 0) {
			const p = router(fromSnap.index, toSnap.index, lines);
			if (acceptPath(p) && usesOnlyTimetableLines(p, timetableLines))
				pathIndices = p;
		}

		// Fallback: unconstrained A* with detour guard.
		if (!pathIndices) {
			const p = router(fromSnap.index, toSnap.index, null);
			if (acceptPath(p) && usesOnlyTimetableLines(p, timetableLines))
				pathIndices = p;
		}

		if (!pathIndices || pathIndices.length < 2) return null;

		// Use the A* path as-is — snapped nodes are already on the track.
		const points = pathIndices.map((idx) => graph.coords[idx]);

		// Remove backtracking points (Z-shaped edges) throughout the path.
		let changed = true;
		while (changed && points.length > 2) {
			changed = false;
			for (let j = 1; j < points.length - 1; j++) {
				const a = points[j - 1],
					b = points[j],
					c = points[j + 1];
				const dot =
					(b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
				if (dot < 0) {
					points.splice(j, 1);
					changed = true;
					break;
				}
			}
		}

		return encodePolyline(points);
	}

	for (let i = 0; i < workSegments.length; i++) {
		const seg = workSegments[i];
		const lines = seg.allLines || [seg.line, seg.toLine].filter(Boolean);

		// Skip segments whose lines don't exist in wiki route data.
		const hasWikiLine = lines.some((l) => wikiLineNumbers.has(l));
		if (!hasWikiLine) {
			segmentLines[seg.key] = seg.line || seg.toLine || null;
			continue;
		}
		// If from-stop has no line number (line 0), use the to-stop's line.
		// The from-stop is often a terminus with line 0 because it has no
		// departure line. The to-stop's line is the actual running line.
		// However, if the from-stop is too far from the to-line's tracks,
		// it is off the drivable network (e.g. Jęzor is 4.5km from LK163)
		// and the segment is skipped to avoid routing via wrong tracks.
		if (!seg.line && seg.toLine) {
			seg.line = seg.toLine;
			seg.fromHadLine0 = true;
		}
		// Skip if neither from nor to line exists in wiki (both line 0).
		if (!seg.line) {
			segmentLines[seg.key] = null;
			continue;
		}
		// If the to-stop's line doesn't exist in wiki, clear it so it's not
		// used as a preferred line. The segment can still be routed using
		// the from-stop's line (e.g. LK64 exists but LK61 doesn't in wiki).
		if (seg.toLine && !wikiLineNumbers.has(seg.toLine)) {
			seg.toLine = null;
		}
		// Skip if to-stop originally had line 0 (no line number). A to-stop
		// with no line number means the train enters a non-drivable area
		// (e.g. beyond Maczki toward Jęzor).
		if (seg.toLineWas0) {
			segmentLines[seg.key] = seg.line;
			continue;
		}

		// Try available-only graph first (produces all-green paths).
		let encoded = tryRoute(seg, helpersAvail);
		let usedFull = false;

		// Fall back to full graph if no available path exists.
		if (!encoded) {
			encoded = tryRoute(seg, helpersFull);
			usedFull = true;
		}

		if (!encoded) {
			fallback++;
			segmentLines[seg.key] = seg.line;
			continue;
		}

		routeSegments[seg.key] = encoded;
		segmentLines[seg.key] = seg.line || seg.allLines?.[0] || null;
		if (usedFull) segmentUsedFullGraph.add(seg.key);
		computed++;
		if (usedFull) computedFull++;
		else computedAvail++;
	}
	log(
		`  Computed: ${computed} (avail: ${computedAvail}, full: ${computedFull}), Fallback: ${fallback}`,
	);

	// ========================================================================
	// Step 4: Compute per-segment availability from wiki track data
	// ========================================================================
	// Some lines have both drivable and non-drivable sections (e.g. LK1 has
	// a non-drivable gap between Myszków and Rozprza). We classify each
	// segment by sampling points along its path and voting: closer to
	// available tracks → green, closer to not-available tracks → red.

	log("Step 4: Compute per-segment availability");

	// Load available and not-available track geometries per line.
	const lineAvailableFeatures = {};
	const lineNotAvailableFeatures = {};
	for (const routeEntry of wikiMapData.routes) {
		const match = routeEntry.name.match(/^LK(\d+)$/);
		if (!match) continue;
		const lineNo = match[1];
		const isAvailable = routeEntry.available !== false;
		const cacheName = `wiki_route_${routeEntry.name.replace(/[^a-zA-Z0-9]/g, "_")}_${isAvailable ? "avail" : "notavail"}.json`;
		try {
			const gj = JSON.parse(
				fs.readFileSync(path.join(CACHE_DIR, cacheName), "utf8"),
			);
			const target = isAvailable
				? lineAvailableFeatures
				: lineNotAvailableFeatures;
			if (!target[lineNo]) target[lineNo] = [];
			for (const f of gj.features || []) {
				const g = f.geometry;
				if (!g) continue;
				let lines = [];
				if (g.type === "LineString") lines = [g.coordinates];
				else if (g.type === "MultiLineString") lines = g.coordinates;
				else continue;
				for (const line of lines) {
					if (line.length >= 2) {
						target[lineNo].push(line.map((c) => [c[1], c[0]]));
					}
				}
			}
		} catch {
			// skip
		}
	}
	log(
		`  Available lines: ${Object.keys(lineAvailableFeatures).length}, Not-available lines: ${Object.keys(lineNotAvailableFeatures).length}`,
	);

	// Distance from a point to a LineString (km), using equirectangular projection.
	function distToLineKm(point, line) {
		let min = Infinity;
		const cosLat = Math.cos((point[0] * Math.PI) / 180);
		const px = point[1] * cosLat * 111.32;
		const py = point[0] * 111.32;
		for (let i = 0; i < line.length - 1; i++) {
			const ax = line[i][1] * cosLat * 111.32;
			const ay = line[i][0] * 111.32;
			const bx = line[i + 1][1] * cosLat * 111.32;
			const by = line[i + 1][0] * 111.32;
			const dx = bx - ax;
			const dy = by - ay;
			const len2 = dx * dx + dy * dy;
			let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
			t = Math.max(0, Math.min(1, t));
			const fx = px - (ax + t * dx);
			const fy = py - (ay + t * dy);
			min = Math.min(min, Math.sqrt(fx * fx + fy * fy));
		}
		return min;
	}

	// Decode Google Encoded Polyline to [lat, lon] points.
	function decodePolyline(str) {
		let idx = 0;
		let lat = 0;
		let lon = 0;
		const pts = [];
		while (idx < str.length) {
			let shift = 0;
			let result = 0;
			let byte;
			do {
				byte = str.charCodeAt(idx++) - 63;
				result |= (byte & 0x1f) << shift;
				shift += 5;
			} while (byte >= 0x20);
			lat += result & 1 ? ~(result >> 1) : result >> 1;
			shift = 0;
			result = 0;
			do {
				byte = str.charCodeAt(idx++) - 63;
				result |= (byte & 0x1f) << shift;
				shift += 5;
			} while (byte >= 0x20);
			lon += result & 1 ? ~(result >> 1) : result >> 1;
			pts.push([lat / 1e5, lon / 1e5]);
		}
		return pts;
	}

	// Classify each segment: determine availability (green/red) at each point
	// along the path, and store color boundaries as [startIndex, colorCode]
	// pairs. colorCode: 0=green, 1=red, 2=grey (no wiki data).
	// The runtime decodes the full polyline from "segments" and splits it
	// at these boundaries, avoiding duplicate polyline data.
	//
	// For segments with no wiki track data, a single grey entry [0, 2] is stored.
	const segmentColors = {};
	let availCount = 0;
	let notAvailCount = 0;
	for (const [key, encoded] of Object.entries(routeSegments)) {
		// Segments routed on the available-only graph are entirely green.
		if (!segmentUsedFullGraph.has(key)) {
			segmentColors[key] = [[0, 0]];
			availCount++;
			continue;
		}

		const line = segmentLines[key];
		const availTracks = line ? lineAvailableFeatures[line] || [] : [];
		const notAvailTracks = line ? lineNotAvailableFeatures[line] || [] : [];

		// No wiki track data for this line — mark as grey.
		if (availTracks.length === 0 && notAvailTracks.length === 0) {
			segmentColors[key] = [[0, 2]];
			continue;
		}
		// No not-available tracks — entirely green.
		if (notAvailTracks.length === 0) {
			segmentColors[key] = [[0, 0]];
			availCount++;
			continue;
		}

		// Decode the polyline and classify each point.
		const pts = decodePolyline(encoded);
		const pointColors = pts.map((pt) => {
			let minAvail = Infinity;
			for (const track of availTracks) {
				const d = distToLineKm(pt, track);
				if (d < minAvail) minAvail = d;
				if (minAvail < 0.05) break;
			}
			let minNotAvail = Infinity;
			for (const track of notAvailTracks) {
				const d = distToLineKm(pt, track);
				if (d < minNotAvail) minNotAvail = d;
				if (minNotAvail < 0.05) break;
			}
			if (minAvail > 0.05 && minNotAvail < 0.2) return 1; // red
			return 0; // green
		});

		// Build boundary list: [startIndex, colorCode] at each color change.
		const boundaries = [[0, pointColors[0]]];
		for (let i = 1; i < pointColors.length; i++) {
			if (pointColors[i] !== pointColors[i - 1]) {
				boundaries.push([i, pointColors[i]]);
				if (pointColors[i - 1] === 0) availCount++;
				else notAvailCount++;
			}
		}
		// Count the last segment.
		if (pointColors[pointColors.length - 1] === 0) availCount++;
		else notAvailCount++;

		segmentColors[key] = boundaries;
	}
	log(
		`  Available sub-segments: ${availCount}, Not available: ${notAvailCount}`,
	);

	// ========================================================================
	// Step 5: Write output
	// ========================================================================
	log("Step 5: Write output");
	const output = {
		version: 1,
		knownStations: [...knownStations],
		stations: Object.fromEntries(stationCoords),
		segments: routeSegments,
		segmentColors,
	};
	const json = JSON.stringify(output);
	fs.writeFileSync(OUTPUT_PATH, json);
	log(`  Written ${OUTPUT_PATH} (${(json.length / 1024).toFixed(0)} KB)`);
	log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
	console.error("FATAL:", err);
	process.exit(1);
});
