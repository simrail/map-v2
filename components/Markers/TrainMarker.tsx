import L from 'leaflet';
import { Popup, useMapEvents, Tooltip } from "react-leaflet";
import ReactLeafletDriftMarker from "react-leaflet-drift-marker"
import React, { useEffect, useState } from "react";
import { Train } from "@simrail/types";
import { useSelectedTrain } from '../../contexts/SelectedTrainContext';
import TrainText from '../TrainText';
import {getSteamProfileOrBot} from "@/components/steam";

type TrainMarkerProps = {
    train: Train,
}
const TrainMarker = ({ train }: TrainMarkerProps) => {

    const { setSelectedTrain } = useSelectedTrain()

    const [avatar, setAvatar] = useState<string | null>(null)
    const [username, setUsername] = useState<string | null>(null)

    const getData = React.useCallback((maybeSteamId: string | null) => {
        return getSteamProfileOrBot(maybeSteamId).then(([avatarUrl, username]) => {
            setAvatar(avatarUrl);
            setUsername(username);
        })
    }, [])

    useEffect(() => {
        getData(train.TrainData.ControlledBySteamID)
            .catch(() => setTimeout(() => getData(train.TrainData.ControlledBySteamID), 1000))
    }, [train.TrainData.ControlledBySteamID])



    let icon = L.icon({
        iconUrl: (train.TrainData.ControlledBySteamID && avatar) ? avatar : '/markers/icon-bot-simrail.jpg',
        iconSize: [24, 24],
        popupAnchor: [0, -12],
        className: 'steam-avatar'
    });


    useMapEvents({
        click() {
            setSelectedTrain(null)
        },
    })


    if (!username) return null;

    return <ReactLeafletDriftMarker
        key={train.TrainNoLocal}
        icon={icon}
        position={[train.TrainData.Latititute, train.TrainData.Longitute]}
        zIndexOffset={40}
        duration={500}
        eventHandlers={{
            mouseover: (event) => event.target.openPopup(),
            mouseout: (event) => event.target.closePopup(),
            mouseup: (event) => setSelectedTrain(train)
        }}

    >
        <Popup>
            <TrainText train={train} username={username} details={false} server={''} avatar={avatar} />
        </Popup>
        <Tooltip offset={[2, -10]} direction={"top"} opacity={0.8} permanent={true}>{train.TrainNoLocal}</Tooltip>
    </ReactLeafletDriftMarker>
}

export default React.memo(TrainMarker)



export function getTrainImagePath(train: Train): string {
    var [prefix, suffix] = train.Vehicles[0].split('/');
    return `/trains/${suffix}.png`;
}
