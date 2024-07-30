import { Spotlight, type SpotlightActionGroupData } from "@mantine/spotlight";
import type { Station, Train } from "@simrail/types";
import { useSelectedTrain } from "contexts/SelectedTrainContext";
import { LatLng } from "leaflet";
import { useEffect, useRef, useState } from "react";
import { MdSearch } from "react-icons/md";
import { useMap } from "react-leaflet";
import { getSteamProfileOrBot } from "./steam";

type SpotlightSearchProps = {
	trains: Train[];
	stations: Station[];
};

class user {
	username = "";
	steamID = "";
	constructor(username: string, steamID: string) {
		this.username = username;
		this.steamID = steamID;
	}
}
export const usernames: user[] = [];

export default function SpotlightSearch({
	trains,
	stations,
}: SpotlightSearchProps) {
	const map = useMap();
	const [spotlightActions, setSpotlightActions] = useState<
		SpotlightActionGroupData[]
	>([]);
	const { setSelectedTrain } = useSelectedTrain();
	const usernamesCache = useRef<Map<string, string>>(new Map());
	const [open, setOpen] = useState(false);

	async function getUsernames(userIDs: (string | null | undefined)[]) {
		for (let i = 0; i < userIDs.length; i++) {
			const steamID = userIDs[i];
			if (steamID && !usernamesCache.current.has(steamID)) {
				const profile = await getSteamProfileOrBot(steamID);
				if (profile[1]) {
					usernamesCache.current.set(steamID, profile[1]);
				}
			}
		}
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies:
	useEffect(() => {
		const actionsGroups: SpotlightActionGroupData[] = [];

		if (!open) return;

		const userIDs = [];
		for (let i = 0; i < trains.length; i++) {
			if (trains[i].Type === "user" && trains[i] != null)
				userIDs.push(trains[i].TrainData.ControlledBySteamID);
		}
		for (let i = 0; i < stations.length; i++) {
			if (stations[i].DispatchedBy[0])
				userIDs.push(stations[i].DispatchedBy[0].SteamId);
		}

		getUsernames(userIDs);

		if (trains) {
			actionsGroups.push({
				group: "Trains",
				actions: trains.map((train, index) => {
					let username = "Bot";

					if (train.TrainData.ControlledBySteamID) {
						username =
							usernamesCache.current.get(train.TrainData.ControlledBySteamID) ??
							"Unknown";
					}

					return {
						id: `train-${index}`,
						label: `${train.TrainNoLocal} - ${train.TrainName}`,
						description: `Drived by ${username} `,
						onClick: () => {
							setSelectedTrain(train);
							map?.setZoom(13);
						},
					};
				}),
			});
		}

		if (stations) {
			actionsGroups.push({
				group: "Stations",
				actions: stations.map((station, index) => {
					let username = "Bot";

					if (station.DispatchedBy[0]) {
						username =
							usernamesCache.current.get(station.DispatchedBy[0].SteamId) ??
							"Unknown";
					}

					return {
						id: `station-${index}`,
						label: `${station.Name} - ${station.Prefix}`,
						description: `Controlled by ${username}`,
						onClick: () => {
							map?.panTo(new LatLng(station.Latititude, station.Longitude));
							map?.setZoom(13);
						},
					};
				}),
			});
		}

		setSpotlightActions(actionsGroups);
	}, [trains, stations, open, map?.panTo, setSelectedTrain, map?.setZoom]);

	return (
		<Spotlight
			actions={spotlightActions}
			nothingFound="Nothing found..."
			highlightQuery
			styles={{
				actionLabel: {
					color: "var(--mantine-color-text)",
				},
			}}
			onSpotlightOpen={() => setOpen(true)}
			onSpotlightClose={() => setOpen(false)}
			limit={5}
			searchProps={{
				leftSection: <MdSearch />,
				placeholder: "Search players, trains and stations...",
			}}
		/>
	);
}
