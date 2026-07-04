import TrainMarker from "@/components/Markers/TrainMarker";
import type { Train } from "@simrail/types";
import type { FC } from "react";

type Props = {
	trains: Train[];
	stoppedTrainsSince: Record<string, number>;
};

const getTrainStopKey = (train: Train) => train.id ?? train.TrainNoLocal;

export const TrainsList: FC<Props> = ({ trains, stoppedTrainsSince }) => (
	<>
		{trains.map((train) => (
			<TrainMarker
				key={train.TrainNoLocal}
				train={train}
				stoppedSince={stoppedTrainsSince[getTrainStopKey(train)]}
			/>
		))}
	</>
);
