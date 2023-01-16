import { Circle, FeatureGroup, LayerGroup, LayersControl, MapContainer, Marker, Popup, Rectangle, TileLayer, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css'
import "leaflet-defaulticon-compatibility";
import { useEffect, useState } from "react";
import { TrainMarker } from "./TrainMarker";
import { StationMarker } from "./StationMarker";
import { Train } from "../types/Train";
import { Station } from '../types/Station';
import stationsJson from '../components/stations.json'
import styles from '../styles/Home.module.css'
import { Map as LeafletMap } from 'leaflet';
import { useSelectedTrain } from '../contexts/AppContext';
import SelectedTrainPopup from './SelectedTrainPopup';
import Control from 'react-leaflet-custom-control'
import { useRouter } from 'next/router';

type MapProps = {
    serverId: string | string[]
}

const Map = (props: MapProps) => {


    let { serverId } = props
    const [map, setMap] = useState<LeafletMap | null>(null);

    const router = useRouter();

    const { trainId } = router.query

    const [trains, setTrains] = useState<Train[] | null>(null)

    const [theme, setTheme] = useState('light')

    useEffect(() => {
        let data = localStorage.getItem('theme')
        if (data) {
            setTheme(data)
            document.body.className = data
        }
    }, [])


    const { selectedTrain, setSelectedTrain } = useSelectedTrain()


    const [stations, setStations] = useState<Station[] | null>(null)
    const [isLoading, setLoading] = useState(false)

    function getTrains() {
        fetch('https://panel.simrail.eu:8084/trains-open?serverCode=' + serverId)
            .then((res) => res.json())
            .then((fetchedTrains) => {
                setTrains(fetchedTrains.data)
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

        if (selectedTrain && map && trains) {
            // @ts-ignore
            setSelectedTrain(trains.find(train => train.id === selectedTrain.id) ?? null)
            // @ts-ignore
            map.setView([selectedTrain?.TrainData.Latititute, selectedTrain?.TrainData.Longitute])

        }

    }, [trains, selectedTrain])


    useEffect(() => {
        if (trainId) {
            let trainsParam = trains?.filter((train) => train.TrainNoLocal == trainId)
            if (trainsParam?.[0]) {
                setSelectedTrain(trainsParam[0])
                map?.setZoom(13)
            }
        }
    }, [trains])


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


    if (!trains || !stations) return <main className={styles.main}>
        <h1>Loading</h1>
        {!trains && <span>Loading trains...</span>}
        <br />        <br />
        {!stations && <span>Loading stations...</span >}
    </main >

    const center = [51.505, -0.09]
    const rectangle = [
        [51.49, -0.08],
        [51.5, -0.06],
    ]



    return (
        <>
            <SelectedTrainPopup />
            <MapContainer
                center={[50.270908, 19.039993]}
                zoom={10}
                ref={setMap}
                scrollWheelZoom={true}
                style={{ height: "100vh", width: "100vw" }}
            >
                {trains.map(train => (<TrainMarker key={train.TrainNoLocal} train={train} />))}

                {stations.map(station => (<StationMarker key={station.Name} station={station} />))}

                <Control prepend position='topleft'>
                    <div onClick={() => router.push('/')} className={styles.controls}>

                        <span className="material-symbols-outlined">
                            arrow_back
                        </span>

                    </div>
                </Control>
                <Control position='topleft'>

                    <div onClick={() => {
                        let newTheme = (theme === 'light' ? 'dark' : 'light')
                        setTheme(newTheme);
                        document.body.className = newTheme;

                        localStorage.removeItem('theme')
                        localStorage.setItem('theme', newTheme)

                    }} className={styles.controls}>

                        <span className="material-symbols-outlined">
                            {theme === 'light' ? 'light_mode' : 'dark_mode'}
                        </span>

                    </div>
                </Control>



                {/* <LayersControl position="topright">
                    <LayersControl.BaseLayer checked name="Day mode"> */}
                <TileLayer className={styles.test}
                    attribution='&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> | <a href = "https://discord.gg/d65Q8gWM5W" > Created by SimRail France 🇫🇷 Community </a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {/* </LayersControl.BaseLayer> */}
                {/* <LayersControl.BaseLayer name="Night mode">
                        <TileLayer
                            attribution='&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> | <a href = "https://discord.gg/d65Q8gWM5W" > Created by SimRail France 🇫🇷 Community </a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                    </LayersControl.BaseLayer> */}
                {/* </LayersControl> */}
            </MapContainer >
        </>
    )
}

export default Map
