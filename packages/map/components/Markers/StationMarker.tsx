import { Space, useMantineColorScheme } from "@mantine/core";
import type { Station } from "@simrail/types";
import L from "leaflet";
import { useEffect, useState } from "react";
import { Marker, Popup, Tooltip } from "react-leaflet";
import type { ProfileResponse } from "types/SteamProfile";

type StationMarkerProps = {
	station: Station;
};

export const StationMarker = ({ station }: StationMarkerProps) => {
	const [avatar, setAvatar] = useState<string | null>(null);
	const [username, setUsername] = useState<string | null>(null);

	useEffect(() => {
		async function getData() {
			if (station.DispatchedBy[0]) {
				const avatarRequest = await fetch(
					`https://simrail-edr.emeraldnetwork.xyz/steam/${station.DispatchedBy[0].SteamId}`,
				);
				const profile: ProfileResponse = await avatarRequest.json();
				setAvatar(profile.avatar);
				setUsername(profile.personaname);
			} else {
				setAvatar(null);
				setUsername("BOT");
			}
		}
		getData().catch((
			error => console.log("Failed to get user BOT or Player, error: ", error)
		));
	}, [station.DispatchedBy?.[0]]);

	const { colorScheme } = useMantineColorScheme();

	let botIcon = "/markers/icon-bot-simrail.jpg";
	if (colorScheme === "dark") botIcon = "/markers/icon-bot-simrail-dark.jpg";

	const icon = L.icon({
		iconUrl: station.DispatchedBy[0] && avatar ? avatar : botIcon,
		iconSize: [32, 32],
		popupAnchor: [0, -16],
		className: "station-avatar",
	});

	if (!username) return null;

	return (
		<Marker
			key={station.id}
			icon={icon}
			position={[station.Latititude, station.Longitude]}
			zIndexOffset={50}
			eventHandlers={{
				mouseover: (event) => event.target.openPopup(),
				mouseout: (event) => event.target.closePopup(),
			}}
		>
			<Popup>
				<img
					src={station.MainImageURL}
					alt={station.Name}
					width={200}
					height={86}
					style={{ borderRadius: "6px" }}
				/>
				<br />
				<Space h="sm" />
				Station: {station.Name}
				<br />
				User: {username}
				<br />
				Difficulty: {station.DifficultyLevel}
				<br />
			</Popup>
			<Tooltip offset={[3, 20]} direction={"bottom"} permanent={true}>
				{station.Name}
			</Tooltip>
		</Marker>
	);
};
