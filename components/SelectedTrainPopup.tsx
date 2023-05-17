// @ts-nocheck
import { useSelectedTrain } from '../contexts/SelectedTrainContext';
import { AiOutlineClose } from 'react-icons/ai'
import styles from '../styles/SelectedTrainPopup.module.css'
import { useEffect, useState } from "react";
import TrainText from "./TrainText";
import { useRouter } from "next/router";
import {getSteamProfileOrBot} from "@/components/steam";

const SelectedTrainPopup = () => {

    const { selectedTrain, setSelectedTrain } = useSelectedTrain()


    const [avatar, setAvatar] = useState<string | null>(null)
    const [username, setUsername] = useState<string | null>(null)
    const router = useRouter();
    const { id, trainId } = router.query

    const setData = ([avatarUrl, username]) => { setAvatar(avatarUrl); setUsername(username)};

    useEffect(() => {
        if (selectedTrain) getSteamProfileOrBot(selectedTrain.TrainData.ControlledBySteamID)
            .then(setData)
    }, [selectedTrain])

    return selectedTrain
        ? <div className={styles.popup}>
                <AiOutlineClose onClick={() => {
                    setSelectedTrain(null);
                    if (trainId) router.replace('/server/' + id);
                }} size={32} className={styles.closeButton} />
                <TrainText train={selectedTrain} username={username} details={true} server={id} avatar={avatar} /></div>
        : null
}

export default SelectedTrainPopup;
