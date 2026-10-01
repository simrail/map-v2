import railDataJson from "../components/railData.json";

export type RoutePoint = [number, number];

export interface ColoredSegment {
	color: "green" | "red" | "grey";
	points: RoutePoint[];
}

interface RailData {
	knownStations: string[];
	stations: Record<string, number[]>;
	/** Polyline per station pair "a|b" (a < b), drawn from a to b. */
	segments: Record<string, string>;
	/** Colour runs per segment: [first point index, colour code]. */
	segmentColors: Record<string, [number, number][]>;
	/**
	 * Replacement for the joint between two legs "p|s|n" (p < n) where plain
	 * concatenation would be wrong: drop `cut[0]` points from the end of the
	 * p→s leg and `cut[1]` from the start of the s→n leg, and put `points`
	 * (drawn p-side to n-side, colour runs in `colors`) in between.
	 */
	joins: Record<
		string,
		{ cut: [number, number]; points: string; colors: [number, number][] }
	>;
}

/** Map colours of route pieces, shared with the Playable area layer. */
export const ROUTE_COLORS = {
	green: "#2ecc71",
	red: "#e74c3c",
	grey: "#888888",
} as const;

const COLOR_NAMES = ["green", "red", "grey"] as const;

/** Colour of each stretch between consecutive points, from colour runs. */
function stretchColors(
	pointCount: number,
	runs: [number, number][],
): ColoredSegment["color"][] {
	return Array.from({ length: Math.max(0, pointCount - 1) }, (_, p) => {
		let code = runs[0][1];
		for (const [start, c] of runs) if (start <= p) code = c;
		return COLOR_NAMES[code] ?? "grey";
	});
}

const railData = railDataJson as unknown as RailData;

const knownSet = new Set(railData.knownStations);

const EDR_TIMETABLE_URL = "https://simrail-edr.emeraldnetwork.xyz/train";

