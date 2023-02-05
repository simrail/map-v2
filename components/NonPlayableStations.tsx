import React, {FC} from "react";
import stationsJson from "@/components/stations.json";
import {NonPlayableStationMarker} from "@/components/Markers/NonPlayableStationMarker";

const NonPlayableStations: FC = () =>
    <>{stationsJson.map(station => (<NonPlayableStationMarker key={station.Name} station={station} />))}</>

export default React.memo(NonPlayableStations);
