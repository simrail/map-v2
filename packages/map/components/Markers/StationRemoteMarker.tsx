import type { Station } from "@simrail/types";
import L from "leaflet";
import { Marker, Popup } from "react-leaflet";
import { Space, useMantineColorScheme } from "@mantine/core";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProfileResponse } from "types/SteamProfile";
import stationsList from "../EDR_station.json";

type StationMarkerProps = {
	station: Station;
};

export const RemoteStationMarker = ({ station }: StationMarkerProps) => {
	const icon = L.icon({
		iconUrl: "/markers/icon-station-remote.png",
		iconSize: [16, 16],
		popupAnchor: [0, -16],
	});

	return (
		// make "User: {username}" work in a good way with the data from the station list used in Map.tsx and sync with this station.id
		<Marker
			key={station.id}
			icon={icon}
			position={[station.Latititude, station.Longitude]}
			zIndexOffset={30}
			eventHandlers={{
				mouseover: (event) => event.target.openPopup(),
				mouseout: (event) => event.target.closePopup(),
			}}
		>
			<Popup>
				{station.Name}
				<br />
				Controlled from: {station.id}
				<br />
			</Popup>
		</Marker>
	);
};
