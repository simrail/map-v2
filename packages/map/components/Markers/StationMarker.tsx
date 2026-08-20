import { useMantineColorScheme } from "@mantine/core";
import type { Station } from "@simrail/types";
import L from "leaflet";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Marker, Popup, Tooltip } from "react-leaflet";

import stationsList from "../EDR_station.json";
import { getSteamProfileOrBot } from "../steam";

import styles from "../../styles/MarkerPopup.module.css";

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
			<Popup className="station-map-popup" minWidth={250}>
				<div className={styles.stationCard}>
					<div className={styles.stationImage}>
						<img src={station.MainImageURL} alt="" width={250} height={104} />
						<span>Difficulty {station.DifficultyLevel}</span>
					</div>
					<div className={styles.stationBody}>
						<small>Dispatch station · {station.Prefix}</small>
						<strong>{station.Name}</strong>
						<div className={styles.operator}>
							<img src={avatar ?? botIcon} alt="" width={30} height={30} />
							<div>
								<small>Controlled by</small>
								<span>{username}</span>
							</div>
						</div>
						<span className={styles.openHint}>Open station in EDR ↗</span>
					</div>
				</div>
			</Popup>
			<Tooltip
				className="station-name-tooltip"
				offset={[0, 20]}
				direction="bottom"
				permanent
			>
				{station.Name}
			</Tooltip>
		</Marker>
	);
};
