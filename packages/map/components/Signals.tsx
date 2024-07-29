import React, {FC} from "react";
import signalJson from "./signals.json";
import {SignalMarker} from "./Markers/SignalMarker";
import { Signal } from "@simrail/types";

type SignalJsonType = { Name: string; Latitude: number; Longitude: number };

const convertToSignal = (data: SignalJsonType[]): Signal[] => {
    return data.map(signal => ({
        Name: signal.Name,
        Latitude: signal.Latitude,
        Longitude: signal.Longitude,
    }));
};

const signalsData: Signal[] = convertToSignal(signalJson as SignalJsonType[]);

const filterSignals = (signals: Signal[], predicate: (signal: Signal) => boolean): Signal[] => {
    return signals.filter(predicate);
};

const MainlineSignals: FC = () => {
    const signals = filterSignals(signalsData, signal => signal.Name.startsWith("L"));
    return <>{signals.map(signal => (<SignalMarker key={signal.Name} signal={signal} />))}</>;
  };
  
const OtherSignals: FC = () => {
    const signals = filterSignals(signalsData, signal => !signal.Name.startsWith("L"));
    return <>{signals.map(signal => (<SignalMarker key={signal.Name} signal={signal} />))}</>;
};

export { MainlineSignals, OtherSignals };