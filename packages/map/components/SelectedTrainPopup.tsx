import { readLocalStorageValue } from "@mantine/hooks";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { getSteamProfileOrBot } from "@/components/steam";

import { useSelectedTrain } from "../contexts/SelectedTrainContext";
import TrainText from "./TrainText";

import styles from "../styles/SelectedTrainPopup.module.css";

type SelectedTrainPopupProps = {
	stoppedSince?: number;
};

const SelectedTrainPopup = ({ stoppedSince }: SelectedTrainPopupProps) => {
	const { selectedTrain } = useSelectedTrain();
	const renderPopup = readLocalStorageValue({
		key: "renderPopup",
		defaultValue: true,
	});

	const [avatar, setAvatar] = useState<string | null>(null);
	const [username, setUsername] = useState<string | null>(null);
	const router = useRouter();
	const { trainId } = router.query;

	useEffect(() => {
		let active = true;
		if (!selectedTrain) return;

		void getSteamProfileOrBot(selectedTrain.TrainData.ControlledBySteamID).then(
			([avatarUrl, profileName]) => {
				if (active) {
					setAvatar(avatarUrl);
					setUsername(profileName);
				}
			},
		);

		return () => {
			active = false;
		};
	}, [selectedTrain]);

	if (renderPopup === true) {
		return selectedTrain ? (
			<div className={styles.popup} style={trainId ? { top: "0px" } : {}}>
				<TrainText
					train={selectedTrain}
					username={username ?? ""}
					avatar={avatar}
					stoppedSince={stoppedSince}
				/>
			</div>
		) : null;
	}
	return null;
};

export default SelectedTrainPopup;
