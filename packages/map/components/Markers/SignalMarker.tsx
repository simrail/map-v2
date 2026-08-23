import type { Signal } from "@simrail/types";
import { memo } from "react";
import { CircleMarker, Popup } from "react-leaflet";

import styles from "../../styles/MarkerPopup.module.css";

type SignalMarkerProps = {
	signal: Signal;
};

const signalStyle = {
	color: "#111820",
	weight: 1.5,
	fillColor: "#f5f7fa",
	fillOpacity: 0.95,
};

export const SignalMarker = memo(({ signal }: SignalMarkerProps) => {
	return (
		<CircleMarker
			center={[signal.Latitude, signal.Longitude]}
			radius={5}
			pathOptions={signalStyle}
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
		</CircleMarker>
	);
});

SignalMarker.displayName = "SignalMarker";
