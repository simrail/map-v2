import L from 'leaflet';
import { Popup, useMapEvents, Tooltip } from "react-leaflet";
import ReactLeafletDriftMarker from "react-leaflet-drift-marker"
import React, { useEffect, useState } from "react";
import { Train } from "@simrail/types";
import { useSelectedTrain } from '../../contexts/SelectedTrainContext';
import TrainText from '../TrainText';
import {getSteamProfileOrBot} from "@/components/steam";
import style from '../../styles/SearchInput.module.css';

type TrainMarkerProps = {
    train: Train,
}
const TrainMarker = ({ train }: TrainMarkerProps) => {

    const renderPopup = localStorage.getItem('renderPopup') === 'true';

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


    if (!username || !train.TrainData.Latititute || !train.TrainData.Longitute) return null;

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
        <TrainText train={train} username={username} avatar={avatar} />
    </Popup>

    <Tooltip offset={[2, -10]} direction={"top"} opacity={0.8} permanent={true}>{train.TrainNoLocal}</Tooltip>
    </ReactLeafletDriftMarker>
}

export default React.memo(TrainMarker)



export function getTrainImagePath(train: string): string {
    let trains = { // Order after images names so we can keep track of it instead of whatever last order was
        'Dragon2/E6ACTa-014': '/trains/E6ACTa-014.png',
        'Dragon2/E6ACTa-016': '/trains/E6ACTa-016.png',
        'Dragon2/E6ACTadb-027': '/trains/E6ACTadb-027.png',

        'Traxx/E186-134': '/trains/E186-134.png',
        'Traxx/E186-929': '/trains/E186-929.png',

        'Pendolino/ED250-018 Variant': '/trains/ED250-018.png',

        'EN57/EN57-009': '/trains/EN57-009.png',
        'EN57/EN57-1000': '/trains/EN57-1000.png',
        'EN57/EN57-1003': '/trains/EN57-1003.png',
        'EN57/EN57-1051': '/trains/EN57-1051.png',
        'EN57/EN57-1219': '/trains/EN57-1219.png',
        'EN57/EN57-1316': '/trains/EN57-1316.png',
        'EN57/EN57-1752': '/trains/EN57-1752.png',
        'EN57/EN57-1796': '/trains/EN57-1796.png',
        'EN57/EN71-005': '/trains/EN71-005.png',
        'EN57/EN71-011': '/trains/EN71-011.png',

        'Elf/EN76-006': '/trains/EN76-006.png',
        'Elf/EN76-022': '/trains/EN76-022.png',
        'Elf/EN96-001': '/trains/EN96-001.png',

        '4E/EP07-135': '/trains/EP07-135.png',
        '4E/EP07-174': '/trains/EP07-174.png',

        '4E/EP08-001': '/trains/EP08-001.png',
        '4E/EP08-013': '/trains/EP08-013.png',

        '201E/ET22-243': '/trains/ET22-243.png',
        '201E/ET22-256': '/trains/ET22-256.png',
        '201E/ET22-644': '/trains/ET22-644.png',
        '201E/ET22-836': '/trains/ET22-836.png',
        '201E/ET22-911': '/trains/ET22-911.png',
        '201E/ET22-1163': '/trains/ET22-1163.png',

        'Dragon2/ET25-002': '/trains/ET25-002.png',

        '4E/EU07-005': '/trains/EU07-005.png',
        '4E/EU07-068': '/trains/EU07-068.png',
        '4E/EU07-085': '/trains/EU07-085.png',
        '4E/EU07-092': '/trains/EU07-092.png',
        '4E/EU07-096': '/trains/EU07-096.png',
        '4E/EU07-241': '/trains/EU07-241.png',

        //Trains that did not have image but looked close enough
        'EN57/EN57-614': '/trains/EN57-1219.png',
        'EN57/EN57-1755': '/trains/EN57-1219.png',

        //Left from last time, not found in the images found in AppData/LocalLow/SimKol/SimRail/Sprites/
        '4E/4E': '/trains/4EC.png', // DONE
        'Traxx/Traxx:G': '/trains/E186.png', // DONE
        'Traxx/Traxx': '/trains/E186.png', // DONE
        '4E/4E:G': '/trains/4EIC-01.png', // DONE
        'Dragon2/ET25-002:G': '/trains/ET25-01.png', // DONE
        'Dragon2/E6ACTad': '/trains/ET25-01.png', // DONE
    }

    // @ts-ignore
    return trains[train]
}
