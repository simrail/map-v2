import { NonPlayableStationMarker } from "@/components/Markers/NonPlayableStationMarker";
import stationsJson from "@/components/stations.json";
import React, { type FC } from "react";

const NonPlayableStations: FC = () => (
	<>
		{stationsJson.map((station) => (
			<NonPlayableStationMarker key={station.Name} station={station} />
		))}
	</>
);

export default React.memo(NonPlayableStations);
