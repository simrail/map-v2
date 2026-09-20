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
 *      - Station GeoJSON files: track/platform geometry at each station,
 *        used to extract a station's center point (arc-length midpoint of the
 *        longest track LineString, or the platform Polygon centroid).
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
 *   5. scripts/station-overrides.json — curated coordinates for stations with
 *      known-bad source geometry (applied last, wins over all other sources).
 *
 * Pipeline:
 *   Step 1:  Fetch wiki map-data.json + route GeoJSONs + station GeoJSONs +
 *            timetables (all in parallel). Cache all responses to disk.
 *            Station coordinates are extracted as geometry CENTERS (not the
 *            first coordinate, which sits at the station's edge).
 *   Step 1b: Supplement station coordinates from local files + stations-open API,
 *            then apply curated overrides.
 *   Step 2:  Collect unique segments from timetables. A segment is a pair of
 *            consecutive stops that both have coordinates, keyed by the SORTED
 *            pair of normalized station names (direction-agnostic: "a|b" and
 *            "b|a" are the same segment, computed once and reversed at lookup
 *            time). Stops without coordinates are skipped and the surrounding
 *            resolvable stops are connected directly. Each segment accumulates
 *            allLines — the union of line numbers used by every train on that
 *            pair, in both directions — used for A* line preference.
 *   Step 2.5: Canonical station nodes. Each station is snapped ONCE to the
 *            nearest graph node on any of its served lines (the lines of all
 *            segments touching it), within 3km. Every segment touching the
 *            station then routes to/from the same node, so consecutive
 *            segments chain exactly with no gaps or straight-line bridges.
 *            Stations that fail to snap (>3km from any track — e.g. wrong
 *            source coordinates, like Maków Podhalański) are dropped from the
 *            gazetteer and reported; the runtime treats them as unknown stops.
 *   Step 3:  Compute A* routes for each segment: canonical node → canonical
 *            node. Try the available-tracks graph first (guarantees an
 *            all-green path); fall back to the full graph for segments that
 *            traverse non-drivable tracks. A* prefers the segment's
 *            accumulated lines (non-preferred edges cost 10x more but remain
 *            traversable for junction connectors). Paths are validated: a
 *            detour guard (>2x straight-line + 5km = rejected) and a
 *            non-timetable-line usage guard (>5km on a foreign line = the wiki
 *            doesn't have the right tracks → leave the segment uncomputed so
 *            the runtime draws it grey).
 *   Step 4:  Determine per-segment drivability (green/red) by classifying each
 *            point along the path against the wiki's available and
 *            not-available track geometry of all the segment's lines. A point
 *            is red only if it's NOT on an available track (>50m away) AND
 *            close to a not-available track (<200m). This avoids false reds
 *            from parallel available/not-available tracks. Store results as
 *            color boundaries: [startIndex, colorCode] pairs.
 *            colorCode: 0=green, 1=red, 2=grey (no wiki data).
 *   Step 5:  Write the output JSON file. Also print a grey-risk report:
 *            uncomputed consecutive-stop pairs whose stations are >50km apart
 *            (these would draw very long grey straight lines at runtime and
 *            usually indicate data rot in the wiki).
 *
 * Usage: node packages/map/scripts/generate-rail-data.mjs [--refresh]
 *
 * --refresh: Forces re-fetching from the APIs (ignores cache).
 *            Without --refresh, all API responses are cached in scripts/.cache/
 *            and reused on subsequent runs for fast iteration (~1s vs ~5s).
 *
 * Output format (railData.json):
 *   {
 *     knownStations: string[],              // All stations that resolved AND snapped to the graph (in-game resolvable stations)
 *     stations: { [name]: [lat, lon] },    // Station gazetteer (normalized name → canonical on-track coordinate)
 *     segments: { [key]: string },          // Google Encoded Polylines (key = sorted pair "aNorm|bNorm", a < b)
 *     segmentColors: { [key]: number[][] } // Color boundaries: [[startIndex, colorCode], ...]
 *                                          // colorCode: 0=green (drivable), 1=red (non-drivable), 2=grey (no data)
 *   }
 *
 * The runtime (lib/trainRoute.ts) decodes each segment's polyline (reversing
 * it when the travel direction is opposite the sorted key) and splits it at
 * the color boundaries to render green/red/grey sub-segments on the map.
 * Consecutive segments share exact endpoints (canonical station nodes), so
 * adjacent sub-segments chain seamlessly.
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

