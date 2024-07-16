import { LayerGroup, LayersControl, MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css'
import "leaflet-defaulticon-compatibility";
import { useCallback, useEffect, useState } from "react";
import { StationMarker } from "./Markers/StationMarker";
import { Train, Station } from "@simrail/types";
import styles from '../styles/Home.module.css'
import { LayersControlEvent, Map as LeafletMap } from 'leaflet';
import { useSelectedTrain } from '../contexts/SelectedTrainContext';
import SelectedTrainPopup from './SelectedTrainPopup';
import Control from 'react-leaflet-custom-control'
import { useRouter } from 'next/router';
import { TrainsList } from "@/components/TrainsList";
import NonPlayableStations from "@/components/NonPlayableStations";
import { SearchInput } from './SearchInput';

type MapProps = {
    serverId: string | string[]
}

const Map = ({ serverId }: MapProps) => {
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

    const [renderPopup, setRenderPopup] = useState<boolean>()

    useEffect(() => {
        let data = localStorage.getItem('renderPopup')
        if (data) {
            let dataBool
            switch(data) {
                case 'true':
                    dataBool = true;
                    break;

                case 'false':
                    dataBool = false;
                    break;
                
                default:
                    dataBool = true;
                    break;
            }
            setRenderPopup(dataBool)
            //document.body.className = data
            // Comment lower down, please fix this
        }
    }, [setRenderPopup])

    const [showSignalInfo, setShowSignalInfo] = useState<boolean>()

    useEffect(() => {
        let data = localStorage.getItem('showSignalInfo')
        if (data) {
            let dataBool
            switch(data) {
                case 'true':
                    dataBool = true;
                    break;

                case 'false':
                    dataBool = false;
                    break;
                
                default:
                    dataBool = true;
                    break;
            }
            setShowSignalInfo(dataBool)
            //document.body.className = data
            // Comment lower down, please fix this
        }
    }, [setShowSignalInfo])

    const { selectedTrain, setSelectedTrain } = useSelectedTrain()
    const [stations, setStations] = useState<Station[] | null>(null)


    const getTrains = useCallback(() => {
        fetch('https://panel.simrail.eu:8084/trains-open?serverCode=' + serverId)
            .then((res) => res.json())
            .then((fetchedTrains) => {
                setTrains(fetchedTrains.data)
            })
    }, [serverId]);

    const getStations = useCallback(() => {
        fetch('https://panel.simrail.eu:8084/stations-open?serverCode=' + serverId)
            .then((res) => res.json())
            .then((stations) => {

                let stationsData: Station[] = stations.data

                // @ts-ignore
                setStations(stationsData)
            })
    }, [serverId]);



    useEffect(() => {
        if (selectedTrain && map && trains) {
            // @ts-ignore
            setSelectedTrain(trains.find(train => train.id === selectedTrain.id) ?? null)
            // @ts-ignore
            map.setView([selectedTrain?.TrainData.Latititute, selectedTrain?.TrainData.Longitute], undefined, { animate: true, duration: 5, easeLinearity: 0.5 })
        }
    }, [trains, selectedTrain, map])


    useEffect(() => {
        if (trainId) {
            let trainsParam = trains?.filter((train) => train.TrainNoLocal == trainId)
            if (trainsParam?.[0]) {
                setSelectedTrain(trainsParam[0])
                map?.setZoom(13)
            }
        }
    }, [trains, map, trainId])

    var controlTheme
    switch(theme) {
        case 'dark':
            controlTheme = styles.controlsDark
        break;

        case 'light':
            controlTheme = styles.controlsLight
        break;
    }

    useEffect(() => {
        getTrains()
        getStations()

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

    useEffect(() => {

        if (!map) return;

        map.on('overlayadd', function (event: LayersControlEvent) {
            localStorage.setItem('layer-' + event.name.toLowerCase(), 'true')
        });

        map.on('overlayremove', function (event: LayersControlEvent) {
            localStorage.setItem('layer-' + event.name.toLowerCase(), 'false')
        });

    }, [map])

    if (!trains || !stations) return <main className={styles.main}>
        <h1>Loading</h1>
        {!trains && <span>Loading trains...</span>}
        <br />        <br />
        {!stations && <span>Loading stations...</span >}
    </main >

    return (
        <>
            <SelectedTrainPopup />
            <MapContainer
                center={[50.270908, 19.039993]}
                zoom={10}
                ref={setMap}
                scrollWheelZoom={true}
                style={{ height: "100vh", width: "100vw"}}
            >

                <SearchInput trains={trains} stations={stations} />

                <Control prepend position='topleft'>
                    <div onClick={() => router.push('/servers')} className={controlTheme}>

                        <span className="material-symbols-outlined">
                            arrow_back
                        </span>

                    </div>
                </Control>
                <Control position='topleft'>
                    <a href='https://discord.gg/d65Q8gWM5W' rel="noreferrer" target="_blank" className={controlTheme} style={{ padding: "6px 3px" }}>
                        <svg width="24" height="18" viewBox="0 0 24 18" fill="#7289da" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20.307 1.49591C18.787 0.798593 17.1412 0.292475 15.4269 5.17344e-05C15.4119 -0.00042132 15.3969 0.00235455 15.3831 0.00818421C15.3693 0.0140139 15.3569 0.0227558 15.3469 0.0337931C15.1412 0.404946 14.9012 0.888569 14.7412 1.25972C12.9228 0.989793 11.0736 0.989793 9.2553 1.25972C9.09529 0.877322 8.85529 0.404946 8.63814 0.0337931C8.62671 0.011299 8.59242 5.17344e-05 8.55814 5.17344e-05C6.8438 0.292475 5.20947 0.798593 3.678 1.49591C3.66657 1.49591 3.65515 1.50716 3.64372 1.5184C0.53506 6.09596 -0.322107 10.5498 0.100762 14.9586C0.100762 14.9811 0.112191 15.0036 0.135048 15.0149C2.19225 16.4995 4.16945 17.3992 6.12378 17.9953C6.15807 18.0066 6.19236 17.9953 6.20379 17.9728C6.66094 17.3543 7.07238 16.7019 7.42668 16.0159C7.44954 15.9709 7.42668 15.9259 7.38096 15.9146C6.72952 15.6672 6.11236 15.3748 5.50662 15.0374C5.46091 15.0149 5.46091 14.9474 5.4952 14.9136C5.62091 14.8237 5.74663 14.7224 5.87235 14.6325C5.89521 14.61 5.92949 14.61 5.95235 14.6212C9.88389 16.387 14.124 16.387 18.0098 14.6212C18.0327 14.61 18.067 14.61 18.0898 14.6325C18.2155 14.7337 18.3413 14.8237 18.467 14.9249C18.5127 14.9586 18.5127 15.0261 18.4556 15.0486C17.8612 15.3973 17.2327 15.6784 16.5812 15.9259C16.5355 15.9371 16.5241 15.9934 16.5355 16.0271C16.9012 16.7132 17.3127 17.3655 17.7584 17.9841C17.7927 17.9953 17.827 18.0066 17.8612 17.9953C19.827 17.3992 21.8042 16.4995 23.8614 15.0149C23.8843 15.0036 23.8957 14.9811 23.8957 14.9586C24.3986 9.86372 23.0614 5.44363 20.3527 1.5184C20.3413 1.50716 20.3299 1.49591 20.307 1.49591ZM8.02098 12.2706C6.8438 12.2706 5.86092 11.2021 5.86092 9.88621C5.86092 8.57031 6.82095 7.50184 8.02098 7.50184C9.23244 7.50184 10.1925 8.58155 10.181 9.88621C10.181 11.2021 9.22101 12.2706 8.02098 12.2706ZM15.9869 12.2706C14.8097 12.2706 13.8269 11.2021 13.8269 9.88621C13.8269 8.57031 14.7869 7.50184 15.9869 7.50184C17.1984 7.50184 18.1584 8.58155 18.147 9.88621C18.147 11.2021 17.1984 12.2706 15.9869 12.2706Z" />
                        </svg>
                    </a>
                </Control>
                
                <Control position='topleft'>

                    <div onClick={() => {
                        let newTheme = (theme === 'light' ? 'dark' : 'light')
                        setTheme(newTheme);
                        document.body.className = newTheme;

                        localStorage.removeItem('theme')
                        localStorage.setItem('theme', newTheme)

                    }} className={controlTheme}>

                        <span className="material-symbols-outlined">
                            {theme === 'light' ? 'light_mode' : 'dark_mode'}
                        </span>

                    </div>
                </Control>

                <Control position='topleft'>

                    <div onClick={() => {
                        let newRenderPopup = (renderPopup === true ? false : true)
                        setRenderPopup(newRenderPopup);
                        // document.body.className = newRenderPopup.valueOf().toString(); 
                        // This ruins the theme, anyone that knows the programing language unlike me should be able to fix this

                        localStorage.removeItem('renderPopup')
                        localStorage.setItem('renderPopup', newRenderPopup.valueOf().toString())

                    }} className={controlTheme}>

                        <span className="material-symbols-outlined">
                            {renderPopup === true ? 'Speaker_Notes' : 'Speaker_Notes_Off'}
                        </span>

                    </div>
                </Control>

                <Control position='topleft'>

                    <div onClick={() => {
                        let newShowSignalInfo = (showSignalInfo === true ? false : true)
                        setShowSignalInfo(newShowSignalInfo);
                        // document.body.className = newRenderPopup.valueOf().toString(); 
                        // This ruins the theme, anyone that knows the programing language unlike me should be able to fix this

                        localStorage.removeItem('showSignalInfo')
                        localStorage.setItem('showSignalInfo', newShowSignalInfo.valueOf().toString())

                    }} className={controlTheme}>

                        <span className="material-symbols-outlined">
                            {showSignalInfo === true ? 'infoarrow_drop_down' : 'infoarrow_drop_up'}
                        </span>

                    </div>
                </Control>

                <TileLayer className={styles.test}
                    attribution='&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> | &copy; <a href="http://www.openrailwaymap.org/">OpenRailwayMap</a> | <a href = "https://discord.gg/d65Q8gWM5W" > Created by SimRail France 🇫🇷 Community </a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LayersControl position="bottomright" collapsed={false}>
                    <LayersControl.Overlay
                        checked={localStorage.getItem('layer-trains') === null || localStorage.getItem('layer-trains') === 'true'}
                        name="Trains">
                        <LayerGroup>
                            <TrainsList trains={trains} />
                        </LayerGroup>
                    </LayersControl.Overlay>

                    <LayersControl.Overlay checked={localStorage.getItem('layer-dispatch stations') === null || localStorage.getItem('layer-dispatch stations') === 'true'} name="Dispatch stations">
                        <LayerGroup>
                            {stations.map(station => (<StationMarker key={station.Name} station={station} />))}
                        </LayerGroup>
                    </LayersControl.Overlay>

                    <LayersControl.Overlay 
                        checked={localStorage.getItem('layer-unplayable dispatch stations') === null || localStorage.getItem('layer-unplayable dispatch stations') === 'true'}
                        name="Unplayable dispatch stations">
                        <LayerGroup>
                            <NonPlayableStations />
                        </LayerGroup>
                    </LayersControl.Overlay>

                    <LayersControl.Overlay 
                        checked={localStorage.getItem('layer-Signalling') === 'true'} 
                        name="Signalling">
                        <LayerGroup>
                            <TileLayer
                                url="https://{s}.tiles.openrailwaymap.org/signals/{z}/{x}/{y}.png" 
                                // Looks a bit wired in dark mode due to .css putting everything in a greyscale but it is still possible to differ the signalling systems.
                            />
                        </LayerGroup>
                    </LayersControl.Overlay>

                    <LayersControl.Overlay 
                        checked={localStorage.getItem('layer-Speed') === 'true'} 
                        name="Track Speed (Not 100% accurate)">
                        <LayerGroup>
                            <TileLayer
                                url="https://{s}.tiles.openrailwaymap.org/maxspeed/{z}/{x}/{y}.png" 
                                // Looks a bit wired in dark mode due to .css putting everything in a greyscale but it is still possible to differ the signalling systems.
                            />
                        </LayerGroup>
                    </LayersControl.Overlay>
                </LayersControl>
                {/* {/* </LayersControl> */}
            </MapContainer >
        </>
    )
}

export default Map