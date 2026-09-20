#!/usr/bin/env node

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
		return only ? { anchor: [only[0][1], only[0][0]], loopOnly: false } : { anchor: null, loopOnly: false };
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
		const routeFeatures = [];
		await pool(wikiMapData.routes, 10, async (route) => {
			const match = route.name.match(/^LK(\d+)$/);
			if (!match) return;
			const lineNo = match[1];
			const isAvailable = route.available !== false;
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
		}
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
		log(
			`  Loop-centroid fallbacks (no game coordinate): ${loopFallbackCount}`,
		);
	}

	log("Step 2: Collect segments from timetables");
	const allTimetables = JSON.parse(
		fs.readFileSync(path.join(CACHE_DIR, "all_timetables.json"), "utf8"),
	);

	const wikiStationList = wikiMapData.stations;

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
				const key =
					fromResolved < resolved
						? `${fromResolved}|${resolved}`
						: `${resolved}|${fromResolved}`;
				const line = Number(entries[lastResolved].line) || 0;
				const toLine = Number(entries[i].line) || 0;
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

	const wikiLineNumbers = new Set();
	for (const r of wikiMapData.routes) {
		const match = r.name.match(/^LK(\d+)$/);
		if (match) wikiLineNumbers.add(match[1]);
	}

	const servedLines = new Map();
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

	const coordKey = (lat, lon) => `${lat.toFixed(6)},${lon.toFixed(6)}`;
	const nodeIndexFor = (graph, coord) =>
		graph.coordIndex.get(coordKey(coord[0], coord[1])) ?? -1;

	log(
		`  Snapping ${servedLines.size} stations to canonical nodes...`,
	);
	const canonicalNodes = new Map();
	const droppedStations = [];
	for (const [name, lines] of servedLines) {
		const anchor = stationCoords.get(name);
		if (!anchor) continue;
		let snap = null;
		let snapGraph = null;
		if (lines.size > 0) {
			snap = nearestAvail(anchor, lines);
			snapGraph = graphAvail;
			if (snap.index < 0 || snap.distKm > SNAP_MAX_KM) {
				snap = nearestFull(anchor, lines);
				snapGraph = graphFull;
			}
		}
		if (snap === null || snap.index < 0 || snap.distKm > SNAP_MAX_KM) {
			snap = nearestFull(anchor, null);
			snapGraph = graphFull;
		}
		if (snap.index >= 0 && snap.distKm <= SNAP_MAX_KM) {
			const nodeCoord = snapGraph.coords[snap.index];
			canonicalNodes.set(name, nodeCoord);
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

	log("Step 3: Compute A* routes");

	const routeSegments = {};
	const segmentLines = {};
	const segmentUsedFullGraph = new Set();
	let computed = 0;
	let fallback = 0;
	let computedAvail = 0;
	let computedFull = 0;

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

		function acceptPath(indices) {
			if (!indices || indices.length < 2) return false;
			if (straightKm > 0) {
				const maxPathKm = straightKm * 2 + 5;
				if (pathKmOf(indices) > maxPathKm) return false;
			}
			return true;
		}

		const timetableLines = new Set(lines);
		function usesOnlyTimetableLines(indices, allowedLines) {
			if (!indices) return false;
			if (allowedLines.size === 0) return true;
			const nonTtKm = new Map();
			for (let i = 0; i < indices.length - 1; i++) {
				for (
					let p = graph.start[indices[i]];
					p < graph.start[indices[i] + 1];
					p++
				) {
					if (graph.adjOther[p] !== indices[i + 1]) continue;
					const refs = graph.erefs[graph.adjEdge[p]];
					if (!refs || refs.length === 0) continue;
					for (const r of refs) {
						if (!allowedLines.has(r)) {
							const edgeKm = graph.adjDist[p];
							nonTtKm.set(r, (nonTtKm.get(r) || 0) + edgeKm);
						}
					}
					break;
				}
			}
			for (const km of nonTtKm.values()) {
				if (km > 5) return false;
			}
			return true;
		}

		if (lines.length > 0) {
			const p = router(fromIdx, toIdx, lines);
			if (acceptPath(p) && usesOnlyTimetableLines(p, timetableLines))
				pathIndices = p;
		}

		if (!pathIndices) {
			const p = router(fromIdx, toIdx, null);
			if (acceptPath(p) && usesOnlyTimetableLines(p, timetableLines))
				pathIndices = p;
		}

		if (!pathIndices || pathIndices.length < 2) return null;

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

		const points = pathIndices.map((idx) => graph.coords[idx]);

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
			usedLines: [...usedLineSet],
		};
	}

	for (let i = 0; i < workList.length; i++) {
		const seg = workList[i];

		const hasHints = seg.allLines.length > 0;
		const hasWikiLine = seg.allLines.some((l) => wikiLineNumbers.has(l));
		if (hasHints && !hasWikiLine) continue;

		let result = tryRoute(seg, graphAvail, routerAvail);
		let usedFull = false;

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

	log("Step 4: Compute per-segment availability");

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
		}
	}
	log(
		`  Available lines: ${Object.keys(lineAvailableFeatures).length}, Not-available lines: ${Object.keys(lineNotAvailableFeatures).length}`,
	);

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

	const segmentColors = {};
	let availCount = 0;
	let notAvailCount = 0;
	for (const [key, encoded] of Object.entries(routeSegments)) {
		if (!segmentUsedFullGraph.has(key)) {
			segmentColors[key] = [[0, 0]];
			availCount++;
			continue;
		}

		const lines =
			segmentLines[key] ||
			(segments.get(key)?.allLines.filter((l) => wikiLineNumbers.has(l)) ??
				[]);
		const availTracks = lines.flatMap((l) => lineAvailableFeatures[l] || []);
		const notAvailTracks = lines.flatMap(
			(l) => lineNotAvailableFeatures[l] || [],
		);

		if (availTracks.length === 0 && notAvailTracks.length === 0) {
			segmentColors[key] = [[0, 2]];
			continue;
		}
		if (notAvailTracks.length === 0) {
			segmentColors[key] = [[0, 0]];
			availCount++;
			continue;
		}

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
			if (minAvail > 0.05 && minNotAvail < 0.2) return 1;
			return 0;
		});

		const boundaries = [[0, pointColors[0]]];
		for (let i = 1; i < pointColors.length; i++) {
			if (pointColors[i] !== pointColors[i - 1]) {
				boundaries.push([i, pointColors[i]]);
				if (pointColors[i - 1] === 0) availCount++;
				else notAvailCount++;
			}
		}
		if (pointColors[pointColors.length - 1] === 0) availCount++;
		else notAvailCount++;

		segmentColors[key] = boundaries;
	}
	log(
		`  Available sub-segments: ${availCount}, Not available: ${notAvailCount}`,
	);

	log("Step 5: Write output");

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
