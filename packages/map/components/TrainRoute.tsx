import L from "leaflet";
import { memo, useEffect, useMemo, useState } from "react";
import { Polyline, Marker, useMap } from "react-leaflet";

import { useSelectedTrain } from "../contexts/SelectedTrainContext";
import { getTrainRoute, type ColoredSegment } from "../lib/trainRoute";

const ROUTE_COLORS = {
	green: "#2ecc71",
	red: "#e74c3c",
	grey: "#888888",
} as const;

const ARROW_SPACING_KM = 1;

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

function midpoint(a: [number, number], b: [number, number]): [number, number] {
	return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

interface ArrowData {
	position: [number, number];
	rotation: number;
	key: string;
}

function createArrowIcon(rotation: number, zoom: number): L.DivIcon {
	const scale = Math.max(0.5, Math.min(2.5, (zoom - 6) / 5));
	const size = Math.round(18 * scale);
	// SVG triangle (not a text glyph — font metrics render ">" off-center
	// in Firefox). The shape is centered in the viewBox, so the anchor at
	// the box center is exact in every browser.
	const html = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" style="display: block; transform: rotate(${rotation}deg); filter: drop-shadow(0 1px 3px rgba(0,0,0,0.7));"><path d="M8 4 L20 12 L8 20 Z" fill="#ffffff"/></svg>`;
	return L.divIcon({
		className: "route-arrow",
		html,
		iconSize: [size, size],
		iconAnchor: [Math.round(size / 2), Math.round(size / 2)],
	});
}

const TrainRoute = () => {
	const { selectedTrain, showTrainRoute } = useSelectedTrain();
	const [segments, setSegments] = useState<ColoredSegment[] | null>(null);
	const map = useMap();
	const [zoom, setZoom] = useState(map.getZoom());

	useEffect(() => {
		const onZoom = () => setZoom(map.getZoom());
		map.on("zoomend", onZoom);
		return () => {
			map.off("zoomend", onZoom);
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
		for (let si = 0; si < segments.length; si++) {
			const seg = segments[si];
			const pts = seg.points;
			if (pts.length < 2) continue;
			let distSinceLast = 0;
			for (let i = 1; i < pts.length; i++) {
				const a = pts[i - 1];
				const b = pts[i];
				const segLen = haversineKm(a, b);
				distSinceLast += segLen;
				if (distSinceLast >= ARROW_SPACING_KM) {
					const pos = midpoint(a, b);
					const brng = bearing(a, b);
					const cssRotation = brng - 90;
					result.push({
						position: pos,
						rotation: cssRotation,
						key: `arrow-${si}-${i}`,
					});
					distSinceLast = 0;
				}
			}
		}
		return result;
	}, [segments]);

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
			{arrows.map((arrow) => (
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
