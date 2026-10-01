import L from "leaflet";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Polyline, useMap } from "react-leaflet";

import { useSelectedTrain } from "../contexts/SelectedTrainContext";
import {
	decodePolyline,
	ROUTE_COLORS,
	type RoutePoint,
} from "../lib/trainRoute";

/** One wiki line, as written by scripts/generate-rail-data.mjs. */
interface LineData {
	title?: string;
	subtitle?: string;
	lkname?: string;
	link?: string;
	/** Encoded polylines, one per track. */
	available: string[];
	unavailable: string[];
}

/** The available or unavailable part of one line, drawn as one layer. */
interface LinePart {
	key: string;
	line: string;
	available: boolean;
	paths: RoutePoint[][];
}

// Highlight colours for the lines under the cursor, in line-number order.
// None is green or red, so they can't be mistaken for availability.
const HIGHLIGHT_COLORS = [
	"#3388ff",
	"#f1c40f",
	"#e91e63",
	"#9b59b6",
	"#00bcd4",
	"#e67e22",
];
// How close to the cursor another line must be to be listed in the tooltip.
const NEARBY_PX = 8;
// Moving between two layers of the same line fires mouseout then mouseover;
// wait this long before treating a mouseout as leaving the line.
const LEAVE_DELAY_MS = 60;

// Dash length of the secondary highlighted lines, in pixels.
const DASH_PX = 12;

// Shared style objects: react-leaflet only restyles a layer when its
// pathOptions object changes, so hovering restyles just the lines involved.
// Leaflet merges styles, so every style sets the dash and cap explicitly.
const baseStyle = (color: string): L.PathOptions => ({
	color,
	weight: 4,
	opacity: 0.85,
	dashArray: undefined,
	lineCap: "round",
});
const STYLES = {
	available: baseStyle(ROUTE_COLORS.green),
	unavailable: baseStyle(ROUTE_COLORS.red),
};
const highlightIndex = (i: number) => i % HIGHLIGHT_COLORS.length;

/**
 * Style of the i-th highlighted line (in line-number order). The first is
 * solid; each further line is drawn above it with sparser dashes (covering
 * 1/2, 1/3, 1/4… of its length), so where lines share track every colour
 * shows through. Lines come from different OSM ways, so their dashes can't
 * be aligned; the widening gaps work whatever the phase. Under everything,
 * each dashed line also has a solid copy (underlayStyle), so where it runs
 * alone its gaps are filled rather than showing the map.
 */
const highlightStyles: L.PathOptions[] = [];
const highlightStyle = (i: number) =>
	(highlightStyles[i] ??= {
		color: HIGHLIGHT_COLORS[highlightIndex(i)],
		weight: 6,
		opacity: 0.95,
		dashArray: i === 0 ? undefined : `${DASH_PX} ${DASH_PX * i}`,
		lineCap: i === 0 ? "round" : "butt",
	});
const underlayStyles: L.PathOptions[] = [];
const underlayStyle = (i: number) =>
	(underlayStyles[i] ??= {
		...highlightStyle(0),
		color: highlightStyle(i).color,
	});

const escapeHtml = (text: string) =>
	text.replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			]!,
	);

const byLineNumber = (a: string, b: string) => Number(a) - Number(b);
const sameLines = (a: string[], b: string[]) =>
	a.length === b.length && a.every((line, i) => line === b[i]);

/**
 * "Playable area" map layer: every railway line on the SimRail wiki map,
 * green where it's available in the game and red where it isn't. Hovering
 * gives every line under the cursor a colour of its own and lists them;
 * clicking locks that highlight until the same lines or the map background
 * are clicked again.
 */
