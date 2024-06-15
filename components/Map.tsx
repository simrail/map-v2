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
import { MdChat, MdFullscreen, MdFullscreenExit, MdOutlineTraffic, MdSpeakerNotes, MdSpeakerNotesOff, MdTraffic, MdZoomIn, MdZoomOut } from 'react-icons/md';
import { FaDiscord, FaGithub } from "react-icons/fa";
import { useFullscreen } from '@mantine/hooks';

type MapProps = {
    serverId: string | string[]
}

const Map = ({ serverId }: MapProps) => {
    const [map, setMap] = useState<LeafletMap | null>(null);

    const router = useRouter();

    const { trainId } = router.query
    const { toggle: toggleFullscreen, fullscreen } = useFullscreen();
    let FullscreenIcon = (fullscreen ? MdFullscreenExit : MdFullscreen);


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

    //     const interval1 = setInterval(() => {
    //         getTrains()
    //     }, 2000)

    //     const interval2 = setInterval(() => {
    //         getStations()
    //     }, 10000)


    //     return function () {
    //         clearInterval(interval1)
    //         clearInterval(interval2)
    //     }

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

    let ShowSignalStatusIcon = ( showSignalInfo === true ? MdTraffic : MdOutlineTraffic)
    let RenderPopupIcon = (renderPopup === true ? MdSpeakerNotes : MdSpeakerNotesOff)




    return (
        <>
            <SelectedTrainPopup />
            <MapContainer
                center={[50.270908, 19.039993]}
                zoom={10}
                ref={setMap}
                scrollWheelZoom={true}
                zoomControl={false}
                style={{ height: "100%", width: "100%"}}
            >

                <SearchInput trains={trains} stations={stations} />


                
                <Control position='bottomleft'>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <a href='https://discord.gg/d65Q8gWM5W' rel="noreferrer" target="_blank" style={{ background: '#5865F2', }} className={styles.icon}>
                            <FaDiscord style={{fontSize: '28px', color: 'white'}}   />
                        </a>
                        <a href='https://github.com/simrail/map-v2' rel="noreferrer" target="_blank" className={styles.icon}>
                            <FaGithub style={{fontSize: '28px', color: 'white'}}   />
                        </a>
                        <a onClick={() => {
                            let newRenderPopup = (renderPopup === true ? false : true)
                            setRenderPopup(newRenderPopup);
                            // document.body.className = newRenderPopup.valueOf().toString(); 
                            // This ruins the theme, anyone that knows the programing language unlike me should be able to fix this

                            localStorage.removeItem('renderPopup')
                            localStorage.setItem('renderPopup', newRenderPopup.valueOf().toString())

                        }}  className={styles.icon}>
                            <RenderPopupIcon style={{ fontSize: '28px', color: 'white' }} />
                        </a>


                        <a className={styles.icon} onClick={() => {
                            let newShowSignalInfo = (showSignalInfo === true ? false : true)
                            setShowSignalInfo(newShowSignalInfo);
                            // document.body.className = newRenderPopup.valueOf().toString(); 
                            // This ruins the theme, anyone that knows the programing language unlike me should be able to fix this
                            localStorage.removeItem('showSignalInfo')
                            localStorage.setItem('showSignalInfo', newShowSignalInfo.valueOf().toString())

                        }} >

                            <ShowSignalStatusIcon style={{ fontSize: '28px', color: 'white' }} />

                        </a>

                        <a className={styles.icon} onClick={() => { map?.zoomIn() }}>
                            <MdZoomIn style={{ fontSize: '28px', color: 'white' }} />
                        </a>
                        <a className={styles.icon} onClick={() => { map?.zoomOut() }}>
                            <MdZoomOut style={{ fontSize: '28px', color: 'white' }} />
                        </a>
                        <a className={styles.icon} onClick={() => { toggleFullscreen() }}>
                            <FullscreenIcon style={{ fontSize: '28px', color: 'white' }} />
                        </a>
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