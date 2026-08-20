import { Tooltip as MantineTooltip, type TooltipProps } from "@mantine/core";
import { useFullscreen, useLocalStorage } from "@mantine/hooks";
import type { Station, Train } from "@simrail/types";
import { DISCORD_INVITE_URL } from "common/links";
import type { LayersControlEvent, Map as LeafletMap } from "leaflet";
import { useRouter } from "next/router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FaDiscord, FaGithub } from "react-icons/fa";
import "leaflet-defaulticon-compatibility";

import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css";
import "leaflet/dist/leaflet.css";
import {
	MdFullscreen,
	MdFullscreenExit,
	MdOutlineTraffic,
	MdSatellite,
	MdSatelliteAlt,
	MdSpeakerNotes,
	MdSpeakerNotesOff,
	MdTraffic,
	MdZoomIn,
	MdZoomOut,
} from "react-icons/md";
import {
	LayerGroup,
	LayersControl,
	MapContainer,
	TileLayer,
} from "react-leaflet";
import Control from "react-leaflet-custom-control";

import NonPlayableStations from "@/components/NonPlayableStations";
import RemoteStations from "@/components/RemoteStations";
import { TrainsList } from "@/components/TrainsList";

import { useSelectedTrain } from "../contexts/SelectedTrainContext";
import { StationMarker } from "./Markers/StationMarker";
import SelectedTrainPopup from "./SelectedTrainPopup";
import { MainlineSignals, OtherSignals } from "./Signals";
import SneakpeekMarkers from "./Sneakpeeks";
import SpotlightSearch from "./SpotlightSearch";

import style from "../styles/BottomLeftControls.module.css";
import mapStyles from "../styles/Map.module.css";

type MapProps = {
	serverId: string | string[];
};

const getTrainStopKey = (train: Train) => train.id ?? train.TrainNoLocal;

const Tooltip = ({ label, children }: TooltipProps) => (
	<MantineTooltip label={label} position="right" zIndex={99999}>
		{children}
	</MantineTooltip>
);

