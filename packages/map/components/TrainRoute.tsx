import L from "leaflet";
import { memo, useEffect, useMemo, useState } from "react";
import { Polyline, Marker, useMap } from "react-leaflet";

import { useSelectedTrain } from "../contexts/SelectedTrainContext";
import { getTrainRoute, type ColoredSegment, type RoutePoint } from "../lib/trainRoute";

const ROUTE_COLORS = {
	green: "#2ecc71",
	red: "#e74c3c",
	grey: "#888888",
} as const;

const ARROW_SPACING_KM = 3;
const MAX_VISIBLE_ARROWS = 120;
const arrowIconCache = new Map<string, L.DivIcon>();

function haversineKm(a: [number, number], b: [number, number]): number {
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

function bearing(a: [number, number], b: [number, number]): number {
	const toRad = (deg: number) => (deg * Math.PI) / 180;
	const toDeg = (rad: number) => (rad * 180) / Math.PI;
	const lat1 = toRad(a[0]);
	const lat2 = toRad(b[0]);
	const dLon = toRad(b[1] - a[1]);
	const y = Math.sin(dLon) * Math.cos(lat2);
	const x =
		Math.cos(lat1) * Math.sin(lat2) -
		Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
	return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

interface ArrowData {
	position: [number, number];
	rotation: number;
	key: string;
}

function createArrowIcon(rotation: number, zoom: number): L.DivIcon {
	const scale = Math.max(0.5, Math.min(2.5, (zoom - 6) / 5));
	const size = Math.round(18 * scale);
	const roundedRotation = Math.round(rotation / 5) * 5;
	const cacheKey = `${size}:${roundedRotation}`;
	const cachedIcon = arrowIconCache.get(cacheKey);
	if (cachedIcon) return cachedIcon;

	// SVG triangle (not a text glyph — font metrics render ">" off-center
	// in Firefox). The shape is centered in the viewBox, so the anchor at
	// the box center is exact in every browser.
	const html = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="display: block; transform: rotate(${roundedRotation}deg); filter: drop-shadow(0 1px 3px rgba(0,0,0,0.7));"><path d="M8 4 L20 12 L8 20 Z" fill="#ffffff"/></svg>`;
	const icon = L.divIcon({
		className: "route-arrow",
		html,
		iconSize: [size, size],
		iconAnchor: [Math.round(size / 2), Math.round(size / 2)],
	});
	arrowIconCache.set(cacheKey, icon);
	return icon;
}

const TrainRoute = () => {
	const { selectedTrain, showTrainRoute } = useSelectedTrain();
	const [segments, setSegments] = useState<ColoredSegment[] | null>(null);
	const map = useMap();
	const [zoom, setZoom] = useState(map.getZoom());
	const [viewportBounds, setViewportBounds] = useState(() =>
		map.getBounds().pad(0.25),
	);

	useEffect(() => {
		const updateViewport = () => {
			setZoom(map.getZoom());
			setViewportBounds(map.getBounds().pad(0.25));
		};
		map.on("moveend zoomend", updateViewport);
		return () => {
			map.off("moveend zoomend", updateViewport);
		};
	}, [map]);

	const serverCode = selectedTrain?.ServerCode ?? null;
	const trainNo = selectedTrain?.TrainNoLocal ?? null;
	const shouldShow = showTrainRoute && !!serverCode && !!trainNo;

	useEffect(() => {
		if (!shouldShow || !serverCode || !trainNo) return;
		let cancelled = false;
		getTrainRoute({ ServerCode: serverCode, TrainNoLocal: trainNo })
			.then((route) => {
				if (!cancelled) setSegments(route);
			})
			.catch(() => {
				if (!cancelled) setSegments(null);
			});
		return () => {
			cancelled = true;
			setSegments(null);
		};
	}, [shouldShow, serverCode, trainNo]);

	const arrows = useMemo<ArrowData[]>(() => {
		if (!segments) return [];
		const result: ArrowData[] = [];
		let distSinceLast = ARROW_SPACING_KM;
		let prev: RoutePoint | null = null;
		for (let si = 0; si < segments.length; si++) {
			const pts = segments[si].points;
			if (pts.length < 1) continue;
			// If this segment doesn't chain onto the previous point, reset.
			if (!prev || prev[0] !== pts[0][0] || prev[1] !== pts[0][1]) {
				prev = pts[0];
				distSinceLast = ARROW_SPACING_KM;
			}
			for (let i = 1; i < pts.length; i++) {
				const a = pts[i - 1];
				const b = pts[i];
				const segLen = haversineKm(a, b);
				if (segLen <= 0) continue;
				const brng = bearing(a, b);
				let consumed = 0;
				while (distSinceLast + (segLen - consumed) >= ARROW_SPACING_KM) {
					const need = ARROW_SPACING_KM - distSinceLast;
					const t = (consumed + need) / segLen;
					const pos: RoutePoint = [
						a[0] + (b[0] - a[0]) * t,
						a[1] + (b[1] - a[1]) * t,
					];
					result.push({
						position: pos,
						rotation: brng - 90,
						key: `arrow-${result.length}`,
					});
					consumed += need;
					distSinceLast = 0;
				}
				distSinceLast += segLen - consumed;
				prev = b;
			}
		}
		return result;
	}, [segments]);

	const visibleArrows = useMemo(() => {
		const inView = arrows.filter((arrow) =>
			viewportBounds.contains(arrow.position),
		);
		if (inView.length <= MAX_VISIBLE_ARROWS) return inView;

		const step = inView.length / MAX_VISIBLE_ARROWS;
		return Array.from(
			{ length: MAX_VISIBLE_ARROWS },
			(_, index) => inView[Math.floor(index * step)],
		);
	}, [arrows, viewportBounds]);

	if (!shouldShow || !segments || segments.length === 0) return null;

	return (
		<>
			{segments.map((seg, i) => (
				<Polyline
					key={`${serverCode}-${trainNo}-${i}`}
					positions={seg.points}
					pathOptions={{
						color: ROUTE_COLORS[seg.color],
						weight: 4,
						opacity: 0.85,
					}}
				/>
			))}
			{visibleArrows.map((arrow) => (
				<Marker
					key={arrow.key}
					position={arrow.position}
					icon={createArrowIcon(arrow.rotation, zoom)}
					interactive={false}
				/>
			))}
		</>
	);
};

export default memo(TrainRoute);
