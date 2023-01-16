// @ts-nocheck
import { getTrainImagePath, TrainMarker } from "./TrainMarker";
import { useSelectedTrain } from '../contexts/AppContext';
import Image from 'next/image';
import { AiOutlineClose } from 'react-icons/ai'
import styles from '../styles/SelectedTrainPopup.module.css'

type TrainTextProps = {
    train: Train
    username: string
    avatar: string | null
}

const TrainText = (props: TrainTextProps) => {

    const { train, username } = props;


    return (
        <>
            <Image src={getTrainImagePath(train)} width={"64"} height={"64"} alt={train.Vehicles[0]} /><br />
            Locomotive: {train.Vehicles[0]}<br />
            Train: {train.TrainName} {train.TrainNoLocal}<br />
            User: {username}<br />
            Speed: {Math.round(train.TrainData.Velocity)} km/h<br />
            Departure: {train.StartStation}<br />
            Destination: {train.EndStation}<br />
        </>

    )
}

export default TrainText;
