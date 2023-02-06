import L from 'leaflet';
import { Marker, Popup, Tooltip } from "react-leaflet";
import { useEffect, useState } from "react";
import { Station } from "@simrail/types";
import { ProfileResponse } from "../../pages/api/profile";
import Image from 'next/image';
import { Space } from '@mantine/core';

type StationMarkerProps = {
    station: Station
}

export const StationMarker = ({ station }: StationMarkerProps) => {

    const [avatar, setAvatar] = useState<string | null>(null)
    const [username, setUsername] = useState<string | null>(null)

    useEffect(() => {
        async function getData() {
            if (station.DispatchedBy[0]) {
                let avatarRequest = await fetch('/api/profile?steamid=' + station.DispatchedBy[0].SteamId);
                let profile: ProfileResponse = await avatarRequest.json();
                setAvatar(profile.avatarUrl)
                setUsername(profile.username)
            } else {
                setAvatar(null);
                setUsername("BOT");
            }

        }
        getData();
    }, [station.DispatchedBy?.[0]?.SteamId])


    let icon = L.icon({
        iconUrl: (station.DispatchedBy[0] && avatar ? avatar : '/markers/icon-bot-simrail.jpg'),
        iconSize: [32, 32],
        popupAnchor: [0, -16],
        className: 'station-avatar'
    });

    if (!username) return null;


    return <Marker
        key={station.id}
        icon={icon}
        position={[station.Latititude, station.Longitude]}
        zIndexOffset={50}
        eventHandlers={{
            mouseover: (event) => event.target.openPopup(),
            mouseout: (event) => event.target.closePopup(),
        }}
    >
        <Popup>
            <Image src={"/stations/" + station.id + '.jpg'} alt={station.Name} width={200} height={75} style={{ borderRadius: '6px' }} /><br />
            <Space h="sm" />
            Station: {station.Name}<br />
            User: {username}<br />
        </Popup>
        <Tooltip offset={[3, 20]} direction={"bottom"} permanent={true}>{station.Name}</Tooltip>
    </Marker >

}
