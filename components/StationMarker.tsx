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

        async function getData() {
            let avatarRequest = await fetch('/api/profile?steamid=' + station.DispatchedBy[0].SteamId);
            let profile: ProfileResponse = await avatarRequest.json();
            setAvatar(profile.avatarUrl)
            setUsername(profile.username)
        }

        const interval = setInterval(() => {
            getData()
        }, 30000)

        return () => clearInterval(interval)


    }, [])


    let icon;

    let defaultAvatarUrl = 'https://cdn.discordapp.com/attachments/352493961153347584/1056616406562652211/bot-simrail.jpg';

    icon = L.icon({
        iconUrl: (station.DispatchedBy[0] && avatar ? avatar : defaultAvatarUrl),
        iconSize: [32, 32],
        popupAnchor: [0, -16],
        className: 'station-avatar'
    });

    if (!username) return null;


    return <Marker
        key={station.id}
        icon={icon}
        title={"Traffic Dispatcher - " + station.Name + " - " + username}
        position={[station.Latititude, station.Longitude]}
        zIndexOffset={50}
    >
        <Tooltip offset={[3, 20]} direction={"bottom"} permanent={true}>{station.Name}</Tooltip>
    </Marker>

}
