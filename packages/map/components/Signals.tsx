import type { Signal } from "@simrail/types";
import type { FC } from "react";

import { LazyLayer } from "./LazyLayer";
import { SignalMarker } from "./Markers/SignalMarker";

type SignalJsonType = { Name: string; Latitude: number; Longitude: number };

const convertToSignal = (data: SignalJsonType[]): Signal[] => {
	return data.map((signal) => ({
		Name: signal.Name,
		Latitude: signal.Latitude,
		Longitude: signal.Longitude,
	}));
};

// Both signal layers are off by default, so the data is only loaded once
// one of them is shown.
let signalsRequest:
	| Promise<{ mainline: Signal[]; other: Signal[] }>
	| undefined;
const loadSignals = () =>
	(signalsRequest ??= import("./signals.json").then(
		(module) => {
			const signals = convertToSignal(module.default as SignalJsonType[]);
			return {
				mainline: signals.filter((signal) => signal.Name.startsWith("L")),
				other: signals.filter((signal) => !signal.Name.startsWith("L")),
			};
		},
		(error: unknown) => {
			signalsRequest = undefined;
			throw error;
		},
	));
const loadMainlineSignals = () => loadSignals().then((s) => s.mainline);
const loadOtherSignals = () => loadSignals().then((s) => s.other);

const renderSignals = (signals: Signal[]) =>
	signals.map((signal) => <SignalMarker key={signal.Name} signal={signal} />);

const MainlineSignals: FC = () => (
	<LazyLayer load={loadMainlineSignals}>{renderSignals}</LazyLayer>
);

const OtherSignals: FC = () => (
	<LazyLayer load={loadOtherSignals}>{renderSignals}</LazyLayer>
);

export { MainlineSignals, OtherSignals };
