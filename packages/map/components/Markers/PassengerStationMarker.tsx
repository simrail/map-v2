import type { Station } from "@simrail/types";
import L from "leaflet";
import { Marker } from "react-leaflet";

import HoverPopup from "./HoverPopup";

import styles from "../../styles/MarkerPopup.module.css";

// Shared by every marker of this kind.
const icon = L.icon({
	iconUrl: "/markers/icon-station-passenger.png",
	iconSize: [16, 16],
	popupAnchor: [0, -16],
});

type StationMarkerProps = {
	station: Station;
};

export const PassengerStationMarker = ({ station }: StationMarkerProps) => {
	return (
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
					<small>Passenger station</small>
					<strong>{station.Name}</strong>
				</div>
			</HoverPopup>
		</Marker>
	);
};
