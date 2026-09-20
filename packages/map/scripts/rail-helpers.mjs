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

export function decodePolyline(str) {
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

export function buildGraphFromRoutes(routeFeatures) {
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

	const ea = [];
	const eb = [];
	const ed = [];
	const erefs = [];
	const endpointNodes = new Set();
	const endpointBearings = new Map();

	const bearingDeg = (a, b) => {
		const cosLat = Math.cos((((a[0] + b[0]) / 2) * Math.PI) / 180);
		return (
			((Math.atan2((b[1] - a[1]) * cosLat, b[0] - a[0]) * 180) / Math.PI +
				360) %
			360
		);
	};
	const angleDiffDeg = (a, b) => {
		const d = Math.abs(a - b) % 360;
		return d > 180 ? 360 - d : d;
	};
	const addEndpointBearing = (idx, deg) => {
		let list = endpointBearings.get(idx);
		if (!list) endpointBearings.set(idx, (list = []));
		list.push(deg);
	};

	for (const feat of routeFeatures) {
		const refs = feat.refs || [];
		let lines = [];
		const g = feat.geometry;
		if (!g) continue;
		if (g.type === "LineString") lines = [g.coordinates];
		else if (g.type === "MultiLineString") lines = g.coordinates;
		else continue;

		for (const line of lines) {
			if (line.length === 0) continue;
			const firstIdx = resolveCoord(line[0][1], line[0][0]);
			endpointNodes.add(firstIdx);
			if (line.length > 1) {
				const lastC = line[line.length - 1];
				const lastIdx = resolveCoord(lastC[1], lastC[0]);
				endpointNodes.add(lastIdx);
				const second = line[1];
				addEndpointBearing(
					firstIdx,
					bearingDeg([line[0][1], line[0][0]], [second[1], second[0]]),
				);
				const prevLast = line[line.length - 2];
				addEndpointBearing(
					lastIdx,
					bearingDeg([prevLast[1], prevLast[0]], [lastC[1], lastC[0]]),
				);
			}

			let prevIdx = -1;
			for (const c of line) {
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

	const endpointToleranceKm = 0.5;
	const epGridSize = 0.005;
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
	const adjSet = new Set();
	const neighbors = new Map();
	for (let e = 0; e < ea.length; e++) {
		adjSet.add(`${Math.min(ea[e], eb[e])}|${Math.max(ea[e], eb[e])}`);
		let n1 = neighbors.get(ea[e]);
		if (!n1) neighbors.set(ea[e], (n1 = []));
		n1.push(eb[e]);
		let n2 = neighbors.get(eb[e]);
		if (!n2) neighbors.set(eb[e], (n2 = []));
		n2.push(ea[e]);
	}

	const MAX_ALIGN_DEG = 60;

	const isPlausibleContinuation = (i, j) => {
		const bearingIJ = bearingDeg(coords[i], coords[j]);
		const bearingsI = endpointBearings.get(i);
		if (!bearingsI || bearingsI.length === 0) return false;
		let okI = false;
		for (const b of bearingsI) {
			if (angleDiffDeg(bearingIJ, b) <= MAX_ALIGN_DEG) {
				okI = true;
				break;
			}
		}
		if (!okI) return false;
		const jsNeighbors = neighbors.get(j);
		if (!jsNeighbors || jsNeighbors.length === 0) return false;
		for (const k of jsNeighbors) {
			if (
				angleDiffDeg(bearingIJ, bearingDeg(coords[j], coords[k])) <=
				MAX_ALIGN_DEG
			) {
				return true;
			}
		}
		return false;
	};

	for (const i of endpointNodes) {
		const [lat, lon] = coords[i];
		const cx = Math.floor(lat / epGridSize);
		const cy = Math.floor(lon / epGridSize);
		const candidates = [];
		for (let dx = -1; dx <= 1; dx++) {
			for (let dy = -1; dy <= 1; dy++) {
				const cell = allGrid.get(`${cx + dx},${cy + dy}`);
				if (!cell) continue;
				for (const j of cell) {
					if (j === i) continue;
					const ek = `${Math.min(i, j)}|${Math.max(i, j)}`;
					if (adjSet.has(ek)) continue;
					const d = haversineKm(coords[i], coords[j]);
					if (d <= endpointToleranceKm) candidates.push({ j, d });
				}
			}
		}
		candidates.sort((a, b) => a.d - b.d);
		let connected = -1;
		for (let c = 0; c < candidates.length && c < 8; c++) {
			if (isPlausibleContinuation(i, candidates[c].j)) {
				connected = candidates[c].j;
				break;
			}
		}
		if (connected >= 0) {
			const ek = `${Math.min(i, connected)}|${Math.max(i, connected)}`;
			adjSet.add(ek);
			ea.push(i);
			eb.push(connected);
			ed.push(haversineKm(coords[i], coords[connected]));
			erefs.push([]); // Endpoint-snap edges have no line association
		}
	}

	const nodeLines = new Array(coords.length);
	for (let e = 0; e < ea.length; e++) {
		for (const u of [ea[e], eb[e]]) {
			if (!nodeLines[u]) nodeLines[u] = new Set();
			for (const r of erefs[e]) nodeLines[u].add(r);
		}
	}

	const nodeCount = coords.length;
	const edgeCount = ea.length;

	const degree = new Int32Array(nodeCount);
	for (let e = 0; e < edgeCount; e++) {
		degree[ea[e]]++;
		degree[eb[e]]++;
	}

	const start = new Int32Array(nodeCount + 1);
	for (let i = 0; i < nodeCount; i++) start[i + 1] = start[i] + degree[i];

	const cursor = Int32Array.from(start);
	const adjEdge = new Int32Array(edgeCount * 2);
	const adjOther = new Int32Array(edgeCount * 2);
	const adjDist = new Float64Array(edgeCount * 2);
	for (let e = 0; e < edgeCount; e++) {
		let p = cursor[ea[e]]++;
		adjEdge[p] = e;
		adjOther[p] = eb[e];
		adjDist[p] = ed[e];
		p = cursor[eb[e]]++;
		adjEdge[p] = e;
		adjOther[p] = ea[e];
		adjDist[p] = ed[e];
	}

	return {
		coords,
		start,
		adjEdge,
		adjOther,
		adjDist,
		erefs,
		coordIndex,
		nodeLines,
	};
}

export function makeNearestNode(graph, gridSize = 0.02, maxKm = 3.0) {
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

	return (point, allowedLines = null) => {
		const [lat, lon] = point;
		const cx = Math.floor(lat / gridSize);
		const cy = Math.floor(lon / gridSize);
		let bestIdx = -1;
		let bestDist = Infinity;

		for (let r = 0; r <= 10; r++) {
			for (let dx = -r; dx <= r; dx++) {
				for (let dy = -r; dy <= r; dy++) {
					if (r > 0 && Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
					const cell = grid.get(`${cx + dx},${cy + dy}`);
					if (!cell) continue;
					for (const idx of cell) {
						if (allowedLines) {
							const lines = graph.nodeLines[idx];
							let ok = false;
							if (lines) {
								for (const l of lines) {
									if (allowedLines.has(l)) {
										ok = true;
										break;
									}
								}
							}
							if (!ok) continue;
						}
						const d = haversineKm(graph.coords[idx], point);
						if (d < bestDist) {
							bestDist = d;
							bestIdx = idx;
						}
					}
				}
			}
			if (bestIdx >= 0 && bestDist < maxKm) break;
		}

		return { index: bestIdx, distKm: bestDist };
	};
}

export function makeRouter(graph) {
	const { coords, start, adjEdge, adjOther, adjDist, erefs } = graph;
	const n = coords.length;

	const dist = new Float64Array(n);
	const prev = new Int32Array(n);
	const done = new Uint32Array(n);
	let stamp = 0;

	let heapF = new Float64Array(4096);
	let heapG = new Float64Array(4096);
	let heapN = new Int32Array(4096);
	let heapSize = 0;

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

	const push = (f, g, node) => {
		if (heapSize === heapF.length) grow();
		let c = heapSize++;
		heapF[c] = f;
		heapG[c] = g;
		heapN[c] = node;
		while (c > 0) {
			const p = (c - 1) >> 1;
			if (heapF[p] <= heapF[c]) break;
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

	const pop = () => {
		const rf = heapF[0];
		const rg = heapG[0];
		const rn = heapN[0];
		heapSize--;
		if (heapSize > 0) {
			heapF[0] = heapF[heapSize];
			heapG[0] = heapG[heapSize];
			heapN[0] = heapN[heapSize];
			let c = 0;
			for (;;) {
				const l = 2 * c + 1;
				const r = 2 * c + 2;
				let m = c;
				if (l < heapSize && heapF[l] < heapF[m]) m = l;
				if (r < heapSize && heapF[r] < heapF[m]) m = r;
				if (m === c) break;
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

	return function route(startIdx, endIdx, lineFilter) {
		stamp++;
		dist.fill(Infinity);
		dist[startIdx] = 0;
		prev[startIdx] = -1;
		heapSize = 0;
		push(haversineKm(coords[startIdx], coords[endIdx]), 0, startIdx);

		const filterSet = Array.isArray(lineFilter)
			? new Set(lineFilter)
			: lineFilter
				? new Set([lineFilter])
				: null;

		while (heapSize > 0) {
			const [, g, u] = pop();
			if (done[u] === stamp) continue;
			done[u] = stamp;
			if (u === endIdx) break;
			if (g > dist[u]) continue;

			for (let p = start[u]; p < start[u + 1]; p++) {
				const e = adjEdge[p];
				const refs = erefs[e];
				const v = adjOther[p];
				if (done[v] === stamp) continue;

				let edgeCost = adjDist[p];
				if (filterSet && refs.length > 0) {
					const onPreferred = refs.some((r) => filterSet.has(r));
					if (!onPreferred) edgeCost *= 10;
				}

				const ng = g + edgeCost;
				if (ng < dist[v]) {
					dist[v] = ng;
					prev[v] = u;
					push(ng + haversineKm(coords[v], coords[endIdx]), ng, v);
				}
			}
		}

		if (done[endIdx] !== stamp) return null;

		const pathIdx = [];
		for (let u = endIdx; u !== -1; u = prev[u]) pathIdx.push(u);
		pathIdx.reverse();
		return pathIdx;
	};
}