const LeaftletMap = ({ serverId }: MapProps) => {
	const [map, setMap] = useState<LeafletMap | null>(null);

	const router = useRouter();

	const { trainId } = router.query;

	const [trains, setTrains] = useState<Train[] | null>(null);
	const [trainError, setTrainError] = useState(false);
	const [stationError, setStationError] = useState(false);
	const trainsRequestPending = useRef(false);
	const stationsRequestPending = useRef(false);

	const [renderPopup, setRenderPopup] = useLocalStorage({
		key: "renderPopup",
		defaultValue: true,
	});

	const [showSignalInfo, setShowSignalInfo] = useLocalStorage({
		key: "showSignalInfo",
		defaultValue: true,
	});

	const [isSatellite, setIsSatellite] = useLocalStorage({
		key: "isSatellite",
		defaultValue: false,
	});

	const { toggle: toggleFullscreen, fullscreen } = useFullscreen();
	const FullscreenIcon = fullscreen ? MdFullscreenExit : MdFullscreen;

	const ShowSignalStatusIcon =
		showSignalInfo === true ? MdTraffic : MdOutlineTraffic;
	const RenderPopupIcon =
		renderPopup === true ? MdSpeakerNotes : MdSpeakerNotesOff;
	const SatelliteIcon = isSatellite === true ? MdSatellite : MdSatelliteAlt;

	const { selectedTrain, setSelectedTrain } = useSelectedTrain();
	const [stations, setStations] = useState<Station[] | null>(null);
	const [stoppedTrainsSince, setStoppedTrainsSince] = useState<
		Record<string, number>
	>({});

	const getTrains = useCallback(
		async (signal?: AbortSignal) => {
			if (trainsRequestPending.current) return;
			trainsRequestPending.current = true;
			try {
				const response = await fetch(
					`https://panel.simrail.eu:8084/trains-open?serverCode=${String(serverId)}`,
					{ signal },
				);
				if (!response.ok)
					throw new Error(`Train request failed: ${response.status}`);
				const fetchedTrains = (await response.json()) as { data: Train[] };
				const trainsData = fetchedTrains.data;

				setStoppedTrainsSince((previousStoppedTrainsSince) => {
					const nextStoppedTrainsSince: Record<string, number> = {};

					for (const train of trainsData) {
						const trainKey = getTrainStopKey(train);
						const isStopped = Math.round(train.TrainData.Velocity) === 0;

						if (isStopped) {
							nextStoppedTrainsSince[trainKey] =
								previousStoppedTrainsSince[trainKey] ?? Date.now();
						}
					}

					return nextStoppedTrainsSince;
				});

				setTrains(trainsData);
				setTrainError(false);
			} catch (error) {
				if ((error as Error).name !== "AbortError") setTrainError(true);
			} finally {
				trainsRequestPending.current = false;
			}
		},
		[serverId],
	);

	const getStations = useCallback(
		async (signal?: AbortSignal) => {
			if (stationsRequestPending.current) return;
			stationsRequestPending.current = true;
			try {
				const response = await fetch(
					`https://panel.simrail.eu:8084/stations-open?serverCode=${String(serverId)}`,
					{ signal },
				);
				if (!response.ok)
					throw new Error(`Station request failed: ${response.status}`);
				const fetchedStations = (await response.json()) as { data: Station[] };
				setStations(fetchedStations.data);
				setStationError(false);
			} catch (error) {
				if ((error as Error).name !== "AbortError") setStationError(true);
			} finally {
				stationsRequestPending.current = false;
			}
		},
		[serverId],
	);

	useEffect(() => {
		if (selectedTrain && map && trains) {
			const updatedTrain = trains.find(
				(train) => getTrainStopKey(train) === getTrainStopKey(selectedTrain),
			);
			if (!updatedTrain) {
				setSelectedTrain(null);
				return;
			}

			if (updatedTrain !== selectedTrain) {
				setSelectedTrain(updatedTrain);
			}
			map.panTo(
				[updatedTrain.TrainData.Latititute, updatedTrain.TrainData.Longitute],
				{ animate: true, duration: 0.8, easeLinearity: 0.4 },
			);
		}
	}, [trains, selectedTrain, map, setSelectedTrain]);

	useEffect(() => {
		if (trainId) {
			const requestedTrain = trains?.find(
				(train) => train.TrainNoLocal === trainId,
			);
			if (requestedTrain) {
				setSelectedTrain(requestedTrain);
				map?.setZoom(13);
			}
		}
	}, [trains, map, trainId, setSelectedTrain]);

	useEffect(() => {
		const controller = new AbortController();
		const refreshTrains = () => {
			if (document.visibilityState === "visible") {
				void getTrains(controller.signal);
			}
		};
		const refreshStations = () => {
			if (document.visibilityState === "visible") {
				void getStations(controller.signal);
			}
		};

		const initialTrainRefresh = window.setTimeout(refreshTrains, 0);
		const initialStationRefresh = window.setTimeout(refreshStations, 0);

		const interval1 = window.setInterval(refreshTrains, 2000);

		const interval2 = window.setInterval(refreshStations, 10000);

		return () => {
			controller.abort();
			window.clearTimeout(initialTrainRefresh);
			window.clearTimeout(initialStationRefresh);
			window.clearInterval(interval1);
			window.clearInterval(interval2);
		};
	}, [getTrains, getStations]);

	useEffect(() => {
		if (!map) return;

		const handleOverlayAdd = (event: LayersControlEvent) => {
			localStorage.setItem(`layer-${event.name.toLowerCase()}`, "true");
		};

		const handleOverlayRemove = (event: LayersControlEvent) => {
			localStorage.setItem(`layer-${event.name.toLowerCase()}`, "false");
		};

		const clearSelectedTrain = () => setSelectedTrain(null);

		map.on("overlayadd", handleOverlayAdd);
		map.on("overlayremove", handleOverlayRemove);
		map.on("click", clearSelectedTrain);

		return () => {
			map.off("overlayadd", handleOverlayAdd);
			map.off("overlayremove", handleOverlayRemove);
			map.off("click", clearSelectedTrain);
		};
	}, [map, setSelectedTrain]);

	const dataError = trainError || stationError;

	if (!trains || !stations)
		return (
			<main className={mapStyles.loading}>
				<div className={mapStyles.loadingPulse} aria-hidden="true" />
				<h1>Connecting to {String(serverId).toUpperCase()}</h1>
				<p>
					{dataError
						? "Live data is taking longer than expected. Retrying automatically…"
						: "Loading trains and dispatch stations…"}
				</p>
			</main>
		);

	return (
		<>
			{dataError && (
				<div className={mapStyles.connectionWarning} role="status">
					Live updates interrupted — reconnecting…
				</div>
			)}
			<SelectedTrainPopup
				stoppedSince={
					selectedTrain
						? stoppedTrainsSince[getTrainStopKey(selectedTrain)]
						: undefined
				}
			/>
			<MapContainer
				center={[50.270908, 19.039993]}
				zoom={10}
				ref={setMap}
				scrollWheelZoom={true}
				zoomControl={false}
				style={{ height: "100vh", width: "100vw" }}
			>
				<Control position="bottomleft">
					<div className={style.container}>
						<Tooltip label="Our GitHub" position="right">
							<a
								href="https://github.com/simrail/map-v2"
								rel="noreferrer"
								target="_blank"
								className={style.icon}
							>
								<FaGithub color="white" size={32} />
							</a>
						</Tooltip>

						<Tooltip label="Our Discord (French)" position="right">
							<a
								href={DISCORD_INVITE_URL}
								rel="noreferrer"
								target="_blank"
								className={[style.icon, style.discord].join(" ")}
							>
								<FaDiscord color="white" size={32} />
							</a>
						</Tooltip>

						{map && (
							<>
								<Tooltip label="Zoom in" position="right">
									<button
										type="button"
										className={style.icon}
										onClick={() => map.zoomIn()}
										aria-label="Zoom in"
									>
										<MdZoomIn size={24} />
									</button>
								</Tooltip>
								<Tooltip label="Zoom out" position="right">
									<button
										type="button"
										className={style.icon}
										onClick={() => map.zoomOut()}
										aria-label="Zoom out"
									>
										<MdZoomOut size={24} />
									</button>
								</Tooltip>
							</>
						)}
						<Tooltip
							label={`${renderPopup ? "Hide" : "Show"} train pop-up`}
							position="right"
						>
							<button
								type="button"
								className={style.icon}
								onClick={() => setRenderPopup((prevState) => !prevState)}
								aria-label={`${renderPopup ? "Hide" : "Show"} train pop-up`}
								aria-pressed={renderPopup}
							>
								<RenderPopupIcon size={24} />
							</button>
						</Tooltip>
						<Tooltip
							label={`${showSignalInfo ? "Hide" : "Show"} more signal info`}
							position="right"
						>
							<button
								type="button"
								className={style.icon}
								onClick={() => setShowSignalInfo((prevState) => !prevState)}
								aria-label={`${showSignalInfo ? "Hide" : "Show"} signal details`}
								aria-pressed={showSignalInfo}
							>
								<ShowSignalStatusIcon size={24} />
							</button>
						</Tooltip>

						<Tooltip
							label={
								isSatellite ? "Switch to OSM view" : "Switch to satellite view"
							}
							position="right"
						>
							<button
								type="button"
								className={style.icon}
								onClick={() => setIsSatellite((prev) => !prev)}
								aria-label={
									isSatellite
										? "Switch to map view"
										: "Switch to satellite view"
								}
								aria-pressed={isSatellite}
							>
								<SatelliteIcon size={24} />
							</button>
						</Tooltip>

						<Tooltip
							label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
							position="right"
						>
							<button
								type="button"
								className={style.icon}
								onClick={() => toggleFullscreen()}
								aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
							>
								<FullscreenIcon size={24} />
							</button>
						</Tooltip>
					</div>
				</Control>

				{isSatellite ? (
					<>
						<TileLayer
							attribution={`Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGS, and the GIS User Community | &copy; <a href="http://www.openrailwaymap.org/">OpenRailwayMap</a> | <a href="${DISCORD_INVITE_URL}">Created by SimRail France 🇫🇷 Community</a>`}
							url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
						/>
						<TileLayer
							url="https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png"
							opacity={0.6}
							attribution='&copy; <a href="http://www.openrailwaymap.org/">OpenRailwayMap</a>'
						/>
					</>
				) : (
					<TileLayer
						attribution={`&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="http://www.openrailwaymap.org/">OpenRailwayMap</a> | <a href="${DISCORD_INVITE_URL}">Created by SimRail France 🇫🇷 Community</a>`}
						url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
					/>
				)}

				<LayersControl position="bottomright" collapsed={false}>
					<LayersControl.Overlay
						checked={
							localStorage.getItem("layer-trains") === null ||
							localStorage.getItem("layer-trains") === "true"
						}
						name="Trains"
					>
						<LayerGroup>
							<TrainsList
								trains={trains}
								stoppedTrainsSince={stoppedTrainsSince}
							/>
						</LayerGroup>
					</LayersControl.Overlay>

					<LayersControl.Overlay
						checked={localStorage.getItem("layer-mainline-signals") === "true"}
						name="Mainline signals"
					>
						<LayerGroup>
							<MainlineSignals />
						</LayerGroup>
					</LayersControl.Overlay>

					<LayersControl.Overlay
						checked={localStorage.getItem("layer-other-signals") === "true"}
						name="Other signals"
					>
						<LayerGroup>
							<OtherSignals />
						</LayerGroup>
					</LayersControl.Overlay>

					<LayersControl.Overlay
						checked={
							localStorage.getItem("layer-dispatch stations") === null ||
							localStorage.getItem("layer-dispatch stations") === "true"
						}
						name="Dispatch stations"
					>
						<LayerGroup>
							{stations.map((station) => (
								<StationMarker key={station.Name} station={station} />
							))}
						</LayerGroup>
					</LayersControl.Overlay>

					<LayersControl.Overlay
						checked={
							localStorage.getItem("layer-remote dispatch stations") === null ||
							localStorage.getItem("layer-remote dispatch stations") === "true"
						}
						name="Remote dispatch stations"
					>
						<LayerGroup>
							<RemoteStations />
						</LayerGroup>
					</LayersControl.Overlay>

					<LayersControl.Overlay
						checked={
							localStorage.getItem("layer-unplayable dispatch stations") ===
								null ||
							localStorage.getItem("layer-unplayable dispatch stations") ===
								"true"
						}
						name="Unplayable dispatch stations"
					>
						<LayerGroup>
							<NonPlayableStations />
						</LayerGroup>
					</LayersControl.Overlay>

					<LayersControl.Overlay
						checked={
							localStorage.getItem("layer-signalling (not 100% accurate)") ===
							"true"
						}
						name="Signalling (Not 100% accurate)"
					>
						<LayerGroup>
							<TileLayer
								url="https://{s}.tiles.openrailwaymap.org/signals/{z}/{x}/{y}.png"
								// Looks a bit wired in dark mode due to .css putting everything in a greyscale but it is still possible to differ the signalling systems.
							/>
						</LayerGroup>
					</LayersControl.Overlay>

					<LayersControl.Overlay
						checked={
							localStorage.getItem("layer-track speed (not 100% accurate)") ===
							"true"
						}
						name="Track Speed (Not 100% accurate)"
					>
						<LayerGroup>
							<TileLayer
								url="https://{s}.tiles.openrailwaymap.org/maxspeed/{z}/{x}/{y}.png"
								// Looks a bit wired in dark mode due to .css putting everything in a greyscale but it is still possible to differ the signalling systems.
							/>
						</LayerGroup>
					</LayersControl.Overlay>

					<LayersControl.Overlay
						checked={localStorage.getItem("layer-sneakpeeks") === "true"}
						name="Sneakpeeks"
					>
						<LayerGroup>
							<SneakpeekMarkers />
						</LayerGroup>
					</LayersControl.Overlay>
				</LayersControl>
				<SpotlightSearch stations={stations} trains={trains} />
			</MapContainer>
		</>
	);
};

export default LeaftletMap;
