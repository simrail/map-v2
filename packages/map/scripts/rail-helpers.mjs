export function normalizeName(name) {
	return name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function haversineKm(a, b) {
	const R = 6371;
	const dLat = ((b[0] - a[0]) * Math.PI) / 180;
	const dLon = ((b[1] - a[1]) * Math.PI) / 180;
	const la1 = (a[0] * Math.PI) / 180;
	const la2 = (b[0] * Math.PI) / 180;
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(h));
}

export function encodePolyline(points) {
	let out = "";
	let plat = 0;
	let plon = 0;
	const enc = (v) => {
		v = v < 0 ? ~(v << 1) : v << 1;
		let s = "";
		while (v >= 0x20) {
			s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
			v >>= 5;
		}
		return s + String.fromCharCode(v + 63);
	};
	for (const [lat, lon] of points) {
		const rlat = Math.round(lat * 1e5);
		const rlon = Math.round(lon * 1e5);
		out += enc(rlat - plat) + enc(rlon - plon);
		plat = rlat;
		plon = rlon;
	}
	return out;
}

/**
 * The wiki map's LK route entry for a line, or null for sidings and other
 * non-line routes. A line can have two entries: the part available in the
 * game and the part that isn't.
 */
export function parseWikiRoute(route) {
	const match = route.name.match(/^LK(\d+)$/);
	if (!match) return null;
	const available = route.available !== false;
	return {
		line: match[1],
		available,
		cacheName: `wiki_route_${route.name.replace(/[^a-zA-Z0-9]/g, "_")}_${available ? "avail" : "notavail"}.json`,
	};
}

/**
 * Track ways from a wiki route GeoJSON. Each feature is one OSM way — one
 * track, since double-track lines are mapped per track.
 */
export function waysFromRouteGeoJson(geojson, line, available) {
	const ways = [];
	for (const f of geojson.features || []) {
		const g = f.geometry;
		const parts =
			g?.type === "LineString"
				? [g.coordinates]
				: g?.type === "MultiLineString"
					? g.coordinates
					: [];
		const p = f.properties ?? {};
		const elevated =
			!!p.bridge || !!p.tunnel || (p.layer != null && Number(p.layer) !== 0);
		for (const part of parts) {
			if (part.length < 2) continue;
			ways.push({
				coords: part.map(([lon, lat]) => [lat, lon]),
				line,
				available,
				elevated,
			});
		}
	}
	return ways;
}

// Graph tuning. Tracks of a double-track line are ~4-6m apart and are
// separate OSM ways; the wiki export only contains `usage=main` ways, so the
// crossovers between them are missing. We recreate them as connectors.
const DENSIFY_KM = 0.025; // max node spacing, so parallel tracks have nearby nodes
const TRACK_CONNECT_KM = 0.02; // max gap bridged between tracks of the same line
const DEAD_END_CONNECT_KM = 0.03; // max gap bridged at a clipped way end
const PARALLEL_MAX_DEG = 30;
const CONNECTOR_PENALTY_KM = 0.2; // discourages zig-zagging between tracks
const GRID_DEG = 0.0005;
// Connected pieces shorter than this are OSM leftovers (stubs, clipped
// fragments). Stations must not snap onto them: nothing leads anywhere.
const MIN_COMPONENT_KM = 1;

