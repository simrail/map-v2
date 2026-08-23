import type { Signal } from "@simrail/types";
import type { FC } from "react";

import { SignalMarker } from "./Markers/SignalMarker";
import signalJson from "./signals.json";

type SignalJsonType = { Name: string; Latitude: number; Longitude: number };

const convertToSignal = (data: SignalJsonType[]): Signal[] => {
	return data.map((signal) => ({
		Name: signal.Name,
		Latitude: signal.Latitude,
		Longitude: signal.Longitude,
	}));
};

const signalsData: Signal[] = convertToSignal(signalJson as SignalJsonType[]);

const mainlineSignals = signalsData.filter((signal) =>
	signal.Name.startsWith("L"),
);
const otherSignals = signalsData.filter(
	(signal) => !signal.Name.startsWith("L"),
);

const MainlineSignals: FC = () => {
	return (
		<>
			{mainlineSignals.map((signal) => (
				<SignalMarker key={signal.Name} signal={signal} />
			))}
		</>
	);
};

const OtherSignals: FC = () => {
	return (
		<>
			{otherSignals.map((signal) => (
				<SignalMarker key={signal.Name} signal={signal} />
			))}
		</>
	);
};

export { MainlineSignals, OtherSignals };
