import L from 'leaflet';
import { Marker, Popup } from "react-leaflet";
import type { NonPlayable } from "@simrail/types";

type NonPlayableMarkerProps = {
    nonPlayable: NonPlayable
}

export const NonPlayableDispatchPostMarker = ({ nonPlayable }: NonPlayableMarkerProps) => {

    const icon = L.icon({
        iconUrl: '/markers/icon-train-station.png',
        iconSize: [16, 16],
        popupAnchor: [0, -16],
    });
    

    let displayText: string
    if (nonPlayable.Prefix === "") {
        displayText = `${nonPlayable.Name}`
    } else {
        displayText = `${nonPlayable.Name} [${nonPlayable.Prefix}]`
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
            {displayText}<br />
        </Popup>
    </Marker >

}
