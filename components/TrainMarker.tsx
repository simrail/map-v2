import L from 'leaflet';
import { Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import { useEffect, useState } from "react";
import { Train } from "../types/Train";
import { ProfileResponse } from "../pages/api/profile";
import Image from 'next/image';
import { useSelectedTrain } from '../contexts/AppContext';

type TrainMarkerProps = {
    train: Train,
}
export const TrainMarker = (props: TrainMarkerProps) => {

    const { train } = props

    const { selectedTrain, setSelectedTrain } = useSelectedTrain()


    const map = useMap();

    const [avatar, setAvatar] = useState<string | null>(null)
    const [username, setUsername] = useState<string | null>(null)

    useEffect(() => {

        getData()

        async function getData() {
            if (train.TrainData.ControlledBySteamID) {
                let avatarRequest = await fetch('/api/profile?steamid=' + train.TrainData.ControlledBySteamID);
                let profile: ProfileResponse = await avatarRequest.json();
                setAvatar(profile.avatarUrl)
                setUsername(profile.username)
            } else {
                setUsername("BOT")
                setAvatar(null)
            }
        }

        const interval = setInterval(() => {
            getData()
        }, 30000)

        return () => clearInterval(interval)


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

    useMapEvents({
        click() {
            setSelectedTrain(null)
        },
    })


    if (!username) return null;


    function updateSelectedTrain(train: Train) {
        setSelectedTrain(train)
    }

    return <Marker
        key={train.TrainNoLocal}
        icon={icon}
        position={[train.TrainData.Latititute, train.TrainData.Longitute]}
        eventHandlers={{
            mouseover: (event) => event.target.openPopup(),
            mouseout: (event) => event.target.closePopup(),
            mouseup: (event) => updateSelectedTrain(train)
        }}

    >
        <Popup>

            <div>
                <Image src={getTrainImagePath(train)} width={"64"} height={"64"} alt={train.Vehicles[0]} /><br />
                Locomotive: {train.Vehicles[0]}<br />
                Train: {train.TrainName} {train.TrainNoLocal}<br />
                User: {username}<br />
                Speed: {Math.round(train.TrainData.Velocity)} km/h<br />
                Departure: {train.StartStation}<br />
                Destination: {train.EndStation}<br />
            </div>
        </Popup>
    </Marker>

}



export function getTrainImagePath(train: Train): string {
    let trains = {
        'Pendolino/ED250-018 Variant': '/trains/ED250.png', // DONE
        'Elf/EN76-006': '/trains/EN76.png', // DONE
        '4E/4E': '/trains/4EC.png', // DONE
        'Traxx/E186-134': '/trains/E186.png', // DONE
        'Traxx/Traxx': '/trains/E186.png', // DONE
        '4E/EP07-135': '/trains/EP07.png', // DONE
        '4E/EU07-096': '/trains/EP07.png', // DONE
        'Elf/EN96-001': '/trains/EN76.png', // DONE
    }

    // @ts-ignore
    return trains[train.Vehicles[0]]
}
