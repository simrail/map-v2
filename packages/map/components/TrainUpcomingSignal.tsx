import type { Train } from "@simrail/types";
import type React from "react";
import { useState } from "react";

import styles from "../styles/TrainDetails.module.css";

type TrainSignalProps = {
	train: Train;
	showMoreInfo: boolean;
};

const signalStates = {
	open: "/signals/signal-open.png",
	limited40: "/signals/signal-limited-40.png",
	limited50: "/signals/signal-limited-50.png",
	limited60: "/signals/signal-limited-60.png",
	limited80: "/signals/signal-limited-80.png",
	limited100: "/signals/signal-limited-100.png",
	limited130: "/signals/signal-limited-130.png",
	closed: "/signals/signal-closed.png",
};

type SignalState = keyof typeof signalStates;

function formatSignalDistance(distanceMeters: number): string {
	if (distanceMeters > 5000) {
		return ">5 km";
	}
	if (distanceMeters > 1000) {
		return `${(distanceMeters / 1000).toFixed(1)} km`;
	}
	return `${Math.round(distanceMeters)} m`;
}

function formatSignalSpeed(rawSpeedLimit: number): string {
	if (rawSpeedLimit === 32767) {
		return "vmax";
	}
	return `${rawSpeedLimit} km/h`;
}

const getSignalState = (signalSpeed: number | string): SignalState | null => {
	if (signalSpeed === "vmax" || signalSpeed === 32767) {
		return "open";
	}

	if (signalSpeed === 0) {
		return "closed";
	}

	if (typeof signalSpeed === "number" && signalSpeed <= 40) {
		return "limited40";
	}

	if (typeof signalSpeed === "number" && signalSpeed === 50) {
		return "limited50";
	}

	if (typeof signalSpeed === "number" && signalSpeed <= 60) {
		return "limited60";
	}

	if (signalSpeed === 80) {
		return "limited80";
	}

	if (typeof signalSpeed === "number" && signalSpeed <= 100) {
		return "limited100";
	}

	if (typeof signalSpeed === "number" && signalSpeed <= 130) {
		return "limited130";
	}

	return null;
};

const getSignalStatus = (state: SignalState | null): string => {
	if (state === "open") return "Clear";
	if (state === "closed") return "Stop";
	if (!state) return "Unknown";
	return "Limited";
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
	const signalImageSrc = signalState ? signalStates[signalState] : null;

	const [failedSrc, setFailedSrc] = useState<string | null>(null);
	const visibleSignalImageSrc =
		signalImageSrc && failedSrc !== signalImageSrc ? signalImageSrc : null;

	if (!showMoreInfo) {
		return (
			<div className={styles.signalCompact}>
				{SignalInFront ? (
					<>
						<strong>{signalName}</strong>
						<span>{formatSignalDistance(DistanceToSignalInFront)} ahead</span>
					</>
				) : (
					<span>Signal too far away</span>
				)}
			</div>
		);
	}

	if (!SignalInFront) {
		return <div className={styles.signalEmpty}>Signal too far away</div>;
	}

	return (
		<div className={styles.signalCard}>
			<div className={styles.signalPosition}>
				<strong>{signalName}</strong>
				<span>{formatSignalDistance(DistanceToSignalInFront)} ahead</span>
			</div>
			<div className={styles.signalAspect}>
				{visibleSignalImageSrc && (
					<img
						src={visibleSignalImageSrc}
						alt=""
						width={24}
						height={24}
						onError={() => setFailedSrc(signalImageSrc)}
					/>
				)}
				<div>
					<span>{getSignalStatus(signalState)}</span>
					<strong>{formatSignalSpeed(SignalInFrontSpeed)}</strong>
				</div>
			</div>
		</div>
	);
};

export default TrainUpcomingSignal;
