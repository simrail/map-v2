import { useLocalStorage } from "@mantine/hooks";
import type { Train } from "@simrail/types";
import {
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	createContext,
	useContext,
	useMemo,
	useState,
} from "react";

interface SelectedTrainContextType {
	selectedTrain: Train | null;
	setSelectedTrain: (train: Train | null) => void;
	showTrainRoute: boolean;
	setShowTrainRoute: Dispatch<SetStateAction<boolean>>;
	followTrain: boolean;
	setFollowTrain: Dispatch<SetStateAction<boolean>>;
}

export const SelectedTrainContext = createContext<SelectedTrainContextType>({
	selectedTrain: null,
	setSelectedTrain: () => {},
	showTrainRoute: true,
	setShowTrainRoute: () => {},
	followTrain: true,
	setFollowTrain: () => {},
});

export const useSelectedTrain = () => useContext(SelectedTrainContext);

export const SelectedTrainProvider = ({
	children,
}: {
	children: ReactNode;
}) => {
	const [selectedTrain, setSelectedTrain] = useState<Train | null>(null);
	const [showTrainRoute, setShowTrainRoute] = useLocalStorage({
		key: "showTrainRoute",
		defaultValue: true,
	});
	const [followTrain, setFollowTrain] = useLocalStorage({
		key: "followTrain",
		defaultValue: true,
	});
	const value = useMemo(
		() => ({
			selectedTrain,
			setSelectedTrain,
			showTrainRoute,
			setShowTrainRoute,
			followTrain,
			setFollowTrain,
		}),
		[
			selectedTrain,
			showTrainRoute,
			followTrain,
			setShowTrainRoute,
			setFollowTrain,
		],
	);

	return (
		<SelectedTrainContext.Provider value={value}>
			{children}
		</SelectedTrainContext.Provider>
	);
};
