import type { Train } from "@simrail/types";
import type React from "react";
import { useState } from "react";

type TrainSignalProps = {
	train: Train;
	showMoreInfo: boolean;
};

const signalStates = {
	open: "/signals/signal-open.png",
	limited40: "/signals/signal-limited-40.png",
	limited50: "/signals/signal-limited-50.png",
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

	// Dedicated icon for exact 50
	if (typeof signalSpeed === "number" && signalSpeed === 50) {
		return "limited50";
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

const TrainUpcomingSignal: React.FC<TrainSignalProps> = ({
	train,
	showMoreInfo,
}) => {
	const {
		TrainData: { SignalInFront, SignalInFrontSpeed, DistanceToSignalInFront },
	} = train;

	const signalName = SignalInFront?.split("@")[0];
	const signalState = getSignalState(SignalInFrontSpeed);
	const signalImageSrc = signalState
		? signalStates[signalState as keyof typeof signalStates]
		: null;

	// Track last failed src to hide image only when that src fails
	const [failedSrc, setFailedSrc] = useState<string | null>(null);
	const visibleSignalImageSrc = signalImageSrc && failedSrc !== signalImageSrc ? signalImageSrc : null;

	if (!showMoreInfo) {
		return (
			<>
				Distance to {signalName ? signalName : "next signal"}:{" "}
				{SignalInFront
					? formatSignalDistance(DistanceToSignalInFront)
					: "Signal too far away"}
			</>
		);
	}

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
					{visibleSignalImageSrc ? (
						<div style={{ display: "flex", alignItems: "center" }}>
							<span>Signal Status : </span>
							<img
								src={visibleSignalImageSrc}
								alt={signalState || ""}
								width={35}
								height={35}
								style={{ marginLeft: "0.5rem" }}
								onError={(e) => setFailedSrc((e.currentTarget as HTMLImageElement).src)}
							/>
						</div>
					) : null}
				</>
			)}
		</>
	);
};

export default TrainUpcomingSignal;
