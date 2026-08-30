/**
 * rail-helpers.mjs — Shared utilities for the rail route data generator.
 *
 * This module provides the core algorithms used by the generator:
 *   - Name normalization (for matching station names across data sources)
 *   - Haversine distance (great-circle distance between two lat/lon points)
 *   - Douglas-Peucker line simplification (reduces polyline point count)
 *   - Google Encoded Polyline format (compact string encoding of coordinates)
 *   - Convex hull (Andrew's monotone chain algorithm)
 *   - Rail graph construction from GeoJSON route features
 *   - Spatial grid index for fast nearest-node queries
 *   - A* pathfinding with line-preference weighting
 *
 * All functions are pure and stateless (except makeRouter/makeNearestNode
 * which return closures with pre-allocated buffers for performance).
 */

/**
 * Normalizes a station name for matching across different data sources.
 *
 * Different sources use different casing, whitespace, and Unicode forms:
 *   - SimRail API: "Warszawa Główna Towarowa"
 *   - Wiki interactive map: "Warszawa Główna Towarowa WOA"
 *   - Community EDR: "Warszawa Główna Towarowa"
 *
 * Normalization: Unicode NFC form → trim → collapse internal whitespace → lowercase.
 * This allows exact-match lookups after normalization, and also helps with
 * fuzzy "contains" matching (e.g. "warszawa główna towarowa" is contained in
 * "warszawa główna towarowa woa").
 *
 * @param {string} name - Raw station name from any source
 * @returns {string} Normalized name
 */
