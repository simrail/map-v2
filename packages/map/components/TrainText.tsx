import { Carousel } from "@mantine/carousel";
import { Image } from "@mantine/core";
import { readLocalStorageValue } from "@mantine/hooks";
import type { Train } from "@simrail/types";
import { useSelectedTrain } from "contexts/SelectedTrainContext";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { MdClose } from "react-icons/md";

import railcarJson from "@/components/railcars.json";
import TrainUpcomingSignal from "@/components/TrainUpcomingSignal";

import type { Railcar } from "../types/Railcar";

import styles from "../styles/TrainDetails.module.css";

type TrainTextProps = {
	train: Train;
	username: string;
	avatar: string | null;
	minified?: boolean | null;
	stoppedSince?: number;
};

interface TrainRailcarInfo {
	index: number;
	railcar: Railcar;
	loadWeight: number | null;
}

const railcarsByApiName = new Map(
	(railcarJson as Railcar[]).map((railcar) => [railcar.apiName, railcar]),
);

function getTrainDisplayName(
	rawTrainName: string,
	trainNumber: string,
): string {
	const nameParts = rawTrainName.replace(/\s/g, "").split("-");
	if (nameParts.length > 1) {
		if (nameParts[0] === "ROJ" || nameParts[0] === "RPJ") {
			return `${nameParts[0]} ${trainNumber} (${nameParts[1]})`;
		}
		return `${nameParts[1]} ${trainNumber}`;
	}
	return `${nameParts[0]} ${trainNumber}`;
}

function extractVehicleInformation(
	rawVehicleName: string,
): [string, number | null] {
	if (rawVehicleName.includes(":")) {
		const vehicleNameParts = rawVehicleName.split(":");
		if (vehicleNameParts.length >= 3) {
			const cleanedWeight = vehicleNameParts[2]
				.split("@")[0]
				.replaceAll(/[^0-9]/g, "");
			return [vehicleNameParts[0], Number(cleanedWeight)];
		}
		if (vehicleNameParts.length === 2) {
			return [vehicleNameParts[0], null];
		}
	}
	return [rawVehicleName, null];
}

function formatStoppedDuration(totalSeconds: number): string {
	if (totalSeconds < 60) return `${totalSeconds}s`;
	const totalMinutes = Math.floor(totalSeconds / 60);
	if (totalMinutes < 60) return `${totalMinutes}min`;
	return `${Math.floor(totalMinutes / 60)}h`;
}

