import type { Station } from "@simrail/types";
import L from "leaflet";
import { Marker } from "react-leaflet";

import HoverPopup from "./HoverPopup";

import styles from "../../styles/MarkerPopup.module.css";

type StationMarkerProps = {
	station: Station;
};

export const NonPlayableStationMarker = ({ station }: StationMarkerProps) => {
	const icon = L.icon({
		iconUrl: "/markers/icon-train-station.png",
		iconSize: [16, 16],
		popupAnchor: [0, -16],
	});

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
					<small>Unplayable station</small>
					<strong>{station.Name}</strong>
				</div>
			</HoverPopup>
		</Marker>
	);
};
