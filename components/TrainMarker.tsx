import L from 'leaflet';
import { Marker, Popup } from "react-leaflet";
import { useEffect, useState } from "react";
import { Train } from "../types/Train";
import { ProfileResponse } from "../pages/api/profile";

type TrainMarkerProps = {
    train: Train
}
export const TrainMarker = (props: TrainMarkerProps) => {

    const { train } = props


    const [avatar, setAvatar] = useState<string | null>(null)
    const [username, setUsername] = useState<string | null>(null)

    useEffect(() => {


        async function getData() {
            if (train.TrainData.ControlledBySteamID) {
                let avatarRequest = await fetch('/api/profile?steamid=' + train.TrainData.ControlledBySteamID);
                let profile: ProfileResponse = await avatarRequest.json();
                setAvatar(profile.avatarUrl)
                setUsername(profile.username)
            } else {
                setUsername("BOT")
            }
        }

        getData();
    }, [])


    let icon;

    if (train.TrainData.ControlledBySteamID && avatar) {
        icon = L.icon({
            iconUrl: avatar,
            iconSize: [24, 24],
            popupAnchor: [0, -12],
            className: 'steam-avatar'
        });
    } else {
        icon = L.icon({
            iconUrl: 'https://cdn.discordapp.com/attachments/352493961153347584/1056616406562652211/bot-simrail.jpg',
            iconSize: [24, 24],
            popupAnchor: [0, -12],
            className: 'steam-avatar'
        });

    }


    if (!username) return null;

    return <Marker
        key={train.TrainNoLocal}
        icon={icon}
        title={"Driver - N°" + train.TrainNoLocal + " - " + username}
        position={[train.TrainData.Latititute, train.TrainData.Longitute]}
    >
        <Popup>
            <div>
                Train: Nᵒ{train.TrainNoLocal}<br />
                Speed: {Math.round(train.TrainData.Velocity)} km/h<br />
                Departure: {train.StartStation}<br />
                Destination: {train.EndStation}<br />
            </div>
        </Popup>
    </Marker>

}
