import { useMantineColorScheme } from "@mantine/core";
import type { Train } from "@simrail/types";
import L from "leaflet";
import { memo, useEffect, useMemo, useState } from "react";
import { Popup, Tooltip } from "react-leaflet";
import ReactLeafletDriftMarker from "react-leaflet-drift-marker";

import { getSteamProfileOrBot } from "@/components/steam";

import { useSelectedTrain } from "../../contexts/SelectedTrainContext";
import TrainText from "../TrainText";

type TrainMarkerProps = {
	train: Train;
	stoppedSince?: number;
};

const TrainMarker = ({ train, stoppedSince }: TrainMarkerProps) => {
	const { setSelectedTrain } = useSelectedTrain();

	const [avatar, setAvatar] = useState<string | null>(null);
	const [username, setUsername] = useState<string | null>(null);

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
	const icon = useMemo(
		() =>
			L.icon({
				iconUrl:
					train.TrainData.ControlledBySteamID && avatar ? avatar : botIcon,
				iconSize: [24, 24],
				popupAnchor: [0, -12],
				className: `steam-avatar${borderAreaClass}`,
			}),
		[avatar, borderAreaClass, botIcon, train.TrainData.ControlledBySteamID],
	);

	if (!username || !train.TrainData.Latititute || !train.TrainData.Longitute)
		return null;

	return (
		<ReactLeafletDriftMarker
			key={train.TrainNoLocal}
			icon={icon}
			position={[train.TrainData.Latititute, train.TrainData.Longitute]}
			zIndexOffset={40}
			duration={500}
			eventHandlers={{
				mouseover: (event) => event.target.openPopup(),
				mouseout: (event) => event.target.closePopup(),
				mouseup: () => setSelectedTrain(train),
			}}
		>
			<Popup>
				<TrainText
					train={train}
					username={username}
					avatar={avatar}
					minified={true}
					stoppedSince={stoppedSince}
				/>
			</Popup>

			<Tooltip
				offset={[0, -10]}
				direction={"top"}
				opacity={0.8}
				permanent={true}
			>
				{train.TrainNoLocal}
			</Tooltip>
		</ReactLeafletDriftMarker>
	);
};

export default memo(TrainMarker);
