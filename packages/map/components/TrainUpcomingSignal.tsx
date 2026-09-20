import type { Train } from "@simrail/types";
import type React from "react";

type TrainSignalProps = {
	train: Train;
	showMoreInfo: boolean;
};

function formatSignalDistance(distanceMeters: number): string {
	if (distanceMeters > 5000) {
		return ">5km";
	}
	if (distanceMeters > 1000) {
		return `${(distanceMeters / 1000).toFixed(1)}km`;
	}
	return `${Math.round(distanceMeters)}m`;
}

function formatSignalSpeed(rawSpeedLimit: number): string {
	if (rawSpeedLimit === 32767) {
		return "vmax";
	}
	return `${rawSpeedLimit} km/h`;
}

/** Status dot color for the upcoming signal aspect: clear, stop, or limited. */
const getSignalColor = (signalSpeed: number | string): string => {
	if (signalSpeed === "vmax" || signalSpeed === 32767) {
		return "#2ecc71"; // clear
	}
	if (signalSpeed === 0) {
		return "#e74c3c"; // stop
	}
	return "#f5a623"; // limited aspect
};

const getSignalStatusText = (signalSpeed: number | string): string => {
	if (signalSpeed === "vmax" || signalSpeed === 32767) {
		return "Clear";
	}
	if (signalSpeed === 0) {
		return "Stop";
	}
	return "Limited";
};

const TrainUpcomingSignal: React.FC<TrainSignalProps> = ({
	train,
	showMoreInfo,
}) => {
	const {
		TrainData: { SignalInFront, SignalInFrontSpeed, DistanceToSignalInFront },
	} = train;

	if (!SignalInFront) {
		return <div>Signal too far away</div>;
	}

	const signalName = SignalInFront.split("@")[0];
	const signalColor = getSignalColor(SignalInFrontSpeed);
	const signalDistance = formatSignalDistance(DistanceToSignalInFront);

	if (!showMoreInfo) {
		return (
			<div>
				{signalName} in {signalDistance}
			</div>
		);
	}

	return (
		<div>
			{signalName} in {signalDistance} - speed{" "}
			{formatSignalSpeed(SignalInFrontSpeed)} -{" "}
			<span
				aria-label={getSignalStatusText(SignalInFrontSpeed)}
				title={getSignalStatusText(SignalInFrontSpeed)}
				style={{
					display: "inline-block",
					width: "0.55em",
					height: "0.55em",
					borderRadius: "50%",
					backgroundColor: signalColor,
				}}
			/>
		</div>
	);
};

export default TrainUpcomingSignal;
