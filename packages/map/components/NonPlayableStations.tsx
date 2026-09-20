import React, { type FC } from "react";

import { NonPlayableStationMarker } from "@/components/Markers/NonPlayableStationMarker";
import stationsJson from "@/components/stations.json";

const NonPlayableStations: FC = () => (
	<>
		{stationsJson.map((station) => (
			<NonPlayableStationMarker key={station.Name} station={station} />
		))}
	</>
);

export default React.memo(NonPlayableStations);
