#!/usr/bin/env node

/**
 * check-routes.mjs — Sanity-checks components/railData.json by drawing the
 * route of every cached timetable with the app's own code
 * (lib/trainRoute.ts) and measuring the result against the track network.
 *
 * Run automatically at the end of generate-rail-data.mjs, or on its own:
 *   pnpm check:routes
 * It reads the generator's cache (scripts/.cache), so generate first.
 *
 * Checks (any failure → exit code 1):
 *   - Off-track jumps: a straight stretch longer than 100m of a green/red
 *     route that leaves the tracks (>50m from any track). The symptom of a
 *     route hopping between lines or across a bridge.
 *   - Hairpins: the route turns back on itself (>150°) with both arms longer
 *     than 30m. The symptom of legs overshooting a station and coming back.
 * Reported only:
 *   - Grey lines: legs drawn as straight lines because there's no track
 *     data for them (e.g. lines missing from the wiki).
 *
 * The route code runs in Node (which strips the TypeScript types itself);
 * the only changes are the railData.json import, which reads the file from
 * disk instead, and `fetch`, which serves the cached timetables.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
	buildRailGraph,
	haversineKm,
	nearestNode,
	parseWikiRoute,
	waysFromRouteGeoJson,
} from "./rail-helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, ".cache");
const RAIL_DATA_PATH = path.join(
	__dirname,
	"..",
	"components",
	"railData.json",
);
const TRAIN_ROUTE_PATH = path.join(__dirname, "..", "lib", "trainRoute.ts");

const JUMP_MIN_KM = 0.1;
const OFF_TRACK_KM = 0.05;
const HAIRPIN_MIN_ARM_KM = 0.03;
const HAIRPIN_COS = Math.cos((150 * Math.PI) / 180);
const MAX_EXAMPLES = 10;

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function loadTrackGraph() {
	const wikiMapData = readJson(path.join(CACHE_DIR, "wiki_map_data.json"));
	const ways = [];
	for (const route of wikiMapData.routes) {
		const lk = parseWikiRoute(route);
		const file = lk && path.join(CACHE_DIR, lk.cacheName);
		if (!file || !fs.existsSync(file)) continue;
		ways.push(...waysFromRouteGeoJson(readJson(file), lk.line, lk.available));
	}
	return buildRailGraph(ways);
}

async function loadGetTrainRoute(timetables) {
	// trainRoute.ts loads the route data with a dynamic import, which can't
	// be resolved from the copy below; read the file from disk instead.
	const railDataImport = /import\("[^"]*railData\.json"\)/;
	const original = fs.readFileSync(TRAIN_ROUTE_PATH, "utf8");
	if (!railDataImport.test(original)) {
		throw new Error(
			`check-routes: can't find the railData.json import in ${TRAIN_ROUTE_PATH}; update railDataImport`,
		);
	}
	const source = `import fs from "node:fs";\n${original.replace(
		railDataImport,
		`Promise.resolve({ default: JSON.parse(fs.readFileSync(${JSON.stringify(RAIL_DATA_PATH)}, "utf8")) })`,
	)}`;
	const copy = path.join(CACHE_DIR, "trainRoute.check.mts");
	fs.writeFileSync(copy, source);
	const byTrainNo = new Map(timetables.map((t) => [t.trainNo, t.timetable]));
	// trainRoute.ts fetches `${EDR_TIMETABLE_URL}/${server}/${trainNo}`.
	globalThis.fetch = async (/** @type {string} */ url) => {
		const timetable = byTrainNo.get(decodeURIComponent(url.split("/").pop()));
		return { ok: !!timetable, json: async () => timetable };
	};
	// Fresh module instance per run: it caches routes internally.
	const mod = await import(`${pathToFileURL(copy).href}?${Date.now()}`);
	return mod.getTrainRoute;
}

