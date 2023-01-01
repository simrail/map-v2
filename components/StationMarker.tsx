import L from 'leaflet';
import { Marker, Popup, Tooltip } from "react-leaflet";
import { useEffect, useState } from "react";
import { Station } from "../types/Station";
import { ProfileResponse } from "../pages/api/profile";

type StationMarkerProps = {
    station: Station
}
export const StationMarker = (props: StationMarkerProps) => {


    const { station } = props

    const [avatar, setAvatar] = useState<string | null>(null)
    const [username, setUsername] = useState<string | null>(null)

    useEffect(() => {

        if (!station.DispatchedBy[0]) {
            setAvatar(null);
            setUsername("BOT");
            return
        }

        async function getToken() {
            let avatarRequest = await fetch('/api/profile?steamid=' + station.DispatchedBy[0].SteamId);
            let profile: ProfileResponse = await avatarRequest.json();
            setAvatar(profile.avatarUrl)
            setUsername(profile.username)
        }
        getToken();
    }, [])



    let icon;


    if (station.DispatchedBy[0] && avatar) {

        icon = L.icon({
            iconUrl: avatar,
            iconSize: [32, 32],
            popupAnchor: [0, -16],
            className: 'station-avatar'
        });
    } else {
        icon = L.icon({
            iconUrl: 'https://cdn.discordapp.com/attachments/352493961153347584/1056616406562652211/bot-simrail.jpg',
            iconSize: [32, 32],
            popupAnchor: [0, -16],
            className: 'station-avatar'
        });

    }


    if (!username) return null;


    return <Marker
        key={station.id}
        icon={icon}
        title={"Traffic Dispatcher - " + station.Name + " - " + username}
        position={[station.Latititude, station.Longitude]}
        zIndexOffset={50}
    >
        <Tooltip

            offset={[3, 20]} direction={"bottom"} permanent={true}>{station.Name}</Tooltip>

        {/*<Popup>*/}
        {/*    <b>{station.Name}</b>*/}
        {/*    /!*Driver: {train.}*!/*/}
        {/*</Popup>*/}
    </Marker>

}
