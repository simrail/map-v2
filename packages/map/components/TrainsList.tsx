import type { Train } from "@simrail/types";
import { useEffect, useState, type FC } from "react";
import { useMap } from "react-leaflet";

import TrainMarker from "@/components/Markers/TrainMarker";

import { useSelectedTrain } from "../contexts/SelectedTrainContext";

type Props = {
	trains: Train[];
	stoppedTrainsSince: Record<string, number>;
};

const getTrainStopKey = (train: Train) => train.id ?? train.TrainNoLocal;

// Trains are only rendered within the view plus this fraction of it on
// every side, so panning a little doesn't reveal missing markers.
const VIEW_PADDING = 0.5;

export const TrainsList: FC<Props> = ({ trains, stoppedTrainsSince }) => {
	const { selectedTrain, setSelectedTrain, onlySelectedTrain } =
		useSelectedTrain();
	const selectedTrainKey = selectedTrain
		? getTrainStopKey(selectedTrain)
		: null;

	// Every marker is moved, animated and labelled on each update, so the
	// ones far off-screen are skipped (the selected train always stays).
	const map = useMap();
	const [bounds, setBounds] = useState(() => map.getBounds().pad(VIEW_PADDING));
	useEffect(() => {
		const update = () => setBounds(map.getBounds().pad(VIEW_PADDING));
		map.on("moveend", update);
		return () => {
			map.off("moveend", update);
		};
	}, [map]);

	// "Only selected train" hides every other train from the map while a
	// train is selected; otherwise every train near the view is shown.
	const visibleTrains = trains.filter((train) => {
		const isSelected = getTrainStopKey(train) === selectedTrainKey;
		if (onlySelectedTrain && selectedTrain) return isSelected;
		return (
			isSelected ||
			bounds.contains([train.TrainData.Latititute, train.TrainData.Longitute])
		);
	});

	return (
		<>
			{visibleTrains.map((train) => (
				<TrainMarker
					key={train.TrainNoLocal}
					train={train}
					stoppedSince={stoppedTrainsSince[getTrainStopKey(train)]}
					isSelected={getTrainStopKey(train) === selectedTrainKey}
					selectTrain={setSelectedTrain}
				/>
			))}
		</>
	);
};
