import type { Station } from "@simrail/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { Polyline } from "react-leaflet";

import { useSelectedTrain } from "../contexts/SelectedTrainContext";
import localStations from "./stations.json";
import remoteStations from "./stationsRemote.json";

type RoutePoint = [number, number];

type SelectedTrainRouteProps = {
	serverId: string;
	stations: Station[];
};

type RouteStation = {
	Name: string;
	Prefix?: string;
	id?: string;
	Latititude: number;
	Longitude: number;
};

type TimetablePoint = {
	nameOfPoint?: string;
	indexOfPoint?: number;
};

type RoutingResponse = {
	routes?: Array<{
		geometry?: { coordinates?: [number, number][] };
	}>;
};

const normalizeStationName = (value: string) =>
	value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLocaleLowerCase()
		.replace(/[^a-z0-9]/g, "");

const removeDuplicatePoints = (points: RoutePoint[]) =>
	points.filter((point, index) => {
		if (index === 0) return true;
		const previous = points[index - 1];
		const current = point;
		return previous[0] !== current[0] || previous[1] !== current[1];
	});

const SelectedTrainRoute = ({
	serverId,
	stations,
}: SelectedTrainRouteProps) => {
	const { selectedTrain } = useSelectedTrain();
	const [routeResult, setRouteResult] = useState<{
		key: string;
		points: RoutePoint[];
	}>({ key: "", points: [] });
	const stationIndex = useMemo(() => {
		const index = new Map<string, RoutePoint>();
		const allStations = [
			...(localStations as RouteStation[]),
			...(remoteStations as RouteStation[]),
			...(stations as RouteStation[]),
		];

		for (const station of allStations) {
			if (
				!Number.isFinite(station.Latititude) ||
				!Number.isFinite(station.Longitude)
			)
				continue;

			const position: RoutePoint = [station.Latititude, station.Longitude];
			for (const name of [station.Name, station.Prefix, station.id]) {
				if (name) index.set(normalizeStationName(name), position);
			}
		}

		return index;
	}, [stations]);
	const stationIndexRef = useRef(stationIndex);

	useEffect(() => {
		stationIndexRef.current = stationIndex;
	}, [stationIndex]);

	const trainNumber = selectedTrain?.TrainNoLocal;
	const routeKey = trainNumber ? `${serverId}:${trainNumber}` : "";
	const route = routeResult.key === routeKey ? routeResult.points : [];

	useEffect(() => {
		if (!trainNumber) return;

		const controller = new AbortController();

		const loadRoute = async () => {
			try {
				const selectedStationIndex = stationIndexRef.current;
				const timetableResponse = await fetch(
					`https://simrail-edr.emeraldnetwork.xyz/train/${encodeURIComponent(serverId)}/${encodeURIComponent(trainNumber)}`,
					{ signal: controller.signal },
				);
				if (!timetableResponse.ok)
					throw new Error(
						`Timetable request failed: ${timetableResponse.status}`,
					);
				const timetable = (await timetableResponse.json()) as TimetablePoint[];

				const waypoints = removeDuplicatePoints(
					timetable
						.slice()
						.sort((a, b) => (a.indexOfPoint ?? 0) - (b.indexOfPoint ?? 0))
						.map((point) =>
							point.nameOfPoint
								? selectedStationIndex.get(
										normalizeStationName(point.nameOfPoint),
									)
								: undefined,
						)
						.filter((point): point is RoutePoint => point !== undefined),
				);

				if (waypoints.length < 2) return;

				const coordinates = waypoints
					.map(([latitude, longitude]) => `${longitude},${latitude}`)
					.join(";");
				const routingResponse = await fetch(
					`https://routing.simrail-edr.de/route/v1/train/${coordinates}?overview=full&geometries=geojson`,
					{ signal: controller.signal },
				);
				if (!routingResponse.ok)
					throw new Error(`Route request failed: ${routingResponse.status}`);

				const routingData = (await routingResponse.json()) as RoutingResponse;
				const routeCoordinates =
					routingData.routes?.[0]?.geometry?.coordinates
						?.filter(
							(point): point is [number, number] =>
								Array.isArray(point) &&
								point.length === 2 &&
								point.every(Number.isFinite),
						)
						.map(
							([longitude, latitude]) =>
								[latitude, longitude] as [number, number],
						) ?? [];

				if (!controller.signal.aborted)
					setRouteResult({ key: routeKey, points: routeCoordinates });
			} catch (error) {
				if ((error as Error).name !== "AbortError")
					setRouteResult({ key: routeKey, points: [] });
			}
		};

		void loadRoute();
		return () => controller.abort();
	}, [routeKey, serverId, trainNumber]);

	if (route.length < 2) return null;

	return (
		<>
			<Polyline
				positions={route}
				pathOptions={{ color: "#101217", opacity: 0.7, weight: 5 }}
				interactive={false}
			/>
			<Polyline
				positions={route}
				pathOptions={{ color: "#ffad32", opacity: 0.95, weight: 2 }}
				interactive={false}
			/>
		</>
	);
};

export default SelectedTrainRoute;
