import type { Station } from "@simrail/types";
import L from "leaflet";
import { Marker } from "react-leaflet";

import HoverPopup from "./HoverPopup";

import styles from "../../styles/MarkerPopup.module.css";

// Shared by every marker of this kind.
const icon = L.icon({
	iconUrl: "/markers/icon-station-remote.png",
	iconSize: [16, 16],
	popupAnchor: [0, -16],
});

type StationMarkerProps = {
	station: Station;
};

export const RemoteStationMarker = ({ station }: StationMarkerProps) => {
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
			<HoverPopup className="simple-map-popup">
				<div className={styles.simpleCard}>
					<small>Remote station</small>
					<strong>{station.Name}</strong>
					<span>Controlled from {station.id}</span>
				</div>
			</HoverPopup>
		</Marker>
	);
};
