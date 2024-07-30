import type { Train } from "@simrail/types";
import React, { useContext, useState } from "react";

interface SelectedTrainContextType {
	selectedTrain: Train | null;
	setSelectedTrain: (train: Train | null) => void;
}

export const SelectedTrainContext =
	React.createContext<SelectedTrainContextType>({
		selectedTrain: null,
		setSelectedTrain: () => {},
	});

export const useSelectedTrain = () => useContext(SelectedTrainContext);

// @ts-ignore
export const SelectedTrainProvider = ({ children }) => {
	const [selectedTrain, setSelectedTrain] = useState<Train | null>(null);

	return (
		<SelectedTrainContext.Provider value={{ selectedTrain, setSelectedTrain }}>
			{children}
		</SelectedTrainContext.Provider>
	);
};