function normalizeName(name: string): string {
	return name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function decodePolyline(str: string): RoutePoint[] {
	let idx = 0;
	let lat = 0;
	let lon = 0;
	const pts: RoutePoint[] = [];
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

interface TimetableStop {
	nameOfPoint?: string;
	nameForPerson?: string;
	line?: number;
}

const timetableCache = new Map<string, Promise<TimetableStop[] | null>>();

function cacheSuccessfulResult<T>(
	cache: Map<string, Promise<T | null>>,
	key: string,
	load: () => Promise<T | null>,
): Promise<T | null> {
	const cached = cache.get(key);
	if (cached) return cached;

	const request = load().then(
		(result) => {
			if (result === null) cache.delete(key);
			return result;
		},
		(error) => {
			cache.delete(key);
			throw error;
		},
	);
	cache.set(key, request);
	return request;
}

function fetchTimetable(
	serverCode: string,
	trainNo: string,
): Promise<TimetableStop[] | null> {
	const key = `${serverCode}|${trainNo}`;
	return cacheSuccessfulResult(timetableCache, key, async () => {
		try {
			const response = await fetch(
				`${EDR_TIMETABLE_URL}/${encodeURIComponent(serverCode)}/${encodeURIComponent(trainNo)}`,
			);
			if (!response.ok) return null;
			const timetable: unknown = await response.json();
			return Array.isArray(timetable) && timetable.length > 0
				? (timetable as TimetableStop[])
				: null;
		} catch {
			return null;
		}
	});
}

interface ResolvedStop {
	coord: RoutePoint;
	name: string;
	isKnown: boolean;
	line: number;
}

const routeCache = new Map<string, Promise<ColoredSegment[] | null>>();

export function getTrainRoute(train: {
	ServerCode: string;
	TrainNoLocal: string;
}): Promise<ColoredSegment[] | null> {
	const key = `${train.ServerCode}|${train.TrainNoLocal}`;
	return cacheSuccessfulResult(routeCache, key, () => computeRoute(train));
}

async function computeRoute(train: {
	ServerCode: string;
	TrainNoLocal: string;
}): Promise<ColoredSegment[] | null> {
	const stops = await fetchTimetable(train.ServerCode, train.TrainNoLocal);
	if (!stops || stops.length < 2) return null;

	const resolved: ResolvedStop[] = [];
	for (const stop of stops) {
		const name = stop.nameOfPoint || stop.nameForPerson;
		if (!name) continue;
		const norm = normalizeName(name);
		const coordArr = railData.stations[norm];
		if (!coordArr) continue;
		// A station listed twice in a row is one stop, as in the generator.
		if (resolved[resolved.length - 1]?.name === norm) continue;
		resolved.push({
			coord: [coordArr[0], coordArr[1]],
			name: norm,
			isKnown: knownSet.has(norm),
			line: stop.line ?? 0,
		});
	}

	let first = -1;
	let last = -1;
	for (let i = 0; i < resolved.length; i++) {
		if (resolved[i].isKnown) {
			if (first < 0) first = i;
			last = i;
		}
	}
	if (first < 0 || last <= first) return null;

	const effective = resolved.slice(first, last + 1);
	if (effective.length < 2) return null;

	// The route as one point list; colors[i] is the colour of the stretch
	// from points[i] to points[i + 1], null where nothing is drawn.
	const points: RoutePoint[] = [];
	const colors: (ColoredSegment["color"] | null)[] = [];
	const append = (
		pts: RoutePoint[],
		pieceColors: ColoredSegment["color"][],
	) => {
		pts.forEach((p, i) => {
			if (i > 0) colors.push(pieceColors[i - 1]);
			points.push(p);
		});
	};
	// Whether the previous leg ended at the current stop along the tracks.
	let prevLegRouted = false;

	for (let i = 0; i < effective.length - 1; i++) {
		const a = effective[i];
		const b = effective[i + 1];

		const key = a.name < b.name ? `${a.name}|${b.name}` : `${b.name}|${a.name}`;
		const encoded = railData.segments[key];

		if (!encoded) {
			prevLegRouted = false;
			// Skip grey lines when either stop has line 0 (off the drivable
			// network). These stations often have wrong wiki coordinates
			// (e.g. Koło is misplaced near Łęczyca), creating misleading
			// long grey lines.
			// Also skip them at the beginning or end of the route — there's
			// nothing to connect to, so they just dangle.
			if (
				a.line === 0 ||
				b.line === 0 ||
				i === 0 ||
				i === effective.length - 2
			) {
				continue;
			}
			if (points.length > 0) colors.push(null);
			append([a.coord, b.coord], ["grey"]);
			continue;
		}

		let legPts = decodePolyline(encoded);
		let legColors = stretchColors(
			legPts.length,
			railData.segmentColors[key] ?? [[0, 0]],
		);
		if (a.name > b.name) {
			legPts.reverse();
			legColors.reverse();
		}

		const prev = effective[i - 1];
		if (prevLegRouted && prev && prev.name !== b.name) {
			const forward = prev.name < b.name;
			const join =
				railData.joins[
					forward
						? `${prev.name}|${a.name}|${b.name}`
						: `${b.name}|${a.name}|${prev.name}`
				];
			if (join) {
				const [cutIn, cutOut] = forward ? join.cut : [join.cut[1], join.cut[0]];
				points.splice(points.length - cutIn);
				colors.splice(colors.length - cutIn);
				const joinPts = decodePolyline(join.points);
				const joinColors = stretchColors(joinPts.length, join.colors);
				if (!forward) {
					joinPts.reverse();
					joinColors.reverse();
				}
				points.pop(); // the join starts on it
				append(joinPts, joinColors);
				legPts = legPts.slice(cutOut);
				legColors = legColors.slice(cutOut);
			}
		}

		if (prevLegRouted) {
			// The previous piece ends where this one starts.
			points.pop();
		} else if (points.length > 0) {
			colors.push(null);
		}
		append(legPts, legColors);
		prevLegRouted = true;
	}

	const segments: ColoredSegment[] = [];
	for (let i = 0; i < colors.length; i++) {
		const color = colors[i];
		if (color === null) continue;
		const lastSeg = segments[segments.length - 1];
		if (lastSeg && lastSeg.color === color && colors[i - 1] === color) {
			lastSeg.points.push(points[i + 1]);
		} else {
			segments.push({ color, points: [points[i], points[i + 1]] });
		}
	}
	return segments;
}
