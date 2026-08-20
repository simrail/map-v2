import type { Signal } from "@simrail/types";
import L from "leaflet";
import { Marker, Popup } from "react-leaflet";

import styles from "../../styles/MarkerPopup.module.css";

type SignalMarkerProps = {
	signal: Signal;
};

export const SignalMarker = ({ signal }: SignalMarkerProps) => {
	const icon = L.icon({
		iconUrl: "/markers/icon-signal.png",
		iconSize: [16, 16],
		popupAnchor: [0, -16],
	});

	return (
		<Marker
			key={signal.Name}
			icon={icon}
			position={[signal.Latitude, signal.Longitude]}
			zIndexOffset={30}
			eventHandlers={{
				mouseover: (event) => event.target.openPopup(),
				mouseout: (event) => event.target.closePopup(),
			}}
		>
			<Popup className="simple-map-popup">
				<div className={styles.simpleCard}>
					<small>Signal</small>
					<strong>{signal.Name}</strong>
				</div>
			</Popup>
		</Marker>
	);
};
