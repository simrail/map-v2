import React, { type FC } from "react";

import { RemoteStationMarker } from "@/components/Markers/StationRemoteMarker";
import stationsJson from "@/components/stationsRemote.json";

const RemoteStations: FC = () => (
	<>
		{stationsJson.map((station) => (
			<RemoteStationMarker key={station.Name} station={station} />
		))}
	</>
);

export default React.memo(RemoteStations);