const PlayableArea = () => {
	const map = useMap();
	const { selectedTrain, showTrainRoute } = useSelectedTrain();
	const hidden = showTrainRoute && !!selectedTrain;

	const [lines, setLines] = useState<Record<string, LineData> | null>(null);
	// Lines under the cursor, by line number; and a clicked group.
	const [hoveredLines, setHoveredLines] = useState<string[]>([]);
	const [lockedLines, setLockedLines] = useState<string[]>([]);
	const highlighted = hoveredLines.length > 0 ? hoveredLines : lockedLines;

	const layers = useRef(new Map<string, L.Polyline>());
	const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const tooltip = useMemo(
		() =>
			L.tooltip({
				direction: "top",
				offset: [0, -10],
				className: "playable-area-tooltip",
			}),
		[],
	);

	// ~100 KB, so it's loaded on demand rather than bundled with the map.
	useEffect(() => {
		let cancelled = false;
		void import("./playableArea.json").then((data) => {
			if (!cancelled)
				setLines((data.default as { lines: Record<string, LineData> }).lines);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const parts = useMemo<LinePart[]>(() => {
		if (!lines) return [];
		return Object.keys(lines)
			.sort(byLineNumber)
			.flatMap((line) =>
				([true, false] as const).map((available) => ({
					key: `${line}|${available ? "available" : "unavailable"}`,
					line,
					available,
					paths:
						lines[line][available ? "available" : "unavailable"].map(
							decodePolyline,
						),
				})),
			)
			.filter((part) => part.paths.length > 0);
	}, [lines]);

	// Keep the highlighted lines above the others, from the bottom: the
	// underlays of the dashed lines, the solid first line, the dashed lines.
	useEffect(() => {
		const toFront = (keyOf: (part: LinePart) => string, lines: string[]) => {
			for (const line of lines) {
				for (const part of parts) {
					if (part.line === line)
						layers.current.get(keyOf(part))?.bringToFront();
				}
			}
		};
		toFront((part) => `${part.key}|underlay`, highlighted.slice(1));
		toFront((part) => part.key, highlighted);
	}, [highlighted, parts]);

	/** Parts of every line passing within NEARBY_PX of the point. */
	const partsNear = useCallback(
		(latlng: L.LatLng) => {
			const point = map.latLngToLayerPoint(latlng);
			const found: LinePart[] = [];
			for (const part of parts) {
				const layer = layers.current.get(part.key);
				if (!layer) continue;
				// Cheap bounding-box test before measuring the distance.
				const bounds = layer.getBounds();
				const margin = L.point(NEARBY_PX, NEARBY_PX);
				const sw = map.latLngToLayerPoint(bounds.getSouthWest());
				const ne = map.latLngToLayerPoint(bounds.getNorthEast());
				const pixelBounds = L.bounds(
					L.point(sw.x, ne.y).subtract(margin),
					L.point(ne.x, sw.y).add(margin),
				);
				if (!pixelBounds.contains(point)) continue;
				// Leaflet adds the pixel distance to the returned point.
				const closest = layer.closestLayerPoint(point) as L.Point & {
					distance: number;
				};
				if (closest && closest.distance <= NEARBY_PX) found.push(part);
			}
			return found;
		},
		[map, parts],
	);

	/**
	 * Highlights and lists the lines at the cursor. They're sorted by line
	 * number, not hovered-first: the cursor wobbling between two overlapping
	 * lines must not reshuffle the list or the colours.
	 */
	const hoverAt = useCallback(
		(latlng: L.LatLng, hovered: LinePart) => {
			const near = partsNear(latlng).filter((p) => p.line !== hovered.line);
			const listed = [hovered, ...near]
				.filter(
					(part, i, all) => all.findIndex((p) => p.line === part.line) === i,
				)
				.sort((a, b) => byLineNumber(a.line, b.line));
			const listedLines = listed.map((part) => part.line);
			setHoveredLines((prev) =>
				sameLines(prev, listedLines) ? prev : listedLines,
			);

			const html = listed
				.map((part, i) => {
					const info = lines?.[part.line];
					const color = HIGHLIGHT_COLORS[highlightIndex(i)];
					const name = info?.lkname ? ` – ${escapeHtml(info.lkname)}` : "";
					const status = part.available ? "" : " (not in the game)";
					const title = info?.title
						? `<div class="playable-area-title">${escapeHtml(info.title)}</div>`
						: "";
					return `<div class="playable-area-line"><span class="playable-area-swatch" style="background:${color}"></span><div>LK${escapeHtml(part.line)}${name}${status}${title}</div></div>`;
				})
				.join("");
			tooltip.setLatLng(latlng).setContent(html);
			if (!map.hasLayer(tooltip)) tooltip.addTo(map);
		},
		[lines, map, partsNear, tooltip],
	);

	const removeTooltip = useCallback(() => {
		clearTimeout(leaveTimer.current);
		tooltip.remove();
	}, [tooltip]);
	const leaveLine = useCallback(() => {
		removeTooltip();
		setHoveredLines([]);
	}, [removeTooltip]);

	// Clicking the map background releases locked lines.
	useEffect(() => {
		const release = () => setLockedLines([]);
		map.on("click", release);
		return () => {
			map.off("click", release);
		};
	}, [map]);

	// Hidden while a train route is shown. Its layers leave the map without
	// a mouseout, so forget the hovered line here.
	const [wasHidden, setWasHidden] = useState(hidden);
	if (hidden !== wasHidden) {
		setWasHidden(hidden);
		if (hidden) setHoveredLines([]);
	}
	useEffect(() => {
		if (hidden) removeTooltip();
		return removeTooltip;
	}, [hidden, removeTooltip]);

	if (hidden) return null;

	const setLayer = (key: string) => (layer: L.Polyline | null) => {
		if (layer) layers.current.set(key, layer);
		else layers.current.delete(key);
	};

	return (
		<>
			{parts
				.filter((part) => highlighted.indexOf(part.line) > 0)
				.map((part) => (
					<Polyline
						key={`${part.key}|underlay`}
						ref={setLayer(`${part.key}|underlay`)}
						positions={part.paths}
						pathOptions={underlayStyle(highlighted.indexOf(part.line))}
						interactive={false}
					/>
				))}
			{parts.map((part) => (
				<Polyline
					key={part.key}
					ref={setLayer(part.key)}
					positions={part.paths}
					pathOptions={
						highlighted.includes(part.line)
							? highlightStyle(highlighted.indexOf(part.line))
							: part.available
								? STYLES.available
								: STYLES.unavailable
					}
					eventHandlers={{
						mouseover: (e) => {
							clearTimeout(leaveTimer.current);
							hoverAt(e.latlng, part);
						},
						mousemove: (e) => hoverAt(e.latlng, part),
						mouseout: () => {
							clearTimeout(leaveTimer.current);
							leaveTimer.current = setTimeout(leaveLine, LEAVE_DELAY_MS);
						},
						click: (e) => {
							L.DomEvent.stopPropagation(e);
							// Lock what's highlighted; clicking the same lines again releases them.
							setLockedLines((prev) =>
								sameLines(prev, hoveredLines) ? [] : hoveredLines,
							);
						},
					}}
				/>
			))}
		</>
	);
};

export default memo(PlayableArea);
