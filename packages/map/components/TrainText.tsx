import TrainUpcomingSignal from "@/components/TrainUpcomingSignal";
import railcarJson from "@/components/railcars.json";
import { Carousel } from "@mantine/carousel";
import { ActionIcon, Avatar, Button, Flex, Image, Title } from "@mantine/core";
import { readLocalStorageValue } from "@mantine/hooks";
import type { Train } from "@simrail/types";
import { useSelectedTrain } from "contexts/SelectedTrainContext";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { MdClose } from "react-icons/md";
import type { Railcar } from "../types/Railcar";

type TrainTextProps = {
	train: Train;
	username: string;
	avatar: string | null;
	minified?: boolean | null;
};

interface TrainRailcarInfo {
	/** The index in the train where the railcar is located */
	index: number;
	/** The railcar being used. */
	railcar: Railcar;
	/** The load weight, in case this is a wagon. Null if no specific load weight is known. */
	loadWeight: number | null;
}

function getTrainDisplayName(
	rawTrainName: string,
	trainNumber: string,
): string {
	// note: replacement is needed as some train names contain extra white spaces (accidentally?)
	// which makes further work with them way harder. example: 'RPJ  - S1'
	const nameParts = rawTrainName.replace(/\s/g, "").split("-");
	if (nameParts.length > 1) {
		if (nameParts[0] === "ROJ" || nameParts[0] === "RPJ") {
			// special case: local trains have a line identifier appended to them, display that as well
			// results in f. ex. 'ROJ 91352 (RE1)'
			return `${nameParts[0]} ${trainNumber} (${nameParts[1]})`;
		}
		// usual case for passenger trains: the train type is the second identifier
		// results in f. ex. 'IC 13125'
		return `${nameParts[1]} ${trainNumber}`;
	}
	// usual case for all freight trains, they don't have an additional special identifier
	// results in f. ex. 'PWJ 146035'
	return `${nameParts[0]} ${trainNumber}`;
}

function extractVehicleInformation(
	rawVehicleName: string,
): [string, number | null] {
	if (rawVehicleName.includes(":")) {
		const vehicleNameParts = rawVehicleName.split(":");
		if (vehicleNameParts.length >= 3) {
			// there is information about the load mass and brake regime included
			// that we want to extract here. example: '424Z/424Z_brazowy:P:40@RandomContainerAll'
			const loadWeight = vehicleNameParts[2].split("@")[0];
			const cleanedWeight = loadWeight.replaceAll(/[^0-9]/g, "");
			return [vehicleNameParts[0], Number(cleanedWeight)];
		}

		if (vehicleNameParts.length === 2) {
			// there is information about the vehicle type and brake regime included,
			// but we only need the vehicle name in that case. example: '201E/ET22-256:G'
			return [vehicleNameParts[0], null];
		}
	}

	// raw vehicle name is just the name of the vehicle
	return [rawVehicleName, null];
}

