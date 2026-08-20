import type { Train } from "@simrail/types";
import { type ReactNode, createContext, useContext, useState } from "react";

interface SelectedTrainContextType {
	selectedTrain: Train | null;
	setSelectedTrain: (train: Train | null) => void;
}

export const SelectedTrainContext = createContext<SelectedTrainContextType>({
	selectedTrain: null,
	setSelectedTrain: () => {},
});

export const useSelectedTrain = () => useContext(SelectedTrainContext);

export const SelectedTrainProvider = ({
	children,
}: {
	children: ReactNode;
}) => {
	const [selectedTrain, setSelectedTrain] = useState<Train | null>(null);

	return (
		<SelectedTrainContext.Provider value={{ selectedTrain, setSelectedTrain }}>
			{children}
		</SelectedTrainContext.Provider>
	);
};