const coordKey = (c) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`;
const cellKey = (lat, lon) =>
	`${Math.floor(lat / GRID_DEG)},${Math.floor(lon / GRID_DEG)}`;

function bearingDeg(a, b) {
	const cosLat = Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180);
	return (
		((Math.atan2((b[1] - a[1]) * cosLat, b[0] - a[0]) * 180) / Math.PI + 360) %
		360
	);
}

// Angle between two undirected track directions (0-90).
function axisDiffDeg(a, b) {
	const d = Math.abs(a - b) % 180;
	return d > 90 ? 180 - d : d;
}

function densify(coords) {
	const out = [coords[0]];
	for (let i = 1; i < coords.length; i++) {
		const a = coords[i - 1];
		const b = coords[i];
		const steps = Math.ceil(haversineKm(a, b) / DENSIFY_KM);
		for (let s = 1; s < steps; s++) {
			const t = s / steps;
			out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
		}
		out.push(b);
	}
	return out;
}

/**
 * Builds a routable graph from OSM track ways.
 *
 * ways: { coords: [lat, lon][], line: string, available: boolean,
 *         elevated: boolean }[]
 *
 * Edges come from three sources only:
 *   1. Way geometry. Ways of different lines connect only where OSM gives
 *      them a shared node — those are the real junctions. Lines crossing on a
 *      bridge never share a node, so trains can't jump there.
 *   2. Track connectors: nodes of the same line, on different ways, ≤20m
 *      apart and parallel. Stand-ins for the missing crossovers.
 *   3. Dead-end connectors: a way end that touches nothing else (the wiki
 *      clips lines at arbitrary points) joins the nearest aligned node ≤30m.
 *   4. Line connectors: like track connectors, but between different lines
 *      running side by side (e.g. LK1 and LK447 through Warszawa Włochy).
 *      Marked `crossLine`: only for switching lines inside a station.
 * Connectors are never made on bridges/tunnels and have `line: null`.
 */
export function buildRailGraph(ways) {
	const coords = [];
	const nodeIndex = new Map();
	const nodeElevated = [];
	const nodeLines = [];
	const nodeWays = [];
	// For each node, the local track direction per way through it.
	const nodeBearings = [];

	const nodeFor = (c) => {
		const key = coordKey(c);
		let i = nodeIndex.get(key);
		if (i === undefined) {
			i = coords.length;
			nodeIndex.set(key, i);
			coords.push([Number(c[0].toFixed(6)), Number(c[1].toFixed(6))]);
			nodeElevated.push(false);
			nodeLines.push(new Set());
			nodeWays.push(new Set());
			nodeBearings.push([]);
		}
		return i;
	};

	const edges = []; // { a, b, km, line, available, crossLine? }
	const addEdge = (a, b, km, line, available) =>
		edges.push({ a, b, km, line, available });

	ways.forEach((way, w) => {
		const pts = densify(way.coords);
		let prev = -1;
		for (let i = 0; i < pts.length; i++) {
			const n = nodeFor(pts[i]);
			nodeLines[n].add(way.line);
			nodeWays[n].add(w);
			if (way.elevated) nodeElevated[n] = true;
			const from = pts[Math.max(0, i - 1)];
			const to = pts[Math.min(pts.length - 1, i + 1)];
			nodeBearings[n].push(bearingDeg(from, to));
			if (prev >= 0 && prev !== n) {
				addEdge(
					prev,
					n,
					haversineKm(coords[prev], coords[n]),
					way.line,
					way.available,
				);
			}
			prev = n;
		}
	});

	const degree = new Int32Array(coords.length);
	for (const e of edges) {
		degree[e.a]++;
		degree[e.b]++;
	}

	const grid = new Map();
	coords.forEach(([lat, lon], i) => {
		const key = cellKey(lat, lon);
		let cell = grid.get(key);
		if (!cell) grid.set(key, (cell = []));
		cell.push(i);
	});
	const nearby = (i, maxKm) => {
		const [lat, lon] = coords[i];
		const cx = Math.floor(lat / GRID_DEG);
		const cy = Math.floor(lon / GRID_DEG);
		const out = [];
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				for (const j of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
					if (j === i) continue;
					const km = haversineKm(coords[i], coords[j]);
					if (km <= maxKm) out.push({ j, km });
				}
			}
		}
		return out.sort((p, q) => p.km - q.km);
	};
	const isParallel = (i, j) =>
		nodeBearings[i].some((bi) =>
			nodeBearings[j].some((bj) => axisDiffDeg(bi, bj) <= PARALLEL_MAX_DEG),
		);
	const shareLine = (i, j) =>
		[...nodeLines[i]].some((l) => nodeLines[j].has(l));
	const shareWay = (i, j) => [...nodeWays[i]].some((w) => nodeWays[j].has(w));

	const connected = new Set();
	const addConnector = (i, j, km, crossLine = false) => {
		const key = i < j ? `${i}|${j}` : `${j}|${i}`;
		if (connected.has(key)) return false;
		connected.add(key);
		addEdge(i, j, km + CONNECTOR_PENALTY_KM, null, true);
		if (crossLine) edges[edges.length - 1].crossLine = true;
		return true;
	};

	let trackConnectors = 0;
	let lineConnectors = 0;
	let deadEndConnectors = 0;
	for (let i = 0; i < coords.length; i++) {
		if (nodeElevated[i]) continue;
		// One connector per neighbouring way: the closest node on it.
		const seenWays = new Set();
		for (const { j, km } of nearby(i, TRACK_CONNECT_KM)) {
			if (nodeElevated[j] || shareWay(i, j)) continue;
			const newWays = [...nodeWays[j]].filter((w) => !seenWays.has(w));
			if (newWays.length === 0) continue;
			for (const w of newWays) seenWays.add(w);
			if (!isParallel(i, j)) continue;
			if (shareLine(i, j)) {
				if (addConnector(i, j, km)) trackConnectors++;
			} else if (addConnector(i, j, km, true)) {
				lineConnectors++;
			}
		}
	}

	for (let i = 0; i < coords.length; i++) {
		if (degree[i] !== 1 || nodeElevated[i]) continue;
		const out = nodeBearings[i][0];
		for (const { j, km } of nearby(i, DEAD_END_CONNECT_KM)) {
			if (nodeElevated[j] || shareWay(i, j)) continue;
			// The gap must continue the dead end's direction and join a
			// track running the same way.
			if (
				km > 0.002 &&
				axisDiffDeg(out, bearingDeg(coords[i], coords[j])) > PARALLEL_MAX_DEG
			)
				continue;
			if (!isParallel(i, j)) continue;
			if (addConnector(i, j, km)) deadEndConnectors++;
			break;
		}
	}

	// CSR adjacency.
	const n = coords.length;
	const start = new Int32Array(n + 1);
	for (const e of edges) {
		start[e.a + 1]++;
		start[e.b + 1]++;
	}
	for (let i = 0; i < n; i++) start[i + 1] += start[i];
	const cursor = Int32Array.from(start);
	const adjEdge = new Int32Array(edges.length * 2);
	const adjOther = new Int32Array(edges.length * 2);
	edges.forEach((e, idx) => {
		adjEdge[cursor[e.a]] = idx;
		adjOther[cursor[e.a]++] = e.b;
		adjEdge[cursor[e.b]] = idx;
		adjOther[cursor[e.b]++] = e.a;
	});

	const snappable = new Uint8Array(n);
	const visited = new Uint8Array(n);
	let fragments = 0;
	for (let s = 0; s < n; s++) {
		if (visited[s]) continue;
		const members = [s];
		visited[s] = 1;
		let km = 0;
		for (let k = 0; k < members.length; k++) {
			const u = members[k];
			for (let p = start[u]; p < start[u + 1]; p++) {
				const v = adjOther[p];
				if (v > u) km += edges[adjEdge[p]].km;
				if (!visited[v]) {
					visited[v] = 1;
					members.push(v);
				}
			}
		}
		if (km >= MIN_COMPONENT_KM) for (const u of members) snappable[u] = 1;
		else fragments++;
	}

	return {
		coords,
		edges,
		start,
		adjEdge,
		adjOther,
		nodeLines,
		snappable,
		grid,
		stats: {
			nodes: n,
			edges: edges.length,
			trackConnectors,
			lineConnectors,
			deadEndConnectors,
			fragments,
		},
	};
}

/** Nearest node to `point` on one of `lines` (a Set; any line when null). */
export function nearestNode(graph, point, lines, maxKm) {
	const { coords, grid, nodeLines, snappable } = graph;
	const cx = Math.floor(point[0] / GRID_DEG);
	const cy = Math.floor(point[1] / GRID_DEG);
	// A grid cell is at least ~34m wide at these latitudes.
	const rings = Math.ceil(maxKm / 0.034);
	let best = -1;
	let bestKm = Infinity;
	for (let r = 0; r <= rings; r++) {
		for (let dx = -r; dx <= r; dx++) {
			for (let dy = -r; dy <= r; dy++) {
				if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
				for (const i of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
					if (!snappable[i]) continue;
					if (lines && ![...nodeLines[i]].some((l) => lines.has(l))) continue;
					const km = haversineKm(point, coords[i]);
					if (km < bestKm) {
						bestKm = km;
						best = i;
					}
				}
			}
		}
		// Anything in a further ring is at least r cells away.
		if (best >= 0 && bestKm <= r * 0.034) break;
	}
	return best >= 0 && bestKm <= maxKm ? best : -1;
}

/**
 * A* over the graph, using only edges for which `allowEdge(edge)` holds.
 * Returns the path as a list of edge indices, or null.
 */
export function findPath(graph, from, to, allowEdge) {
	const { coords, edges, start, adjEdge, adjOther } = graph;
	const dist = new Map([[from, 0]]);
	const via = new Map();
	const done = new Set();
	const heap = [[haversineKm(coords[from], coords[to]), from]];
	const push = (item) => {
		heap.push(item);
		let c = heap.length - 1;
		while (c > 0) {
			const p = (c - 1) >> 1;
			if (heap[p][0] <= heap[c][0]) break;
			[heap[p], heap[c]] = [heap[c], heap[p]];
			c = p;
		}
	};
	const pop = () => {
		const top = heap[0];
		const last = heap.pop();
		if (heap.length > 0) {
			heap[0] = last;
			let c = 0;
			for (;;) {
				const l = 2 * c + 1;
				const r = l + 1;
				let m = c;
				if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
				if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
				if (m === c) break;
				[heap[m], heap[c]] = [heap[c], heap[m]];
				c = m;
			}
		}
		return top;
	};

	while (heap.length > 0) {
		const [, u] = pop();
		if (done.has(u)) continue;
		done.add(u);
		if (u === to) break;
		for (let p = start[u]; p < start[u + 1]; p++) {
			const e = edges[adjEdge[p]];
			if (!allowEdge(e)) continue;
			const v = adjOther[p];
			const g = dist.get(u) + e.km;
			if (g < (dist.get(v) ?? Infinity)) {
				dist.set(v, g);
				via.set(v, adjEdge[p]);
				push([g + haversineKm(coords[v], coords[to]), v]);
			}
		}
	}
	if (!done.has(to)) return null;

	const path = [];
	for (let u = to; u !== from;) {
		const e = via.get(u);
		path.push(e);
		u = edges[e].a === u ? edges[e].b : edges[e].a;
	}
	return path.reverse();
}

function perpendicularKm(p, a, b) {
	const cosLat = Math.cos((p[0] * Math.PI) / 180);
	const toXY = (c) => [c[1] * cosLat * 111.32, c[0] * 111.32];
	const [px, py] = toXY(p);
	const [ax, ay] = toXY(a);
	const [bx, by] = toXY(b);
	const dx = bx - ax;
	const dy = by - ay;
	const len2 = dx * dx + dy * dy;
	const t =
		len2 === 0
			? 0
			: Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Douglas-Peucker; returns the indices of the points to keep. Also irons out
 * the few-metre hops between parallel tracks.
 */
export function simplifyIndices(points, toleranceKm) {
	if (points.length <= 2) return points.map((_, i) => i);
	const keep = new Uint8Array(points.length);
	keep[0] = keep[points.length - 1] = 1;
	const stack = [[0, points.length - 1]];
	while (stack.length > 0) {
		const [s, e] = stack.pop();
		let maxD = 0;
		let idx = -1;
		for (let i = s + 1; i < e; i++) {
			const d = perpendicularKm(points[i], points[s], points[e]);
			if (d > maxD) {
				maxD = d;
				idx = i;
			}
		}
		if (idx >= 0 && maxD > toleranceKm) {
			keep[idx] = 1;
			stack.push([s, idx], [idx, e]);
		}
	}
	const out = [];
	for (let i = 0; i < points.length; i++) if (keep[i]) out.push(i);
	return out;
}
