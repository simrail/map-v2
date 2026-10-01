#!/usr/bin/env node

/**
 * generate-stations.mjs — Generates the station marker JSON databases from the
 * SimRail wiki (source of truth — it gets constantly updated).
 *
 * Outputs:
 *   - components/stations.json          → "Unplayable dispatch stations" layer
 *   - components/stationsPassenger.json → "Passenger stations" layer
 *   - components/stationsRemote.json    → "Remote dispatch stations" layer
 *
 * Data flow:
 *   1. Fetch the wiki map station list (map-data.json: entries with
 *      type "po" | "border" | playable:false) — these are the unplayable
 *      stations drawn as shapes on the wiki map.
 *   2. Fetch the wiki playable station list (stations/poland/stations.json)
 *      — dispatch stations. Stations listed in a parent's `map.controlled`
 *      array are remote dispatch stations (e.g. Żychlin is controlled by
 *      LCS Jackowice).
 *   3. For each station shape, fetch its GeoJSON and compute the area
 *      centroid (same method as the wiki map: turf.centroid → for polygons
 *      an area-weighted centroid, for lines the vertex average).
 *   4. stationsRemote.json: entries from `controlled` arrays, keyed with
 *      id = parent station name (the controller shown in the popup).
 *   5. All wiki map stations that are NOT playable anywhere: not a
 *      dispatch station in the playable list, not a controlled (remote)
 *      station, and not present in the stations-open API (dispatch
 *      stations reported by live game servers). Passenger stops (wiki
 *      type "po", przystanek osobowy) go to stationsPassenger.json, the
 *      rest (border and other dispatch stations) to stations.json.
 *
 * Usage:
 *   node scripts/generate-stations.mjs [--refresh] [--dry]
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, ".cache");
const STATIONS_OUT = path.join(__dirname, "..", "components", "stations.json");
const PASSENGER_OUT = path.join(
	__dirname,
	"..",
	"components",
	"stationsPassenger.json",
);
const REMOTE_OUT = path.join(
	__dirname,
	"..",
	"components",
	"stationsRemote.json",
);

const WIKI_MAP_DATA_URL =
	"https://wiki.simrail.eu/map/main-files/map-data.json";
const WIKI_STATIONS_URL =
	"https://wiki.simrail.eu/stations/poland/stations.json";
const WIKI_BASE = "https://wiki.simrail.eu";
const PANEL_BASE = "https://panel.simrail.eu:8084";
const USER_AGENT = "simrail-app-map-station-generator/1.0";

fs.mkdirSync(CACHE_DIR, { recursive: true });
const refresh = process.argv.includes("--refresh");
const dry = process.argv.includes("--dry");

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

function normalizeName(name) {
	return name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Computes the centroid of a station's GeoJSON shape, mirroring how the
 * wiki map places its station labels (turf.centroid):
 *   - Polygons: area-weighted centroid (polygon centroid formula).
 *   - LineStrings / MultiLineStrings: vertex average (turf centroid of a
 *     line is the vertex centroid).
 */