const TrainText = ({
	train,
	username,
	avatar,
	minified = false,
}: TrainTextProps) => {
	const router = useRouter();
	const { id, trainId } = router.query;

	const { setSelectedTrain } = useSelectedTrain();

	const usedRailcarInfo = useMemo(
		() =>
			train.Vehicles.map((rawVehicleName, index) => {
				const [vehicleName, loadWeight] =
					extractVehicleInformation(rawVehicleName);
				const railcar = railcarJson
					.filter((info) => info.apiName === vehicleName)
					.at(0);
				if (railcar) {
					return {
						index,
						railcar: railcar as Railcar,
						loadWeight: loadWeight,
					};
				}
			}).filter((item): item is TrainRailcarInfo => !!item),
		[train.Vehicles],
	);

	// get all wagons and locomotives/EMUs used in the set
	const wagons = usedRailcarInfo.filter(
		(info) => info.railcar.railcarType === "WAGON",
	);
	const locomotives = usedRailcarInfo.filter(
		(info) => info.railcar.railcarType !== "WAGON",
	);

	// get images for all locomotives, but only one per type
	const locomotiveImages = locomotives
		.reduce((acc, current) => {
			if (!acc.some((item) => item.railcar.id === current.railcar.id)) {
				acc.push(current);
			}
			return acc;
		}, [] as TrainRailcarInfo[])
		.map((info) => {
			return (
				<Carousel.Slide key={`${info.railcar.id}@${info.index}`}>
					<Image
						src={`/trains/${info.railcar.id}.png`}
						alt={info.railcar.id}
						w="auto"
						fit="contain"
						height={"100%"}
					/>
				</Carousel.Slide>
			);
		});

	// get some general information about the wagon count
	const wagonCount = wagons.length;

	// only the first unit is responsible for train traction at the moment, so this is just safe to assume // Not true anymore,-
	// don't think it was true before update either as EMUs prob had multiple traction

	// however, this might be wrong in case the first unit is not yet registered in railcars.json, so we just
	// fall back to displaying the raw api name in that case
	const tractionUnit = locomotives.at(0);
	const tractionUnitInfo =
		tractionUnit && tractionUnit.index === 0
			? `${tractionUnit.railcar.id} (${tractionUnit.railcar.designation})`
			: train.Vehicles[0];

	// extract information about other units that are travelling in the pack
	const additionalUnits = locomotives.filter(
		(info) => info.index !== 0,
	).map((info) => info.railcar.id);

	const additionalUnitsInfo = `${
		additionalUnits.length > 0 ? `${additionalUnits.join(', ')}` : ''
	}`;

	// calculate train length and weight
	// for some reason this calculation differs (sometimes!) from the value displayed in game. Note
	// entirely sure what is happening and which calculation is correct, but for indication purposes this
	// should be good enough (mostly only a few tons/meters off the length that is displayed in game).
	const trainLength = Math.round(
		usedRailcarInfo
			.map((info) => info.railcar.length)
			.reduce((partial, current) => partial + current, 0),
	);
	const trainWeight = Math.round(
		usedRailcarInfo
			.map((info) => {
				const loadWeight = info.loadWeight || 0;
				return loadWeight + info.railcar.weight;
			})
			.reduce((partial, current) => partial + current, 0),
	);

	// get the lowest speed of the consist, note that this is the consist vmax and not the timetable one
	const minMaxSpeed = usedRailcarInfo
		.map((info) => info.railcar.maxSpeed)
		.reduce(
			(minSpeed, currentSpeed) => Math.min(minSpeed, currentSpeed),
			Number.POSITIVE_INFINITY,
		);

	const showSignalInfo = readLocalStorageValue({
		key: "showSignalInfo",
		defaultValue: true,
	});

	return (
		<>
			<Flex gap={12} align="center" justify={"space-between"}>
				<Flex gap={12} align="center" py={16}>
					<Avatar
						src={avatar ?? "/markers/icon-bot-simrail.jpg"}
						alt={`${username}'s avatar`}
					/>
					<Title order={3}>{username}</Title>
				</Flex>
				{!minified && (
					<ActionIcon
						onClick={() => {
							if (trainId) router.replace(`/server/${id}`);
							setSelectedTrain(null);
						}}
						size={29}
						color="red"
						variant="transparent"
						aria-label="Close pop-up"
					>
						<MdClose size={48} />
					</ActionIcon>
				)}
			</Flex>
			<div style={{ display: "flex", width: "300px" }}>
				<Carousel
					withIndicators
					withControls={!minified}
					height={120}
					style={{ flex: "1", width: "300px" }}
					slideSize={"300px"}
				>
					{locomotiveImages}
				</Carousel>
			</div>
			{!minified && (
				<Title order={3}>
					{getTrainDisplayName(train.TrainName, train.TrainNoLocal)}{" "}
				</Title>
			)}
			Locomotive: {tractionUnitInfo} <br />

			{additionalUnits.length > 0 && (
				<>
					Additional Units: {additionalUnitsInfo} <br />
				</>
			)}

			{wagonCount > 0 && (
				<>
					Wagons: x{wagonCount} <br />
				</>
			)}
			Length / Weight: {trainLength}m / {trainWeight}t<br />
			{!minified && <Title order={3}>Route </Title>}
			{train.StartStation} - {train.EndStation}
			<br />
			Speed: {Math.round(train.TrainData.Velocity)} km/h
			<br />
			Vmax: {minMaxSpeed} km/h
			<br />
			{!minified && (
				<>
					<Title order={3}>Next Signal</Title>
					<>
						<TrainUpcomingSignal train={train} showMoreInfo={showSignalInfo} />
						<br />
					</>

					<Flex
						gap={8}
						align="center"
						justify="center"
						py={16}
						direction={"column"}
					>
						{/* <Button w={"100%"}>View Stops</Button> */}
						<Button
							component="a"
							target="_blank"
							href={`https://edr.simrail.app/${id}/train/${train.TrainNoLocal}`}
							color="orange"
							w={"100%"}
						>
							See on EDR
						</Button>
					</Flex>
				</>
			)}
		</>
	);
};

export default TrainText;