export function normalizeName(name) {
	return name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Haversine distance between two [lat, lon] points, in kilometers.
 *
 * Uses the haversine formula: a = sin²(Δlat/2) + cos(lat1)·cos(lat2)·sin²(Δlon/2)
 * Distance = 2·R·arcsin(√a), where R = Earth radius (6371 km).
 *
 * This is used for:
 *   - Edge weights in the rail graph (distance between consecutive track points)
 *   - A* heuristic (straight-line distance to target — admissible, never overestimates)
 *   - Nearest-node snapping (finding the closest graph node to a station coordinate)
 *   - Detour detection (comparing A* path length vs straight-line distance)
 *
 * @param {[number, number]} a - [lat, lon] in decimal degrees
 * @param {[number, number]} b - [lat, lon] in decimal degrees
 * @returns {number} Distance in kilometers
 */
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

/**
 * Encodes a polyline as a Google Encoded Polyline string.
 *
 * This format encodes lat/lon deltas as variable-length signed integers using
 * 5-bit groups (base64-like, shifted by 63 to avoid control characters).
 * Precision: 5 decimal places (~1.1 meters).
 *
 * Algorithm per coordinate:
 *   1. Round lat/lon to 5 decimal places
 *   2. Compute delta from previous coordinate
 *   3. Zigzag-encode: if negative, ~(v << 1); if positive, v << 1
 *      (This interleaves positive/negative for compact varint encoding)
 *   4. Split into 5-bit groups, output each as ASCII char (group | 0x20) + 63
 *      (continuation bit + base64 offset). Last group has no continuation bit.
 *
 * @param {[number, number][]} points - Array of [lat, lon] points
 * @returns {string} Encoded polyline string
 */
export function encodePolyline(points) {
	let out = "";
	let plat = 0; // Previous rounded latitude (for delta encoding)
	let plon = 0; // Previous rounded longitude
	const enc = (v) => {
		// Zigzag encoding: maps signed integers to unsigned for varint.
		// 0→0, -1→1, 1→2, -2→3, 2→4, ...
		v = v < 0 ? ~(v << 1) : v << 1;
		let s = "";
		// Output 5-bit groups with continuation bit (0x20) until value fits in 5 bits.
		while (v >= 0x20) {
			s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
			v >>= 5;
		}
		return s + String.fromCharCode(v + 63); // Last group: no continuation bit
	};
	for (const [lat, lon] of points) {
		const rlat = Math.round(lat * 1e5); // Round to 5 decimal places
		const rlon = Math.round(lon * 1e5);
		out += enc(rlat - plat) + enc(rlon - plon); // Encode deltas
		plat = rlat;
		plon = rlon;
	}
	return out;
}

/**
 * Decodes a Google Encoded Polyline string back to an array of [lat, lon] points.
 *
 * Reverses the encoding: reads 5-bit groups, reconstructs zigzag-decoded deltas,
 * accumulates them to get absolute coordinates, and divides by 1e5.
 *
 * @param {string} str - Encoded polyline string
 * @returns {[number, number][]} Array of [lat, lon] points
 */
export function decodePolyline(str) {
	let idx = 0;
	let lat = 0;
	let lon = 0;
	const pts = [];
	while (idx < str.length) {
		// Decode one varint (latitude delta)
		let shift = 0;
		let result = 0;
		let byte;
		do {
			byte = str.charCodeAt(idx++) - 63;
			result |= (byte & 0x1f) << shift;
			shift += 5;
		} while (byte >= 0x20); // Continue bit set
		// Zigzag decode: if LSB is 1, value is negative
		lat += result & 1 ? ~(result >> 1) : result >> 1;

		// Decode one varint (longitude delta)
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

/**
 * Builds a rail graph from wiki route GeoJSON features.
 *
 * The graph is stored in CSR (Compressed Sparse Row) format for cache-efficient
 * A* traversal. Each node is a unique [lat, lon] coordinate, and each edge
 * connects two consecutive points in a LineString.
 *
 * The wiki provides track geometry as GeoJSON LineString features, where each
 * feature represents a section of track belonging to a specific line (e.g. LK4,
 * LK1). These LineStrings are OSM ways — sequences of [lon, lat] coordinates.
 *
 * Two types of edges are created:
 *   1. Track edges: consecutive points within a LineString, tagged with the
 *      line number(s) from the route name (e.g. "LK4" → refs=["4"]).
 *   2. Proximity snap edges: edges between nodes that are within 15 meters of
 *      each other but not connected by any LineString. These bridge gaps where
 *      OSM ways share a physical location but have slightly different
 *      coordinates (e.g. a track that was remapped). Snap edges have refs=[]
 *      (no line association).
 *
 * CSR format explanation:
 *   - coords: Array of [lat, lon] — one per node
 *   - start: Int32Array(nodeCount + 1) — start[u] to start[u+1] is the range
 *     of adjacency entries for node u (prefix sum of node degrees)
 *   - adjEdge: Int32Array — edge index for each adjacency entry
 *   - adjOther: Int32Array — the other endpoint of each adjacency entry
 *   - adjDist: Float64Array — edge distance (km) for each adjacency entry
 *   - erefs: Array<string[]> — line number(s) associated with each edge
 *
 * @param {Array<{geometry: object, refs: string[]}>} routeFeatures - GeoJSON features
 * @returns {object} Graph in CSR format
 */
export function buildGraphFromRoutes(routeFeatures) {
	// Deduplicate coordinates: many LineStrings share the same physical points
	// (e.g. at junctions). We use a Map keyed by "lat,lon" (6 decimal places)
	// to assign each unique coordinate a node index.
	const coordIndex = new Map();
	const coords = [];
	const resolveCoord = (lat, lon) => {
		const key = `${lat.toFixed(6)},${lon.toFixed(6)}`;
		let i = coordIndex.get(key);
		if (i === undefined) {
			i = coords.length;
			coordIndex.set(key, i);
			coords.push([lat, lon]);
		}
		return i;
	};

	// Build edge lists from LineString features.
	// Each consecutive pair of coordinates in a LineString becomes an edge.
	// We also track which nodes are LineString endpoints (first and last
	// points) for the secondary endpoint-snap pass below.
	const ea = []; // Edge endpoint A (node index)
	const eb = []; // Edge endpoint B (node index)
	const ed = []; // Edge distance (km, via haversine)
	const erefs = []; // Edge line refs (e.g. ["4"] for LK4)
	const endpointNodes = new Set(); // Node indices that are LineString endpoints

	for (const feat of routeFeatures) {
		const refs = feat.refs || [];
		let lines = [];
		const g = feat.geometry;
		if (!g) continue;
		if (g.type === "LineString") lines = [g.coordinates];
		else if (g.type === "MultiLineString") lines = g.coordinates;
		else continue; // Skip Points, Polygons, etc.

		for (const line of lines) {
			if (line.length === 0) continue;
			// Mark first and last coordinates as endpoints.
			const firstIdx = resolveCoord(line[0][1], line[0][0]);
			endpointNodes.add(firstIdx);
			if (line.length > 1) {
				const lastC = line[line.length - 1];
				const lastIdx = resolveCoord(lastC[1], lastC[0]);
				endpointNodes.add(lastIdx);
			}

			let prevIdx = -1;
			for (const c of line) {
				// GeoJSON coordinates are [lon, lat]; resolveCoord expects (lat, lon)
				const i = resolveCoord(c[1], c[0]);
				if (prevIdx >= 0 && prevIdx !== i) {
					ea.push(prevIdx);
					eb.push(i);
					ed.push(haversineKm(coords[prevIdx], coords[i]));
					erefs.push(refs);
				}
				prevIdx = i;
			}
		}
	}

	// Proximity snapping: connect nodes that are within 15 meters of each other
	// but not connected by any LineString. This bridges gaps in the OSM data
	// where ways share a physical point but have slightly different coordinates
	// (e.g. after a remap or when ways from different line routes meet).
	//
	// Uses a spatial grid (cell size ~0.005° ≈ 555m) to avoid O(n²) comparison.
	// For each node, checks the 3×3 neighborhood of grid cells.
	const snapToleranceKm = 0.015; // 15 meters
	const snapGridSize = 0.005; // ~555m grid cells
	const snapGrid = new Map();
	for (let i = 0; i < coords.length; i++) {
		const [lat, lon] = coords[i];
		const key = `${Math.floor(lat / snapGridSize)},${Math.floor(lon / snapGridSize)}`;
		let cell = snapGrid.get(key);
		if (!cell) {
			cell = [];
			snapGrid.set(key, cell);
		}
		cell.push(i);
	}

	// For each node, check neighboring cells for close nodes.
	// Use a Set to avoid duplicate edges (pair i,j is only added once).
	const snapEdges = new Set();
	for (let i = 0; i < coords.length; i++) {
		const [lat, lon] = coords[i];
		const cx = Math.floor(lat / snapGridSize);
		const cy = Math.floor(lon / snapGridSize);
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				const cell = snapGrid.get(`${cx + dx},${cy + dy}`);
				if (!cell) continue;
				for (const j of cell) {
					if (j <= i) continue; // Only check j > i to avoid duplicates
					const d = haversineKm(coords[i], coords[j]);
					if (d <= snapToleranceKm && d > 0) {
						const ek = `${Math.min(i, j)}|${Math.max(i, j)}`;
						if (!snapEdges.has(ek)) {
							snapEdges.add(ek);
							ea.push(i);
							eb.push(j);
							ed.push(d);
							erefs.push([]); // Snap edges have no line association
						}
					}
				}
			}
		}
	}

	// Secondary endpoint-snap pass: connect LineString endpoints to nearby
	// nodes within a larger tolerance (500m). This bridges gaps in the wiki
	// GeoJSON data where a LineString is split into fragments with ~100-300m
	// gaps between them (e.g. LK139 near Brynów has a 257m gap).
	//
	// Only endpoints are considered (not mid-track nodes), so this does NOT
	// connect parallel tracks (which have close mid-track nodes but distant
	// endpoints). Each endpoint is connected to its single nearest non-adjacent
	// node within tolerance, avoiding a flood of spurious edges.
	const endpointToleranceKm = 0.5; // 500 meters
	const epGridSize = 0.005; // ~555m grid cells (reuse same size)
	const epGrid = new Map();
	for (let i = 0; i < coords.length; i++) {
		if (!endpointNodes.has(i)) continue;
		const [lat, lon] = coords[i];
		const key = `${Math.floor(lat / epGridSize)},${Math.floor(lon / epGridSize)}`;
		let cell = epGrid.get(key);
		if (!cell) {
			cell = [];
			epGrid.set(key, cell);
		}
		cell.push(i);
	}
	// Build a grid of ALL nodes for lookup (endpoint → nearest any-node).
	const allGrid = new Map();
	for (let i = 0; i < coords.length; i++) {
		const [lat, lon] = coords[i];
		const key = `${Math.floor(lat / epGridSize)},${Math.floor(lon / epGridSize)}`;
		let cell = allGrid.get(key);
		if (!cell) {
			cell = [];
			allGrid.set(key, cell);
		}
		cell.push(i);
	}
	// Track existing adjacency to avoid duplicate edges.
	const adjSet = new Set();
	for (let e = 0; e < ea.length; e++) {
		adjSet.add(`${Math.min(ea[e], eb[e])}|${Math.max(ea[e], eb[e])}`);
	}
	for (const i of endpointNodes) {
		const [lat, lon] = coords[i];
		const cx = Math.floor(lat / epGridSize);
		const cy = Math.floor(lon / epGridSize);
		let bestJ = -1;
		let bestDist = Infinity;
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				const cell = allGrid.get(`${cx + dx},${cy + dy}`);
				if (!cell) continue;
				for (const j of cell) {
					if (j === i) continue;
					const ek = `${Math.min(i, j)}|${Math.max(i, j)}`;
					if (adjSet.has(ek)) continue;
					const d = haversineKm(coords[i], coords[j]);
					if (d < bestDist) {
						bestDist = d;
						bestJ = j;
					}
				}
			}
		}
		if (bestJ >= 0 && bestDist <= endpointToleranceKm) {
			const ek = `${Math.min(i, bestJ)}|${Math.max(i, bestJ)}`;
			adjSet.add(ek);
			ea.push(i);
			eb.push(bestJ);
			ed.push(bestDist);
			erefs.push([]); // Endpoint-snap edges have no line association
		}
	}

	// Build CSR (Compressed Sparse Row) adjacency structure.
	// CSR stores all adjacency entries in flat arrays, with a prefix-sum index
	// that gives the range [start[u], start[u+1]) of adjacency entries for node u.
	// This is cache-efficient and allows fast iteration over a node's neighbors.
	const nodeCount = coords.length;
	const edgeCount = ea.length;

	// Step 1: Count the degree of each node (number of adjacency entries).
	const degree = new Int32Array(nodeCount);
	for (let e = 0; e < edgeCount; e++) {
		degree[ea[e]]++; // Each undirected edge contributes to both endpoints
		degree[eb[e]]++;
	}

	// Step 2: Build the prefix-sum array. start[u] = offset where node u's
	// adjacency entries begin. start[nodeCount] = total adjacency entries.
	const start = new Int32Array(nodeCount + 1);
	for (let i = 0; i < nodeCount; i++) start[i + 1] = start[i] + degree[i];

	// Step 3: Fill adjacency arrays. cursor[u] tracks the current write position
	// for node u's entries (starts at start[u], advances as edges are added).
	// Each edge is added twice: once for endpoint A, once for endpoint B.
	const cursor = Int32Array.from(start); // Copy of start, used as write cursors
	const adjEdge = new Int32Array(edgeCount * 2); // Edge index for each adjacency
	const adjOther = new Int32Array(edgeCount * 2); // Other endpoint node index
	const adjDist = new Float64Array(edgeCount * 2); // Edge distance (km)
	for (let e = 0; e < edgeCount; e++) {
		// Add edge e to node ea[e]'s adjacency list
		let p = cursor[ea[e]]++;
		adjEdge[p] = e;
		adjOther[p] = eb[e];
		adjDist[p] = ed[e];
		// Add edge e to node eb[e]'s adjacency list (undirected graph)
		p = cursor[eb[e]]++;
		adjEdge[p] = e;
		adjOther[p] = ea[e];
		adjDist[p] = ed[e];
	}

	return { coords, start, adjEdge, adjOther, adjDist, erefs };
}