export async function checkRoutes({ log = console.log } = {}) {
	const timetables = readJson(path.join(CACHE_DIR, "all_timetables.json"));
	const railData = readJson(RAIL_DATA_PATH);
	const graph = loadTrackGraph();
	const getTrainRoute = await loadGetTrainRoute(timetables);

	const onTrack = (p) => nearestNode(graph, p, null, OFF_TRACK_KM) >= 0;
	const nearestStation = (p) => {
		let best = null;
		let bestKm = Infinity;
		for (const [name, coord] of Object.entries(railData.stations)) {
			const km = haversineKm(p, coord);
			if (km < bestKm) [best, bestKm] = [name, km];
		}
		return `${best} (${Math.round(bestKm * 1000)}m)`;
	};
	const stationAt = new Map(
		Object.entries(railData.stations).map(([n, c]) => [c.join(), n]),
	);

	let routes = 0;
	let drawnKm = 0;
	const jumps = new Map(); // location → { km, trains }
	const hairpins = new Map();
	const greys = new Map();
	const note = (map, key, trainNo, extra = {}) => {
		if (!map.has(key)) map.set(key, { trains: [], ...extra });
		map.get(key).trains.push(trainNo);
	};

	for (const { trainNo } of timetables) {
		const segments = await getTrainRoute({
			ServerCode: "check",
			TrainNoLocal: trainNo,
		});
		if (!segments) continue;
		routes++;
		for (const { color, points } of segments) {
			for (let i = 1; i < points.length; i++) {
				const [a, b] = [points[i - 1], points[i]];
				const km = haversineKm(a, b);
				drawnKm += km;
				if (color === "grey") continue;
				if (km > JUMP_MIN_KM) {
					const samples = Math.ceil(km / OFF_TRACK_KM);
					let off = 0;
					for (let s = 1; s < samples; s++) {
						const t = s / samples;
						if (!onTrack([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]))
							off++;
					}
					// One stray sample can be a curve cut by simplification.
					if (off > 1)
						note(
							jumps,
							`${nearestStation(a)} → ${nearestStation(b)}`,
							trainNo,
							{ km },
						);
				}
				const c = points[i + 1];
				if (!c) continue;
				const v1 = [b[0] - a[0], b[1] - a[1]];
				const v2 = [c[0] - b[0], c[1] - b[1]];
				const cos =
					(v1[0] * v2[0] + v1[1] * v2[1]) /
					(Math.hypot(...v1) * Math.hypot(...v2));
				if (
					cos < HAIRPIN_COS &&
					km > HAIRPIN_MIN_ARM_KM &&
					haversineKm(b, c) > HAIRPIN_MIN_ARM_KM
				) {
					note(hairpins, `near ${nearestStation(b)}`, trainNo);
				}
			}
			if (color === "grey") {
				const [a, b] = [points[0], points[points.length - 1]];
				note(
					greys,
					`${stationAt.get(a.join()) ?? a} → ${stationAt.get(b.join()) ?? b}`,
					trainNo,
					{
						km: haversineKm(a, b),
					},
				);
			}
		}
	}

	const report = (title, map, describe) => {
		const total = [...map.values()].reduce((n, v) => n + v.trains.length, 0);
		log(`  ${title}: ${total} in ${map.size} places`);
		const worst = [...map].sort(
			(a, b) => b[1].trains.length - a[1].trains.length,
		);
		for (const [where, v] of worst.slice(0, MAX_EXAMPLES)) {
			log(
				`    - ${where}${describe ? describe(v) : ""}: ${v.trains.length} trains (e.g. ${v.trains[0]})`,
			);
		}
	};
	log(
		`  Routes drawn: ${routes}/${timetables.length}, ${Math.round(drawnKm)} km`,
	);
	report("Off-track jumps", jumps, (v) => ` [${Math.round(v.km * 1000)}m]`);
	report("Hairpins", hairpins);
	report("Grey lines (no track data)", greys, (v) => ` [${v.km.toFixed(1)}km]`);

	const ok = jumps.size === 0 && hairpins.size === 0;
	log(ok ? "  Route check passed" : "  Route check FAILED");
	return {
		ok,
		routes,
		jumps: jumps.size,
		hairpins: hairpins.size,
		greys: greys.size,
	};
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	const { ok } = await checkRoutes();
	process.exit(ok ? 0 : 1);
}
