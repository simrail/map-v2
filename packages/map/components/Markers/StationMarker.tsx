import { Space, useMantineColorScheme } from "@mantine/core";
import type { Station } from "@simrail/types";
import L from "leaflet";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Marker, Popup, Tooltip } from "react-leaflet";
import stationsList from "../EDR_station.json";
import { getSteamProfileOrBot } from "../steam";

type StationMarkerProps = {
	station: Station;
};

export const StationMarker = ({ station }: StationMarkerProps) => {
	const [avatar, setAvatar] = useState<string | null>(null);
	const [username, setUsername] = useState<string | null>(null);

	const router = useRouter();
	const pathname = usePathname();
	const steamId = station.DispatchedBy[0]?.SteamId;

	useEffect(() => {
		let active = true;
		getSteamProfileOrBot(steamId)
			.then(([avatarUrl, profileName]) => {
				if (active) {
					setAvatar(avatarUrl);
					setUsername(profileName);
				}
			})
			.catch(() => {
				if (active) {
					setAvatar(null);
					setUsername("Unknown");
				}
			});

		return () => {
			active = false;
		};
	}, [steamId]);

	const { colorScheme } = useMantineColorScheme();

	let botIcon = "/markers/icon-bot-simrail.jpg";
	if (
		colorScheme === "dark" ||
		(colorScheme === "auto" &&
			window.matchMedia("(prefers-color-scheme: dark)").matches)
	)
		botIcon = "/markers/icon-bot-simrail-dark.jpg";

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
				click: () => {
					// Find the corresponding station in the JSON file
					const stationEntry = Object.values(stationsList).find(
						(entry) => entry.srName === station.Name,
					);

					if (stationEntry) {
						router.push(
							`https://edr.simrail.app/${pathname.split("/")[2]}/station/${
								stationEntry.id
							}`,
						);
					} else {
						// Fallback to old behavior if station not found
						router.push(
							`https://edr.simrail.app/${
								pathname.split("/")[2]
							}/station/${station.Prefix.toUpperCase()}`,
						);
					}
				},
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
			<Tooltip offset={[0, 20]} direction={"bottom"} permanent={true}>
				{station.Name}
			</Tooltip>
		</Marker>
	);
};
