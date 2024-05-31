import React, {FC} from "react";
import signalJson from "@/components/signals.json";
import {SignalMarker} from "@/components/Markers/SignalMarker";

const Signals: FC = () =>
    <>{signalJson.map(signal => (<SignalMarker key={signal.Name} signal={signal} />))}</>

export default React.memo(Signals);
