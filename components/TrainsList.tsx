import TrainMarker from "@/components/Markers/TrainMarker";
import {Train} from "@simrail/types";
import {FC} from "react";

type Props = {
    trains: Train[];
}

export const TrainsList: FC<Props> = ({trains}) => (
    <>
        {trains.map(train => {
            return (
            train.TrainData.Latititute !== null || train.TrainData.Longitute !== null ? (
                    <TrainMarker key={train.TrainNoLocal} train={train} />
                ) : null // Might be a bit more optimal to not even try and render invalid trains 
            );
        })}
    </>
);