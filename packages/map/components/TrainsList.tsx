import type { Train } from "@simrail/types";
import type { FC } from "react";

import TrainMarker from "@/components/Markers/TrainMarker";
import { useSelectedTrain } from "../contexts/SelectedTrainContext";

type Props = {
	trains: Train[];
	stoppedTrainsSince: Record<string, number>;
};

const getTrainStopKey = (train: Train) => train.id ?? train.TrainNoLocal;

export const TrainsList: FC<Props> = ({ trains, stoppedTrainsSince }) => {
	const { selectedTrain, onlySelectedTrain } = useSelectedTrain();

	// "Only selected train" hides every other train from the map while a
	// train is selected; with no selection, all trains stay visible.
	const visibleTrains =
		onlySelectedTrain && selectedTrain
			? trains.filter(
					(train) => getTrainStopKey(train) === getTrainStopKey(selectedTrain),
				)
			: trains;

	return (
		<>
			{visibleTrains.map((train) => (
				<TrainMarker
					key={train.TrainNoLocal}
					train={train}
					stoppedSince={stoppedTrainsSince[getTrainStopKey(train)]}
				/>
			))}
		</>
	);
};