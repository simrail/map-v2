import type { Train } from "@simrail/types";
import type React from "react";

type TrainSignalProps = {
	train: Train;
};

const signalStates = {
	open: "/signals/signal-open.png",
	limited40: "/signals/signal-limited-40.png",
	limited60: "/signals/signal-limited-60.png",
	limited100: "/signals/signal-limited-100.png",
	limited130: "/signals/signal-limited-130.png",
	closed: "/signals/signal-closed.png",
};

function formatSignalDistance(distanceMeters: number): string {
	if (distanceMeters > 5000) {
		return "> 5km";
	}
	if (distanceMeters > 1000) {
		const distanceKilometers = (distanceMeters / 1000).toFixed(1);
		return `${distanceKilometers} km`;
	}
	return `${distanceMeters.toFixed(1)} m`;
}

function formatSignalSpeed(rawSpeedLimit: number): string {
	if (rawSpeedLimit === 32767) {
		return "vmax";
	}
	return `${rawSpeedLimit} km/h`;
}

const getSignalState = (signalSpeed: number | string): string | null => {
	if (signalSpeed === "vmax" || signalSpeed === 32767) {
		return "open";
	}

	if (signalSpeed === 0) {
		return "closed";
	}

	if (typeof signalSpeed === "number" && signalSpeed <= 40) {
		return "limited40";
	}

	if (typeof signalSpeed === "number" && signalSpeed <= 60) {
		return "limited60";
	}

	if (typeof signalSpeed === "number" && signalSpeed <= 100) {
		return "limited100";
	}

	if (typeof signalSpeed === "number" && signalSpeed <= 130) {
		return "limited130";
	}

	return null;
};

const TrainUpcomingSignal: React.FC<TrainSignalProps> = ({ train }) => {
	const {
		TrainData: { SignalInFront, SignalInFrontSpeed, DistanceToSignalInFront },
	} = train;

	const signalName = SignalInFront?.split("@")[0];
	const signalState = getSignalState(SignalInFrontSpeed);
	const signalImageSrc = signalState
		? signalStates[signalState as keyof typeof signalStates]
		: null;

	return (
		<>
			<div>
				Distance to {signalName ? signalName : "next signal"}:{" "}
				{SignalInFront
					? formatSignalDistance(DistanceToSignalInFront)
					: "Signal too far away"}
			</div>
			{SignalInFront && (
				<>
					<div>Signal speed: {formatSignalSpeed(SignalInFrontSpeed)}</div>
					{signalImageSrc && (
						<div style={{ display: "flex", alignItems: "center" }}>
							<span>Signal Status : </span>
							<img
								src={signalImageSrc}
								alt={signalState || ""}
								width={35}
								height={35}
								style={{ marginLeft: "0.5rem" }}
							/>
						</div>
					)}
				</>
			)}
		</>
	);
};

export default TrainUpcomingSignal;