/**
 * Extracts a station's representative center coordinate from its wiki GeoJSON.
 *
 * The wiki draws stations in two ways, and the first coordinate of the first
 * feature sits at the station's EDGE (throat), which made routes visually end
 * where a station begins. Instead, return the station's middle:
 *   - OPEN LineStrings (through tracks): the arc-length midpoint of the
 *     longest one (the through-track's middle, interpolated).
 *   - CLOSED LineStrings only (drawn station-area outlines, ~66 stations):
 *     the vertex-average centroid of the largest loop. The arc midpoint of a
 *     loop is an arbitrary point on the outline. Loop-only outlines are
 *     area drawings rather than tracks, so they are marked loopOnly — the
 *     caller prefers the precise game-source coordinate (Step 1b) and only
 *     falls back to the centroid.
 *   - Else Polygon rings: the vertex-average centroid of the largest ring.
 *   - Else a Point: as-is.
 *
 * @param {object} gj - Station GeoJSON (FeatureCollection)
 * @returns {{anchor: [number, number]|null, loopOnly: boolean}}
 */
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
			len += haversineKm(
				[ls[i - 1][1], ls[i - 1][0]],
				[ls[i][1], ls[i][0]],
			);
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
		// Split into open through-tracks and closed outline loops.
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
		// Prefer open through-tracks: arc-length midpoint of the longest.
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
		// Only loops: centroid of the largest outline, flagged as loopOnly.
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
		return only ? { anchor: [only[0][1], only[0][0]], loopOnly: false } : { anchor: null, loopOnly: false };
	}
	if (rings.length > 0) {
		// Largest ring by bounding-box diagonal; centroid = vertex average.
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
		// Each station has a URL to a GeoJSON file. We extract a CENTER
		// coordinate (midpoint of the longest track / platform centroid), NOT
		// the first vertex — the first vertex sits at the station's edge.
		// Stations drawn ONLY as closed outline loops are deferred: the game
		// sources (Step 1b) provide precise in-game coordinates, and only
		// stations with no game source fall back to the loop centroid.
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
			} catch {
				// skip
			}
		});
		log(
			`  [wiki] Stations with coords: ${stationCoords.size} (+${wikiLoopCentroids.size} loop-only, deferred)`,
		);

		return { wikiMapData, stationCoords, knownStations, routeFeatures, wikiLoopCentroids };
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
			} catch {
				// skip
			}
		});
		if (all.length === 0) {
			throw new Error("No timetables returned by either data source");
		}
		fs.writeFileSync(cachePath, JSON.stringify(all));
		log(`  [timetables] Community EDR: ${all.length} timetables`);
	})();

	const { wikiMapData, stationCoords, knownStations, routeFeatures, wikiLoopCentroids } =
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

	// Curated station coordinate overrides (scripts/station-overrides.json).
	// Applied last so they win over every other source. Used for stations with
	// known-bad source geometry (e.g. Maków Podhalański's wiki geometry is
	// misplaced ~211km north near Skierniewice).
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

	// Last-resort fallback: wiki stations drawn only as outline loops that
	// have no game-source coordinate use the loop centroid.
	let loopFallbackCount = 0;
	for (const [norm, coord] of wikiLoopCentroids) {
		if (!stationCoords.has(norm)) {
			stationCoords.set(norm, coord);
			knownStations.add(norm);
			loopFallbackCount++;
		}
	}
	if (loopFallbackCount > 0) {
		log(
			`  Loop-centroid fallbacks (no game coordinate): ${loopFallbackCount}`,
		);
	}

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

	// Segments are keyed by the SORTED pair of normalized names (a|b, a<b)
	// so both travel directions of the same hop share one entry and one
	// A* computation — out-and-back trains draw identical geometry.
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
				const key =
					fromResolved < resolved
						? `${fromResolved}|${resolved}`
						: `${resolved}|${fromResolved}`;
				const line = Number(entries[lastResolved].line) || 0;
				const toLine = Number(entries[i].line) || 0;
				// Collect ALL line numbers between the from and to stops
				// (including skipped intermediate stops). This ensures the
				// A* prefers the correct connecting lines even when intermediate
				// stops without coordinates are skipped. Lines accumulate across
				// ALL trains and BOTH directions of this pair (union), which
				// makes corridor choice direction-consistent.
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
	// Step 2.5: Canonical station nodes
	// ========================================================================
	// Each station participating in at least one segment is snapped ONCE to a
	// single graph node: the nearest node on any of its served lines (union of
	// the lines of all segments touching it, both directions), preferring
	// available (drivable) tracks, falling back to any track. Every segment
	// touching the station then routes to/from that same node, so consecutive
	// segments chain exactly — no straight-line bridges, and the route passes
	// through the station's middle rather than stopping at its edge.
	// Stations that cannot be snapped at all (>3km from any track — wrong
	// source coordinates) are dropped from the gazetteer and reported; the
	// runtime treats them like any other stop without coordinates.

	// Served lines per station (only lines that exist as wiki routes).
	const servedLines = new Map(); // normalized name → Set<lineNo>
	for (const seg of segments.values()) {
		const [a, b] = seg.key.split("|");
		if (!servedLines.has(a)) servedLines.set(a, new Set());
		if (!servedLines.has(b)) servedLines.set(b, new Set());
		for (const l of seg.allLines) {
			if (wikiLineNumbers.has(l)) {
				servedLines.get(a).add(l);
				servedLines.get(b).add(l);
			}
		}
	}

	const graphAvail = buildGraphFromRoutes(
		routeFeatures.filter((f) => f.available),
	);
	const graphFull = buildGraphFromRoutes(routeFeatures);
	const nearestAvail = makeNearestNode(graphAvail, 0.02, SNAP_MAX_KM);
	const nearestFull = makeNearestNode(graphFull, 0.02, SNAP_MAX_KM);
	const routerAvail = makeRouter(graphAvail);
	const routerFull = makeRouter(graphFull);
	log(
		`  Graph avail: ${graphAvail.coords.length} nodes, full: ${graphFull.coords.length} nodes`,
	);

	// Resolve an exact [lat, lon] (a canonical node coordinate) to its node
	// index in the given graph, via the coordinate-dedup key.
	const coordKey = (lat, lon) => `${lat.toFixed(6)},${lon.toFixed(6)}`;
	const nodeIndexFor = (graph, coord) =>
		graph.coordIndex.get(coordKey(coord[0], coord[1])) ?? -1;

	log(
		`  Snapping ${servedLines.size} stations to canonical nodes...`,
	);
	const canonicalNodes = new Map(); // normalized name → [lat, lon]
	const droppedStations = [];
	for (const [name, lines] of servedLines) {
		const anchor = stationCoords.get(name);
		if (!anchor) continue; // no coordinate at all — segment prep will skip
		let snap = null;
		let snapGraph = null;
		// 1. Nearest node on a served line, on available tracks (drivable).
		if (lines.size > 0) {
			snap = nearestAvail(anchor, lines);
			snapGraph = graphAvail;
			// 2. Nearest node on a served line, on any track (non-drivable
			//    stations, e.g. Jęzor which sits on non-available LK171).
			if (snap.index < 0 || snap.distKm > SNAP_MAX_KM) {
				snap = nearestFull(anchor, lines);
				snapGraph = graphFull;
			}
		}
		// 3. Unrestricted: nearest node on any track.
		if (snap === null || snap.index < 0 || snap.distKm > SNAP_MAX_KM) {
			snap = nearestFull(anchor, null);
			snapGraph = graphFull;
		}
		if (snap.index >= 0 && snap.distKm <= SNAP_MAX_KM) {
			// Coordinate MUST come from the graph the snap index belongs to —
			// graphAvail and graphFull have independent node numbering.
			const nodeCoord = snapGraph.coords[snap.index];
			canonicalNodes.set(name, nodeCoord);
			// Update the gazetteer to the validated on-track coordinate.
			stationCoords.set(name, nodeCoord);
		} else {
			droppedStations.push(name);
			stationCoords.delete(name);
			knownStations.delete(name);
		}
	}
	if (droppedStations.length > 0) {
		log(
			`  Dropped stations (no track within ${SNAP_MAX_KM}km — likely bad source coordinates):`,
		);
		for (const name of droppedStations) log(`    - ${name}`);
	}
	log(
		`  Canonical nodes: ${canonicalNodes.size}, dropped: ${droppedStations.length}`,
	);

	// Rebuild work segments after pruning dropped stations.
	const workSegmentsPruned = [];
	for (const seg of workSegments) {
		const [a, b] = seg.key.split("|");
		if (canonicalNodes.has(a) && canonicalNodes.has(b)) {
			workSegmentsPruned.push(seg);
		}
	}
	log(
		`  Work segments after prune: ${workSegmentsPruned.length} (was ${workSegments.length})`,
	);
	const workList = workSegmentsPruned;

	// ========================================================================
	// Step 3: Compute A* routes (canonical node → canonical node)
	// ========================================================================
	// Try the available-tracks graph first (guarantees an all-green path);
	// fall back to the full graph for segments that traverse non-drivable
	// tracks. A* prefers the segment's accumulated lines; paths are validated
	// by a detour guard and a non-timetable-line usage guard.

	log("Step 3: Compute A* routes");

	const routeSegments = {};
	const segmentLines = {}; // key → lines actually traversed by the path
	const segmentUsedFullGraph = new Set();
	let computed = 0;
	let fallback = 0;
	let computedAvail = 0;
	let computedFull = 0;

	// Try to route a segment on the given graph. Endpoints are the canonical
	// station nodes (resolved by exact coordinate). Returns an encoded
	// polyline or null.
	function tryRoute(seg, graph, router) {
		const [aName, bName] = seg.key.split("|");
		const fromIdx = nodeIndexFor(graph, canonicalNodes.get(aName));
		const toIdx = nodeIndexFor(graph, canonicalNodes.get(bName));
		if (fromIdx < 0 || toIdx < 0) return null;

		const lines = seg.allLines;
		const fromCoord = graph.coords[fromIdx];
		const toCoord = graph.coords[toIdx];
		const straightKm = haversineKm(fromCoord, toCoord);
		let pathIndices = null;

		// Helper: compute total path distance (canonical nodes are on the
		// track, so the path length IS the full segment length).
		function pathKmOf(indices) {
			let total = 0;
			let prev = fromCoord;
			for (const idx of indices) {
				total += haversineKm(prev, graph.coords[idx]);
				prev = graph.coords[idx];
			}
			total += haversineKm(prev, toCoord);
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
			// No line hints in the timetable (freight runs often have line 0
			// everywhere) — there is nothing to validate against; rely on the
			// detour guard alone.
			if (allowedLines.size === 0) return true;
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

		// Try A* with the segment's union of timetable lines (non-preferred
		// edges cost 10x more but remain traversable for junction connectors).
		if (lines.length > 0) {
			const p = router(fromIdx, toIdx, lines);
			if (acceptPath(p) && usesOnlyTimetableLines(p, timetableLines))
				pathIndices = p;
		}

		// Fallback: unconstrained A* with the same guards.
		if (!pathIndices) {
			const p = router(fromIdx, toIdx, null);
			if (acceptPath(p) && usesOnlyTimetableLines(p, timetableLines))
				pathIndices = p;
		}

		if (!pathIndices || pathIndices.length < 2) return null;

		// Collect the lines actually traversed by the accepted path.
		const usedLineSet = new Set();
		for (let i = 0; i < pathIndices.length - 1; i++) {
			for (
				let p = graph.start[pathIndices[i]];
				p < graph.start[pathIndices[i] + 1];
				p++
			) {
				if (graph.adjOther[p] !== pathIndices[i + 1]) continue;
				const refs = graph.erefs[graph.adjEdge[p]];
				if (refs) for (const r of refs) usedLineSet.add(r);
				break;
			}
		}

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

		// Drop consecutive points that collapse to the same encoded coordinate
		// (polyline precision is 1e-5 ≈ 1.1m; distinct graph nodes can be
		// closer than that and would decode to zero-length edges).
		const deduped = [];
		let lastRlat = null;
		let lastRlon = null;
		for (const p of points) {
			const rlat = Math.round(p[0] * 1e5);
			const rlon = Math.round(p[1] * 1e5);
			if (rlat !== lastRlat || rlon !== lastRlon) {
				deduped.push(p);
				lastRlat = rlat;
				lastRlon = rlon;
			}
		}

		return {
			encoded: encodePolyline(deduped),
			// Lines actually traversed by the path (used for availability
			// classification in Step 4 — more accurate than timetable hints,
			// and the only source for hint-less freight segments).
			usedLines: [...usedLineSet],
		};
	}

	for (let i = 0; i < workList.length; i++) {
		const seg = workList[i];

		// Skip segments whose lines don't exist in wiki route data. Segments
		// with NO line hints at all (freight runs with line 0 everywhere)
		// still get a chance: the detour guard decides.
		const hasHints = seg.allLines.length > 0;
		const hasWikiLine = seg.allLines.some((l) => wikiLineNumbers.has(l));
		if (hasHints && !hasWikiLine) continue;

		// Try available-only graph first (produces all-green paths).
		let result = tryRoute(seg, graphAvail, routerAvail);
		let usedFull = false;

		// Fall back to full graph if no available path exists.
		if (!result) {
			result = tryRoute(seg, graphFull, routerFull);
			usedFull = true;
		}

		if (!result) {
			fallback++;
			continue;
		}

		routeSegments[seg.key] = result.encoded;
		segmentLines[seg.key] = result.usedLines;
		if (usedFull) segmentUsedFullGraph.add(seg.key);
		computed++;
		if (usedFull) computedFull++;
		else computedAvail++;
	}
	log(
		`  Computed: ${computed} (avail: ${computedAvail}, full: ${computedFull}), Fallback (grey): ${fallback}`,
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

		// Classify against the wiki track geometry of the lines the path
		// actually traversed (segmentLines — more accurate than timetable
		// hints, and the only source for hint-less freight segments). A hop
		// may legitimately traverse several lines.
		const lines =
			segmentLines[key] ||
			(segments.get(key)?.allLines.filter((l) => wikiLineNumbers.has(l)) ??
				[]);
		const availTracks = lines.flatMap((l) => lineAvailableFeatures[l] || []);
		const notAvailTracks = lines.flatMap(
			(l) => lineNotAvailableFeatures[l] || [],
		);

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
	// Step 5: Write output + grey-risk report
	// ========================================================================
	log("Step 5: Write output");

	// Grey-risk report: uncomputed consecutive-stop pairs whose stations are
	// far apart (>50km). At runtime these draw very long grey straight lines
	// and usually indicate data rot in the wiki (missing/wrong tracks), not
	// genuinely missing routes — worth investigating before shipping.
	const GREY_RISK_KM = 50;
	const greyRisk = [];
	for (const seg of workList) {
		if (routeSegments[seg.key]) continue;
		const [a, b] = seg.key.split("|");
		const ca = stationCoords.get(a);
		const cb = stationCoords.get(b);
		if (ca && cb && haversineKm(ca, cb) > GREY_RISK_KM) {
			greyRisk.push(seg.label);
		}
	}
	if (greyRisk.length > 0) {
		log(`  GREY RISK — ${greyRisk.length} uncomputed pairs > ${GREY_RISK_KM}km apart:`);
		for (const label of greyRisk) log(`    - ${label}`);
	} else {
		log(`  Grey-risk report: none > ${GREY_RISK_KM}km`);
	}

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
