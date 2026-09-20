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
	showSignalInfo: boolean;
	setShowSignalInfo: Dispatch<SetStateAction<boolean>>;
	showTrainRoute: boolean;
	setShowTrainRoute: Dispatch<SetStateAction<boolean>>;
	followTrain: boolean;
	setFollowTrain: Dispatch<SetStateAction<boolean>>;
	onlySelectedTrain: boolean;
	setOnlySelectedTrain: Dispatch<SetStateAction<boolean>>;
}

export const SelectedTrainContext = createContext<SelectedTrainContextType>({
	selectedTrain: null,
	setSelectedTrain: () => {},
	showSignalInfo: true,
	setShowSignalInfo: () => {},
	showTrainRoute: true,
	setShowTrainRoute: () => {},
	followTrain: true,
	setFollowTrain: () => {},
	onlySelectedTrain: false,
	setOnlySelectedTrain: () => {},
});

export const useSelectedTrain = () => useContext(SelectedTrainContext);

export const SelectedTrainProvider = ({
	children,
}: {
	children: ReactNode;
}) => {
	const [selectedTrain, setSelectedTrain] = useState<Train | null>(null);
	const [showSignalInfo, setShowSignalInfo] = useLocalStorage({
		key: "showSignalInfo",
		defaultValue: true,
	});
	const [showTrainRoute, setShowTrainRoute] = useLocalStorage({
		key: "showTrainRoute",
		defaultValue: true,
	});
	const [followTrain, setFollowTrain] = useLocalStorage({
		key: "followTrain",
		defaultValue: true,
	});
	const [onlySelectedTrain, setOnlySelectedTrain] = useLocalStorage({
		key: "onlySelectedTrain",
		defaultValue: false,
	});
	const value = useMemo(
		() => ({
			selectedTrain,
			setSelectedTrain,
			showSignalInfo,
			setShowSignalInfo,
			showTrainRoute,
			setShowTrainRoute,
			followTrain,
			setFollowTrain,
			onlySelectedTrain,
			setOnlySelectedTrain,
		}),
		[
			selectedTrain,
			showSignalInfo,
			showTrainRoute,
			followTrain,
			onlySelectedTrain,
			setShowTrainRoute,
			setShowSignalInfo,
			setFollowTrain,
			setOnlySelectedTrain,
		],
	);

	return (
		<SelectedTrainContext.Provider value={value}>
			{children}
		</SelectedTrainContext.Provider>
	);
};