const TrainText = ({
	train,
	username,
	avatar,
	minified = false,
	stoppedSince,
}: TrainTextProps) => {
	const router = useRouter();
	const { id, trainId } = router.query;
	const { setSelectedTrain } = useSelectedTrain();

	const usedRailcarInfo = useMemo(
		() =>
			train.Vehicles.map((rawVehicleName, index) => {
				const [vehicleName, loadWeight] =
					extractVehicleInformation(rawVehicleName);
				const railcar = railcarsByApiName.get(vehicleName);
				return railcar ? { index, railcar, loadWeight } : undefined;
			}).filter((item): item is TrainRailcarInfo => Boolean(item)),
		[train.Vehicles],
	);

	const wagons = usedRailcarInfo.filter(
		(info) => info.railcar.railcarType === "WAGON",
	);
	const locomotives = usedRailcarInfo.filter(
		(info) => info.railcar.railcarType !== "WAGON",
	);
	const uniqueLocomotives = locomotives.filter(
		(info, index, all) =>
			all.findIndex((item) => item.railcar.id === info.railcar.id) === index,
	);
	const locomotiveImages = uniqueLocomotives.map((info) => (
		<Carousel.Slide key={`${info.railcar.id}@${info.index}`}>
			<Image
				src={`/trains/${info.railcar.id}.png`}
				alt={info.railcar.id}
				w="auto"
				fit="contain"
				height="100%"
			/>
		</Carousel.Slide>
	));

	const roundedSpeed = Math.round(train.TrainData.Velocity);
	const [currentTime, setCurrentTime] = useState(0);
	useEffect(() => {
		if (roundedSpeed !== 0 || !stoppedSince) return;
		const interval = window.setInterval(() => setCurrentTime(Date.now()), 1000);
		return () => window.clearInterval(interval);
	}, [roundedSpeed, stoppedSince]);

	const stoppedSeconds = stoppedSince
		? Math.max(0, Math.floor((currentTime - stoppedSince) / 1000))
		: 0;
	const tractionUnit = locomotives.at(0);
	const tractionUnitInfo =
		tractionUnit && tractionUnit.index === 0
			? `${tractionUnit.railcar.id} (${tractionUnit.railcar.designation})`
			: train.Vehicles[0];
	const additionalUnits = locomotives
		.filter((info) => info.index !== 0)
		.map((info) => info.railcar.id);
	const trainLength = Math.round(
		usedRailcarInfo.reduce((total, info) => total + info.railcar.length, 0),
	);
	const trainWeight = Math.round(
		usedRailcarInfo.reduce(
			(total, info) => total + info.railcar.weight + (info.loadWeight ?? 0),
			0,
		),
	);
	const minMaxSpeed = usedRailcarInfo.reduce(
		(minimum, info) => Math.min(minimum, info.railcar.maxSpeed),
		Number.POSITIVE_INFINITY,
	);
	const showSignalInfo = readLocalStorageValue({
		key: "showSignalInfo",
		defaultValue: true,
	});
	const displayName = getTrainDisplayName(train.TrainName, train.TrainNoLocal);
	const displayedMaxSpeed = Number.isFinite(minMaxSpeed)
		? `${minMaxSpeed} km/h`
		: "—";

	return (
		<section className={`${styles.card} ${minified ? styles.compact : ""}`}>
			<header className={styles.header}>
				<div className={styles.identity}>
					<img
						className={styles.avatar}
						src={avatar ?? "/markers/icon-bot-simrail.jpg"}
						alt=""
						width={40}
						height={40}
					/>
					<div>
						<span className={styles.kicker}>
							{train.TrainData.ControlledBySteamID
								? "Player service"
								: "AI service"}
						</span>
						<strong>{username}</strong>
					</div>
				</div>
				{!minified && (
					<button
						type="button"
						onClick={() => {
							if (trainId) void router.replace(`/server/${String(id)}`);
							setSelectedTrain(null);
						}}
						className={styles.close}
						aria-label="Close train details"
					>
						<MdClose size={21} />
					</button>
				)}
			</header>

			<div className={styles.serviceHeading}>
				<span>Train {train.TrainNoLocal}</span>
				<h3>{displayName}</h3>
			</div>

			<div className={styles.route}>
				<span>{train.StartStation}</span>
				<i aria-hidden="true">→</i>
				<span>{train.EndStation}</span>
			</div>

			<div className={styles.stats}>
				<div>
					<span>{roundedSpeed === 0 ? "Stopped" : "Speed"}</span>
					<strong>
						{roundedSpeed === 0
							? formatStoppedDuration(stoppedSeconds)
							: `${roundedSpeed} km/h`}
					</strong>
				</div>
				<div>
					<span>Maximum</span>
					<strong>{displayedMaxSpeed}</strong>
				</div>
				<div>
					<span>Length</span>
					<strong>{trainLength > 0 ? `${trainLength} m` : "—"}</strong>
				</div>
				{!minified && (
					<div>
						<span>Weight</span>
						<strong>{trainWeight > 0 ? `${trainWeight} t` : "—"}</strong>
					</div>
				)}
			</div>

			<div className={styles.consist}>
				<span>Locomotive</span>
				<strong>{tractionUnitInfo || "Unknown"}</strong>
				{additionalUnits.length > 0 && (
					<small>Additional units: {additionalUnits.join(", ")}</small>
				)}
				{wagons.length > 0 && <small>{wagons.length} wagons</small>}
			</div>

			{!minified && locomotiveImages.length > 0 && (
				<div className={styles.trainMedia}>
					<Carousel
						withIndicators={locomotiveImages.length > 1}
						withControls={locomotiveImages.length > 1}
						height={112}
						slideSize="100%"
					>
						{locomotiveImages}
					</Carousel>
				</div>
			)}

			{!minified && (
				<div className={styles.signalSection}>
					<span className={styles.kicker}>Next signal</span>
					<div className={styles.signalDetails}>
						<TrainUpcomingSignal train={train} showMoreInfo={showSignalInfo} />
					</div>
					<a
						target="_blank"
						rel="noreferrer"
						href={`https://edr.simrail.app/${String(id)}/train/${String(train.TrainNoLocal)}`}
						className={styles.edrButton}
					>
						Open in EDR <span aria-hidden="true">↗</span>
					</a>
				</div>
			)}
		</section>
	);
};

export default TrainText;
