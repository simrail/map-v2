// @ts-nocheck
import { getTrainImagePath } from "./Markers/TrainMarker";
import Image from 'next/image';

type TrainTextProps = {
    train: Train
    username: string
    avatar: string | null
}

const TrainText = ({ train, username }: TrainTextProps) => {

    return (
        <>
            <Image src={getTrainImagePath(train)} width={"256"} height={"108"} alt={train.Vehicles[0]} class="train-image" /><br />
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
