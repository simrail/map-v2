import React, { type FC } from "react";

import { PassengerStationMarker } from "@/components/Markers/PassengerStationMarker";
import stationsJson from "@/components/stationsPassenger.json";

const PassengerStations: FC = () => (
	<>
		{stationsJson.map((station) => (
			<PassengerStationMarker key={station.Name} station={station} />
		))}
	</>
);

export default React.memo(PassengerStations);