/**
 * Creates a nearest-node finder function using a spatial grid index.
 *
 * Returns a closure that, given a [lat, lon] point, finds the nearest graph
 * node within maxKm. Uses a grid of cells (size gridSize degrees) to avoid
 * scanning all nodes — only checks cells in expanding rings around the query
 * point until a node within maxKm is found.
 *
 * Preferred-line snapping: if preferredRefs is provided, the finder also tracks
 * the nearest node that has at least one edge on a preferred line. If such a
 * node is found within maxKm, it is returned instead of the global nearest.
 * This ensures stations snap to the correct line's tracks at junctions where
 * multiple lines meet (e.g. Warszawa Główna Towarowa is at the junction of
 * LK1, LK3, and LK19 — we want to snap to LK19, not LK3).
 *
 * @param {object} graph - Graph from buildGraphFromRoutes()
 * @param {number} gridSize - Grid cell size in degrees (default 0.02 ≈ 2.2km)
 * @param {number} maxKm - Maximum snap distance in km (default 3.0)
 * @param {string[]|null} preferredRefs - Line numbers to prefer (e.g. ["19", "1"])
 * @returns {function} (point: [lat, lon]) => { index: number, distKm: number }
 */
export function makeNearestNode(
	graph,
	gridSize = 0.02,
	maxKm = 3.0,
	preferredRefs = null,
) {
	// Build spatial grid: each cell contains indices of nodes within that cell.
	const grid = new Map();
	for (let i = 0; i < graph.coords.length; i++) {
		const [lat, lon] = graph.coords[i];
		const key = `${Math.floor(lat / gridSize)},${Math.floor(lon / gridSize)}`;
		let cell = grid.get(key);
		if (!cell) {
			cell = [];
			grid.set(key, cell);
		}
		cell.push(i);
	}

	// Precompute which nodes have at least one edge on a preferred line.
	// This avoids checking edge refs on every query — we just check a bitmask.
	const preferredSet = preferredRefs ? new Set(preferredRefs) : null;
	const nodeHasPreferred = new Uint8Array(graph.coords.length);
	if (preferredSet) {
		for (let u = 0; u < graph.coords.length; u++) {
			// Check all edges of node u for any preferred line ref.
			for (let p = graph.start[u]; p < graph.start[u + 1]; p++) {
				const e = graph.adjEdge[p];
				const refs = graph.erefs[e];
				if (refs && refs.some((r) => preferredSet.has(r))) {
					nodeHasPreferred[u] = 1;
					break;
				}
			}
		}
	}

	// The returned finder function.
	return (point) => {
		const [lat, lon] = point;
		const cx = Math.floor(lat / gridSize);
		const cy = Math.floor(lon / gridSize);
		let bestIdx = -1;
		let bestDist = Infinity;
		let bestPreferredIdx = -1;
		let bestPreferredDist = Infinity;

		// Expand search ring by ring until we find a node within maxKm.
		// Ring r checks all cells at Chebyshev distance r from (cx, cy).
		for (let r = 0; r <= 10; r++) {
			for (let dx = -r; dx <= r; dx++) {
				for (let dy = -r; dy <= r; dy++) {
					// Only check cells on the ring boundary (skip interior, already checked).
					if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
					const cell = grid.get(`${cx + dx},${cy + dy}`);
					if (!cell) continue;
					for (const idx of cell) {
						const d = haversineKm(graph.coords[idx], point);
						// Track global nearest
						if (d < bestDist) {
							bestDist = d;
							bestIdx = idx;
						}
						// Track nearest preferred-line node
						if (
							preferredSet &&
							nodeHasPreferred[idx] &&
							d < bestPreferredDist
						) {
							bestPreferredDist = d;
							bestPreferredIdx = idx;
						}
					}
				}
			}
			// Stop expanding if we found a node within maxKm.
			if (bestIdx >= 0 && bestDist < maxKm) break;
		}

		// Return preferred node if available, otherwise global nearest.
		if (preferredSet && bestPreferredIdx >= 0 && bestPreferredDist < maxKm) {
			return { index: bestPreferredIdx, distKm: bestPreferredDist };
		}
		return { index: bestIdx, distKm: bestDist };
	};
}

