import { MapContainer, TileLayer, Marker, Popup, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css'
import "leaflet-defaulticon-compatibility";
import { useEffect, useState } from "react";
import { TrainMarker } from "./TrainMarker";
import L from "leaflet";
import { StationMarker } from "./StationMarker";
import { Train } from "../types/Train";
import { Station } from '../types/Station';
import stationsJson from '../components/stations.json'

type MapProps = {
    serverId: string | string[]
}

const Map = (props: MapProps) => {


    let { serverId } = props

    const [trains, setTrains] = useState<Train[] | null>(null)
    const [stations, setStations] = useState<Station[] | null>(null)
    const [isLoading, setLoading] = useState(false)

    function getTrains() {
        fetch('https://panel.simrail.eu:8084/trains-open?serverCode=' + serverId)
            .then((res) => res.json())
            .then((trains) => {
                setTrains(trains.data)
            })
    }

    function getStations() {
        fetch('https://panel.simrail.eu:8084/stations-open?serverCode=' + serverId)
            .then((res) => res.json())
            .then((stations) => {

                let stationsData: Station[] = stations.data


                // @ts-ignore
                setStations(stationsData.concat(stationsJson))
            })
    }

    useEffect(() => {
        setLoading(true)

        getTrains()
        getStations()
        setLoading(false)

        const interval1 = setInterval(() => {
            getTrains()
        }, 2000)

        const interval2 = setInterval(() => {
            getStations()
        }, 10000)


        return function () {
            clearInterval(interval1)
            clearInterval(interval2)

        }


    }, [])


    if (!trains) return <p>Loading trains...</p>
    if (!stations) return <p>Loading stations...</p>


    return (<MapContainer
        center={[50.270908, 19.039993]}
        zoom={10}
        scrollWheelZoom={true}
        style={{ height: "100vh", width: "100vw" }}
    >
        {trains.map(train => (<TrainMarker key={train.TrainNoLocal} train={train} />))}

        {stations.map(station => (<StationMarker key={station.Name} station={station} />))}


        <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
    </MapContainer>)
}

export default Map
