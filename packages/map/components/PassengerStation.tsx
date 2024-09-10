import React, { FC } from "react";
import passengerStationsJson from "@/components/passengerStations.json";
import { PassengerStationMarker } from "@/components/Markers/PassengerStationMarker";
import { useRouter } from 'next/router';
import serverSceneries from '@/components/serverSceneries.json'


const PassengerStations: FC = () => {

    const router = useRouter()
    const { id } = router.query

    let Sceneries: string[]
    if (id) {
        const server = serverSceneries.find(server => server.Name === id);
        if (server) {
            Sceneries = server.Sceneries
        }
    }

    
    return (
        <>
            {passengerStationsJson
                .filter(nonPlayable => Sceneries.includes(nonPlayable.Scenerie))
                .map(nonPlayable => (
                    <PassengerStationMarker key={nonPlayable.Name} nonPlayable={nonPlayable} />
                ))}
        </>
    );
};

export default React.memo(PassengerStations);