/**
 * Creates an A* router function for the given graph.
 *
 * Returns a closure that finds the shortest path between two nodes using A*
 * with a haversine distance heuristic (straight-line distance to target).
 *
 * Line preference: if lineFilter is provided (a string or array of strings),
 * edges on those lines are traversed at normal cost, while edges on other
 * lines are penalized with a 10x cost multiplier. This is NOT a hard filter —
 * non-preferred edges are still allowed, which lets the router use connector
 * tracks (e.g. LK3 junction tracks between LK19 and LK1 in Warsaw) when
 * necessary, but minimizes their use.
 *
 * The router uses pre-allocated typed arrays for dist[], prev[], and done[]
 * to avoid GC pressure on repeated queries. A "stamp" mechanism avoids
 * resetting the done[] array between queries — each query increments the stamp,
 * and a node is "visited" if done[u] === currentStamp.
 *
 * The binary heap is also pre-allocated and grows dynamically if needed.
 * It stores [f, g, node] tuples, where f = g + h (estimated total cost),
 * g = actual cost so far, h = heuristic (haversine to target).
 *
 * @param {object} graph - Graph from buildGraphFromRoutes()
 * @returns {function} (startIdx, endIdx, lineFilter?) => number[] | null
 */
export function makeRouter(graph) {
	const { coords, start, adjEdge, adjOther, adjDist, erefs } = graph;
	const n = coords.length;

	// Pre-allocated arrays (reused across queries for performance)
	const dist = new Float64Array(n); // Best-known cost to each node
	const prev = new Int32Array(n); // Previous node in best-known path
	const done = new Uint32Array(n); // "Visited" stamp (avoids reset between queries)
	let stamp = 0; // Current query stamp

	// Binary min-heap, stored as parallel typed arrays for cache efficiency.
	// heapF: f-score (estimated total cost = g + heuristic)
	// heapG: g-score (actual cost so far)
	// heapN: node index
	let heapF = new Float64Array(4096);
	let heapG = new Float64Array(4096);
	let heapN = new Int32Array(4096);
	let heapSize = 0;

	// Doubles the heap capacity when full (copy old data to new arrays).
	const grow = () => {
		const cap = heapF.length * 2;
		const nf = new Float64Array(cap);
		const ng = new Float64Array(cap);
		const nn = new Int32Array(cap);
		nf.set(heapF);
		ng.set(heapG);
		nn.set(heapN);
		heapF = nf;
		heapG = ng;
		heapN = nn;
	};

	// Push a [f, g, node] entry into the heap and sift up.
	// Standard binary heap: parent at (c-1)>>1, swap if child < parent.
	const push = (f, g, node) => {
		if (heapSize === heapF.length) grow();
		let c = heapSize++;
		heapF[c] = f;
		heapG[c] = g;
		heapN[c] = node;
		// Sift up: swap with parent while child's f-score is smaller.
		while (c > 0) {
			const p = (c - 1) >> 1;
			if (heapF[p] <= heapF[c]) break;
			// Swap all three arrays in parallel
			const tf = heapF[p];
			heapF[p] = heapF[c];
			heapF[c] = tf;
			const tg = heapG[p];
			heapG[p] = heapG[c];
			heapG[c] = tg;
			const tn = heapN[p];
			heapN[p] = heapN[c];
			heapN[c] = tn;
			c = p;
		}
	};

	// Pop the minimum-f entry from the heap and sift down.
	// Returns [f, g, node] — the entry with the smallest f-score.
	const pop = () => {
		const rf = heapF[0]; // Min entry (root of heap)
		const rg = heapG[0];
		const rn = heapN[0];
		heapSize--;
		if (heapSize > 0) {
			// Move last entry to root and sift down.
			heapF[0] = heapF[heapSize];
			heapG[0] = heapG[heapSize];
			heapN[0] = heapN[heapSize];
			let c = 0;
			for (;;) {
				const l = 2 * c + 1; // Left child index
				const r = 2 * c + 2; // Right child index
				let m = c; // Index of smallest f-score among c, l, r
				if (l < heapSize && heapF[l] < heapF[m]) m = l;
				if (r < heapSize && heapF[r] < heapF[m]) m = r;
				if (m === c) break; // Heap property satisfied
				// Swap with smallest child
				const tf = heapF[m];
				heapF[m] = heapF[c];
				heapF[c] = tf;
				const tg = heapG[m];
				heapG[m] = heapG[c];
				heapG[c] = tg;
				const tn = heapN[m];
				heapN[m] = heapN[c];
				heapN[c] = tn;
				c = m;
			}
		}
		return [rf, rg, rn];
	};

	/**
	 * Find shortest path from startIdx to endIdx.
	 *
	 * @param {number} startIdx - Source node index
	 * @param {number} endIdx - Target node index
	 * @param {string|string[]|null} lineFilter - Preferred line number(s).
	 *   Edges on these lines have normal cost; other edges cost 10x more.
	 *   If null, all edges have equal cost (standard A*).
	 * @returns {number[]|null} Array of node indices forming the path, or null
	 */
	return function route(startIdx, endIdx, lineFilter) {
		stamp++; // New query → new stamp (done[] entries from previous queries are stale)
		dist.fill(Infinity);
		dist[startIdx] = 0;
		prev[startIdx] = -1; // No predecessor for start node
		heapSize = 0;
		// Push start node with f = 0 + haversine(start, end) (A* heuristic)
		push(haversineKm(coords[startIdx], coords[endIdx]), 0, startIdx);

		// Convert lineFilter to a Set for O(1) lookup.
		// Accepts a single string or an array of strings.
		const filterSet = Array.isArray(lineFilter)
			? new Set(lineFilter)
			: lineFilter
				? new Set([lineFilter])
				: null;

		// Main A* loop: repeatedly pop the node with smallest f-score,
		// relax its neighbors, and push updated entries.
		while (heapSize > 0) {
			const [, g, u] = pop(); // f, g, node (f not needed after pop)
			if (done[u] === stamp) continue; // Already visited (stale heap entry)
			done[u] = stamp;
			if (u === endIdx) break; // Reached target
			if (g > dist[u]) continue; // Stale entry (better path already found)

			// Iterate over all neighbors of u using CSR adjacency.
			for (let p = start[u]; p < start[u + 1]; p++) {
				const e = adjEdge[p]; // Edge index
				const refs = erefs[e]; // Line number(s) for this edge
				const v = adjOther[p]; // Other endpoint
				if (done[v] === stamp) continue; // Already visited

				// Compute edge cost. Edges on preferred lines have normal cost.
				// Edges on other lines (e.g. junction connectors) cost 10x more.
				// This is a soft penalty, not a hard filter — non-preferred edges
				// are still traversable, which allows the router to use connector
				// tracks at junctions where two preferred lines don't directly meet.
				let edgeCost = adjDist[p];
				if (filterSet && refs.length > 0) {
					const onPreferred = refs.some((r) => filterSet.has(r));
					if (!onPreferred) edgeCost *= 10;
				}

				const ng = g + edgeCost; // Actual cost to reach v via u
				if (ng < dist[v]) {
					// Found a better path to v
					dist[v] = ng;
					prev[v] = u;
					// f = g + h, where h = haversine(v, end) (A* heuristic)
					push(ng + haversineKm(coords[v], coords[endIdx]), ng, v);
				}
			}
		}

		// Check if target was reached.
		if (done[endIdx] !== stamp) return null;

		// Reconstruct path by following prev[] chain from target to source.
		const pathIdx = [];
		for (let u = endIdx; u !== -1; u = prev[u]) pathIdx.push(u);
		pathIdx.reverse(); // Source → target order
		return pathIdx;
	};
}
