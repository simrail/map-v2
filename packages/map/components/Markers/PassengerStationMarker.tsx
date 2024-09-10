import L from 'leaflet';
import { Marker, Popup } from "react-leaflet";
import type { NonPlayable } from "@simrail/types";

type NonPlayableMarkerProps = {
    nonPlayable: NonPlayable
}

export const PassengerStationMarker = ({ nonPlayable }: NonPlayableMarkerProps) => {

    let icon: L.Icon<L.IconOptions> | undefined
    switch (nonPlayable.Type) {
        case "PassengerStation": {
            icon = L.icon({
                iconUrl: '/markers/icon-passenger-station.png',
                iconSize: [22, 22],
                popupAnchor: [0, -16],
            });
            break;
        }
        case "PassengerHalt": {
            icon = L.icon({
                iconUrl: '/markers/icon-passenger-station.png',
                iconSize: [16, 16],
                popupAnchor: [0, -16],
            });
            break;
        }
    }

    return <Marker
        icon={icon}
        position={[nonPlayable.Latititude, nonPlayable.Longitude]}
        zIndexOffset={30}
        eventHandlers={{
            mouseover: (event) => event.target.openPopup(),
            mouseout: (event) => event.target.closePopup(),
        }}
    >
        <Popup>
            {nonPlayable.Name}<br />
        </Popup>
    </Marker >

}
