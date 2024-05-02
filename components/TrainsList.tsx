import TrainMarker from "@/components/Markers/TrainMarker";
import {Train} from "@simrail/types";
import {FC} from "react";

type Props = {
    trains: Train[];
}

export const TrainsList: FC<Props> = ({trains}) =>
    <>{trains.map(train => (<TrainMarker key={train.TrainNoLocal} train={train} />))}</>