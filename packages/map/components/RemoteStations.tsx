import { RemoteStationMarker } from "@/components/Markers/StationRemoteMarker";
import stationsJson from "@/components/stationsRemote.json";
import React, { type FC } from "react";

const RemoteStations: FC = () => (
	<>
		{stationsJson.map((station) => (
			<RemoteStationMarker key={station.Name} station={station} />
		))}
	</>
);

export default React.memo(RemoteStations);
