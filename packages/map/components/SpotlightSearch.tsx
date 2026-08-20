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

	useEffect(() => {
		if (!open) return;
		let active = true;

		const loadActions = async () => {
			const userIds = new Set<string>();
			for (const train of trains) {
				if (train.Type === "user" && train.TrainData.ControlledBySteamID) {
					userIds.add(train.TrainData.ControlledBySteamID);
				}
			}
			for (const station of stations) {
				const steamId = station.DispatchedBy[0]?.SteamId;
				if (steamId) userIds.add(steamId);
			}

			await Promise.all(
				[...userIds].map(async (steamId) => {
					if (usernamesCache.current.has(steamId)) return;
					try {
						const [, profileName] = await getSteamProfileOrBot(steamId);
						usernamesCache.current.set(steamId, profileName);
					} catch {
						usernamesCache.current.set(steamId, "Unknown");
					}
				}),
			);

			if (!active) return;
			const actionsGroups: SpotlightActionGroupData[] = [];
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
						description: `Driven by ${username} `,
						onClick: () => {
							setSelectedTrain(train);
							map?.setZoom(13);
						},
					};
				}),
			});
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
			setSpotlightActions(actionsGroups);
		};

		void loadActions();
		return () => {
			active = false;
		};
	}, [map, open, setSelectedTrain, stations, trains]);

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