function stationCentroid(gj) {
	let sumArea = 0;
	let cx = 0;
	let cy = 0; // signed area × centroid, accumulated per ring
	let lineLat = 0;
	let lineLon = 0;
	let lineN = 0;

	const ringCentroid = (ring) => {
		// ring: [[lon, lat], ...] (closed or open)
		// Returns [S, Σ(x0+x1)·cross, Σ(y0+y1)·cross] where S = Σ(x0·y1−x1·y0).
		// Polygon centroid: Cx = Σ(x0+x1)·cross / (3S), Cy = Σ(y0+y1)·cross / (3S).
		let a = 0;
		let x = 0;
		let y = 0;
		for (let i = 0; i < ring.length - 1; i++) {
			const [x0, y0] = ring[i];
			const [x1, y1] = ring[i + 1];
			const cross = x0 * y1 - x1 * y0;
			a += cross;
			x += (x0 + x1) * cross;
			y += (y0 + y1) * cross;
		}
		return [a, x, y];
	};

	const addPolygon = (rings) => {
		for (let r = 0; r < rings.length; r++) {
			const [a, x, y] = ringCentroid(rings[r]);
			// Holes wind opposite to the outer ring, so the signed sums already
			// have opposite signs; normalise each ring's winding first, then
			// add the outer ring and subtract the holes.
			const sign = Math.sign(a) * (r === 0 ? 1 : -1);
			sumArea += sign * a;
			cx += sign * x;
			cy += sign * y;
		}
	};

	for (const f of gj.features || []) {
		const g = f.geometry;
		if (!g) continue;
		if (g.type === "Polygon") {
			addPolygon(g.coordinates);
		} else if (g.type === "MultiPolygon") {
			for (const poly of g.coordinates) addPolygon(poly);
		} else if (g.type === "LineString") {
			for (const c of g.coordinates) {
				lineLat += c[1];
				lineLon += c[0];
				lineN++;
			}
		} else if (g.type === "MultiLineString") {
			for (const ls of g.coordinates) {
				for (const c of ls) {
					lineLat += c[1];
					lineLon += c[0];
					lineN++;
				}
			}
		} else if (g.type === "Point") {
			lineLat += g.coordinates[1];
			lineLon += g.coordinates[0];
			lineN++;
		}
	}

	if (sumArea !== 0) {
		// Polygon centroid (area-weighted, holes subtracted):
		//   [lat, lon] = [Σ(y0+y1)·cross, Σ(x0+x1)·cross] / (3 · ΣS)
		return [cy / (3 * sumArea), cx / (3 * sumArea)];
	}
	if (lineN > 0) {
		return [lineLat / lineN, lineLon / lineN];
	}
	return null;
}

const makeEntry = (name, coord, extra = {}) => ({
	Name: name,
	Prefix: "",
	DifficultyLevel: 0,
	MainImageURL: "",
	AdditionalImage1URL: "",
	AdditionalImage2URL: "",
	DispatchedBy: [],
	Latititude: coord[0],
	Longitude: coord[1],
	id: "",
	...extra,
});

