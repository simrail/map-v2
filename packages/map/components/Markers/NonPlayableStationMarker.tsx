import L from 'leaflet';
import { Marker, Popup } from "react-leaflet";
import { Station } from "@simrail/types";

type StationMarkerProps = {
    station: Station
}

export const NonPlayableStationMarker = ({ station }: StationMarkerProps) => {

    let icon = L.icon({
        iconUrl: '/markers/icon-train-station.png',
        iconSize: [16, 16],
        popupAnchor: [0, -16],
    });

    let displayText = station.Name
    if (station.Prefix != "") {
        displayText + " [" + station.Prefix + "]"
    }

    return <Marker
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
            {displayText}<br />
        </Popup>
    </Marker >

}
