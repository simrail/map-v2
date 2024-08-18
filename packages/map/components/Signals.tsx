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

const filterSignals = (
	signals: Signal[],
	predicate: (signal: Signal) => boolean,
): Signal[] => {
	return signals.filter(predicate);
};

const MainlineSignals: FC = () => {
	const signals = filterSignals(signalsData, (signal) =>
		signal.Name.startsWith("L"),
	);
	return (
		<>
			{signals.map((signal) => (
				<SignalMarker key={signal.Name} signal={signal} />
			))}
		</>
	);
};

const OtherSignals: FC = () => {
	const signals = filterSignals(
		signalsData,
		(signal) => !signal.Name.startsWith("L"),
	);
	return (
		<>
			{signals.map((signal) => (
				<SignalMarker key={signal.Name} signal={signal} />
			))}
		</>
	);
};

export { MainlineSignals, OtherSignals };