async function main() {
	// 1. Wiki data (source of truth)
	const mapData = await cachedFetchJson(
		WIKI_MAP_DATA_URL,
		"wiki_map_data.json",
	);
	const playableStations = await cachedFetchJson(
		WIKI_STATIONS_URL,
		"wiki_playable_stations.json",
	);
	console.log(
		`Wiki: ${mapData.stations.length} map stations, ${playableStations.length} playable stations`,
	);

	// 2. Live dispatch stations from the panel API (all active servers)
	const serversResp = await cachedFetchJson(
		`${PANEL_BASE}/servers-open`,
		"servers.json",
	);
	// Requests that failed. The catalogs are only written from complete data:
	// a missing shape would drop a station, and a missing server could mark
	// a dispatchable station as unplayable.
	const failures = [];
	const liveStations = new Set(); // normalized names currently dispatchable somewhere
	for (const server of serversResp.data.filter((s) => s.IsActive)) {
		try {
			const resp = await cachedFetchJson(
				`${PANEL_BASE}/stations-open?serverCode=${server.ServerCode}`,
				`stations_${server.ServerCode}.json`,
			);
			for (const s of resp.data || []) {
				if (s.Name) liveStations.add(normalizeName(s.Name));
			}
		} catch (err) {
			failures.push(`server ${server.ServerCode}: ${err.message}`);
		}
	}
	console.log(`Live dispatch stations across servers: ${liveStations.size}`);

	// 3. Playable + remote sets from the wiki
	const playable = new Map(); // norm name → playable station (dispatch)
	const remote = new Map(); // norm name → { name, controller } (remote dispatch)
	for (const s of playableStations) {
		playable.set(normalizeName(s.name), s);
		if (s.map?.controlled) {
			for (const c of s.map.controlled) {
				remote.set(normalizeName(c.name), { name: c.name, controller: s.name });
			}
		}
	}

	// 4. Fetch shapes + centroids for all wiki map stations AND all
	//    controlled (remote) station shapes — the controlled entries have
	//    their own geojson URLs, separate from map-data.json.
	const centroids = new Map(); // norm name → [lat, lon]
	const shapeUrls = new Map(); // norm name → geojson URL
	for (const station of mapData.stations) {
		shapeUrls.set(normalizeName(station.name), station.url);
	}
	for (const s of playableStations) {
		if (s.map?.controlled) {
			for (const c of s.map.controlled) {
				shapeUrls.set(normalizeName(c.name), c.url);
			}
		}
	}
	await pool([...shapeUrls.entries()], 10, async ([norm, url]) => {
		const cacheName = `wiki_station_${norm.replace(/[^a-zA-Z0-9]/g, "_")}.json`;
		try {
			const gj = await cachedFetchJson(WIKI_BASE + url, cacheName);
			const c = stationCentroid(gj);
			if (c) centroids.set(norm, c);
		} catch (err) {
			failures.push(`shape ${url}: ${err.message}`);
		}
	});
	console.log(`Station centroids computed: ${centroids.size}`);

	// 5. Build stationsRemote.json
	const remoteOut = [];
	for (const [norm, info] of remote) {
		const coord = info.coord || centroids.get(norm);
		if (!coord) {
			console.log(`  ! remote station without shape: ${info.name}`);
			continue;
		}
		remoteOut.push(makeEntry(info.name, coord, { id: info.controller }));
	}
	remoteOut.sort((a, b) => a.Name.localeCompare(b.Name, "pl"));

	// 6. Build stations.json (unplayable) and stationsPassenger.json
	//    A station is unplayable if it is on the wiki map but NOT:
	//    a playable dispatch station, a remote (controlled) station, or a
	//    live dispatch station from the API. Passenger stops ("po") are
	//    listed separately.
	const unplayableOut = [];
	const passengerOut = [];
	for (const station of mapData.stations) {
		const norm = normalizeName(station.name);
		if (playable.has(norm)) continue;
		if (remote.has(norm)) continue;
		if (liveStations.has(norm)) continue; // became playable (API)
		const coord = centroids.get(norm);
		if (!coord) continue;
		const out = station.type === "po" ? passengerOut : unplayableOut;
		out.push(makeEntry(station.name, coord));
	}
	unplayableOut.sort((a, b) => a.Name.localeCompare(b.Name, "pl"));
	passengerOut.sort((a, b) => a.Name.localeCompare(b.Name, "pl"));

	console.log(`\nRemote stations: ${remoteOut.length}`);
	console.log(`Unplayable dispatch stations: ${unplayableOut.length}`);
	console.log(`Passenger stations: ${passengerOut.length}`);

	if (failures.length > 0) {
		console.error(
			`\n${failures.length} request(s) failed — not writing the catalogs:`,
		);
		for (const f of failures) console.error(`  - ${f}`);
		process.exitCode = 1;
		return;
	}
	if (dry) {
		console.log("(dry run — no files written)");
		return;
	}
	fs.writeFileSync(REMOTE_OUT, JSON.stringify(remoteOut, null, "\t") + "\n");
	fs.writeFileSync(
		STATIONS_OUT,
		JSON.stringify(unplayableOut, null, "\t") + "\n",
	);
	fs.writeFileSync(
		PASSENGER_OUT,
		JSON.stringify(passengerOut, null, "\t") + "\n",
	);
	console.log(
		`Written:\n  ${REMOTE_OUT}\n  ${STATIONS_OUT}\n  ${PASSENGER_OUT}`,
	);
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

main().catch((err) => {
	console.error("FATAL:", err);
	process.exit(1);
});
