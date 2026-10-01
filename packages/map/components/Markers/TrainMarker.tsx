import { useMantineColorScheme } from "@mantine/core";
import type { Train } from "@simrail/types";
import L from "leaflet";
import {
	memo,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ComponentRef,
} from "react";
import { Tooltip } from "react-leaflet";
import ReactLeafletDriftMarker from "react-leaflet-drift-marker";

import { getSteamProfileOrBot } from "@/components/steam";

import TrainText from "../TrainText";
import HoverPopup from "./HoverPopup";

type TrainMarkerProps = {
	train: Train;
	stoppedSince?: number;
	isSelected: boolean;
	selectTrain: (train: Train) => void;
};

const TrainMarker = ({
	train,
	stoppedSince,
	isSelected,
	selectTrain,
}: TrainMarkerProps) => {
	const [avatar, setAvatar] = useState<string | null>(null);
	const [username, setUsername] = useState<string | null>(null);
	const [bearing, setBearing] = useState<number | null>(null);
	const [isPopupOpen, setIsPopupOpen] = useState(false);
	const previousPosition = useRef<[number, number] | null>(null);
	const markerRef = useRef<ComponentRef<typeof ReactLeafletDriftMarker>>(null);

	useEffect(() => {
		let active = true;
		getSteamProfileOrBot(train.TrainData.ControlledBySteamID)
			.then(([avatarUrl, profileName]) => {
				if (active) {
					setAvatar(avatarUrl);
					setUsername(profileName);
				}
			})
			.catch(() => {
				if (active) setUsername("Unknown");
			});

		return () => {
			active = false;
		};
	}, [train.TrainData.ControlledBySteamID]);

	useEffect(() => {
		const current: [number, number] = [
			train.TrainData.Latititute,
			train.TrainData.Longitute,
		];
		const previous = previousPosition.current;
		previousPosition.current = current;

		if (!previous || Math.round(train.TrainData.Velocity) === 0) return;

		const latitude1 = (previous[0] * Math.PI) / 180;
		const latitude2 = (current[0] * Math.PI) / 180;
		const longitudeDelta = ((current[1] - previous[1]) * Math.PI) / 180;
		const latitudeDelta = current[0] - previous[0];
		const longitudeChange = current[1] - previous[1];

		// Ignore coordinate jitter while a train is effectively stationary.
		if (Math.hypot(latitudeDelta, longitudeChange) < 0.00001) return;

		const y = Math.sin(longitudeDelta) * Math.cos(latitude2);
		const x =
			Math.cos(latitude1) * Math.sin(latitude2) -
			Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta);
		setBearing(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
	}, [
		train.TrainData.Latititute,
		train.TrainData.Longitute,
		train.TrainData.Velocity,
	]);

	const { colorScheme } = useMantineColorScheme();

	let botIcon = "/markers/icon-bot-simrail.jpg";
	if (
		colorScheme === "dark" ||
		(colorScheme === "auto" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches)
	)
		botIcon = "/markers/icon-bot-simrail-dark.jpg";

	const borderAreaClass = train.TrainData.InBorderStationArea
		? " in-border-area"
		: "";
	const avatarUrl =
		train.TrainData.ControlledBySteamID && avatar ? avatar : botIcon;
	const escapedAvatarUrl = avatarUrl.replace(
		/[&"'<>]/g,
		(character) =>
			({
				"&": "&amp;",
				'"': "&quot;",
				"'": "&#39;",
				"<": "&lt;",
				">": "&gt;",
			})[character] ?? character,
	);
	// The bearing changes on nearly every update of a moving train. It isn't
	// part of the icon: a new icon makes Leaflet rebuild the marker's DOM
	// (avatar image included), so the arrow is rotated in place instead.
	const hasBearing = bearing !== null;
	const icon = useMemo(
		() =>
			L.divIcon({
				html: `<span class="train-direction-arrow" aria-hidden="true"></span><img class="steam-avatar${borderAreaClass}" src="${escapedAvatarUrl}" alt="">`,
				iconSize: [34, 34],
				iconAnchor: [17, 17],
				popupAnchor: [0, -17],
				className: `train-direction-marker${isSelected ? " is-selected" : ""}${hasBearing ? "" : " direction-unknown"}`,
			}),
		[hasBearing, borderAreaClass, escapedAvatarUrl, isSelected],
	);

	// Runs after the marker's own effects, so its (possibly new) icon element
	// is already on the map.
	useEffect(() => {
		const arrow = markerRef.current
			?.getElement()
			?.querySelector<HTMLElement>(".train-direction-arrow");
		if (arrow) arrow.style.transform = `rotate(${bearing ?? 0}deg)`;
	}, [bearing, icon, username]);

	if (!username || !train.TrainData.Latititute || !train.TrainData.Longitute)
		return null;

	return (
		<ReactLeafletDriftMarker
			ref={markerRef}
			key={train.TrainNoLocal}
			icon={icon}
			position={[train.TrainData.Latititute, train.TrainData.Longitute]}
			zIndexOffset={40}
			duration={500}
			eventHandlers={{
				mouseover: (event) => event.target.openPopup(),
				mouseout: (event) => event.target.closePopup(),
				mouseup: () => selectTrain(train),
				popupopen: () => setIsPopupOpen(true),
				popupclose: () => setIsPopupOpen(false),
			}}
		>
			<HoverPopup className="train-map-popup" minWidth={280}>
				{isPopupOpen && (
					<TrainText
						train={train}
						username={username}
						avatar={avatar}
						minified={true}
						stoppedSince={stoppedSince}
					/>
				)}
			</HoverPopup>

			<Tooltip
				className="train-number-tooltip"
				offset={[0, -10]}
				direction="top"
				opacity={0.8}
				permanent
			>
				{train.TrainNoLocal}
			</Tooltip>
		</ReactLeafletDriftMarker>
	);
};

export default memo(TrainMarker);
