// @ts-nocheck
import { useSelectedTrain } from '../contexts/SelectedTrainContext';
import { AiOutlineClose } from 'react-icons/ai'
import styles from '../styles/SelectedTrainPopup.module.css'
import { useEffect, useState } from "react";
import TrainText from "./TrainText";
import { useRouter } from "next/router";
import {getSteamProfileOrBot} from "@/components/steam";
import { readLocalStorageValue, useLocalStorage } from '@mantine/hooks';

const SelectedTrainPopup = () => {

    const { selectedTrain, setSelectedTrain } = useSelectedTrain()
    const renderPopup = readLocalStorageValue({
        key: 'renderPopup',
        defaultValue: true,
    });

    const [avatar, setAvatar] = useState<string | null>(null)
    const [username, setUsername] = useState<string | null>(null)
    const router = useRouter();
    const { id, trainId } = router.query

    const setData = ([avatarUrl, username]) => { setAvatar(avatarUrl); setUsername(username)};

    // biome-ignore lint/correctness/useExhaustiveDependencies:
    useEffect(() => {
        if (selectedTrain) getSteamProfileOrBot(selectedTrain.TrainData.ControlledBySteamID)
            .then(setData)
    }, [selectedTrain])

    if (renderPopup === true) {
    return selectedTrain
        ? <div className={styles.popup} style={trainId ? {top: '0px'} : {}}>
                <TrainText train={selectedTrain} username={username} avatar={avatar} />
                </div>
        : null
    }
        return null
}

export default SelectedTrainPopup;
