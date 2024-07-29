import { LayerGroup, LayersControl, MapContainer, TileLayer, Tooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css'
import "leaflet-defaulticon-compatibility";
import { useCallback, useEffect, useState } from "react";
import { StationMarker } from "./Markers/StationMarker";
import { Train, Station } from "@simrail/types";
import styles from '../styles/Home.module.css'
import { LatLng, LayersControlEvent, Map as LeafletMap } from 'leaflet';
import { useSelectedTrain } from '../contexts/SelectedTrainContext';
import SelectedTrainPopup from './SelectedTrainPopup';
import Control from 'react-leaflet-custom-control'
import { useRouter } from 'next/router';
import { TrainsList } from "@/components/TrainsList";
import NonPlayableStations from "@/components/NonPlayableStations";
import { useTheme } from 'contexts/ThemeContext';
import style from '../styles/BottomLeftControls.module.css';
import { MdFullscreen, MdFullscreenExit, MdOutlineTraffic, MdSpeakerNotes, MdSpeakerNotesOff, MdTraffic, MdZoomIn, MdZoomOut } from 'react-icons/md';
import { useFullscreen } from '@mantine/hooks';
import { FaDiscord, FaGithub } from "react-icons/fa";
import SpotlightSearch from './SpotlightSearch';
import { Tooltip as MantineTooltip, TooltipProps } from '@mantine/core';
import { MainlineSignals, OtherSignals } from "@/components/Signals"

type MapProps = {
    serverId: string | string[]
}

const Map = ({ serverId }: MapProps) => {
    const [map, setMap] = useState<LeafletMap | null>(null);

    const router = useRouter();

    const { trainId } = router.query


    const [trains, setTrains] = useState<Train[] | null>(null)

    const { theme, setTheme } = useTheme();


    const [renderPopup, setRenderPopup] = useState<boolean>()

    useEffect(() => {
        let data = localStorage.getItem('renderPopup')
        if (data) {
            let dataBool
            switch (data) {
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
    const { toggle: toggleFullscreen, fullscreen } = useFullscreen();
    let FullscreenIcon = (fullscreen ? MdFullscreenExit : MdFullscreen);



    const [showSignalInfo, setShowSignalInfo] = useState<boolean>()
    let ShowSignalStatusIcon = (showSignalInfo === true ? MdTraffic : MdOutlineTraffic)
    let RenderPopupIcon = (renderPopup === true ? MdSpeakerNotes : MdSpeakerNotesOff)


    useEffect(() => {
        let data = localStorage.getItem('showSignalInfo')
        if (data) {
            let dataBool
            switch (data) {
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
    switch (theme) {
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


    const Tooltip = ({ label, children }: TooltipProps) => (
        <MantineTooltip label={label} position='right' zIndex={99999}>
            {children}
        </MantineTooltip>
    );


    return (
        <>
            <SelectedTrainPopup />
            <MapContainer
                center={[50.270908, 19.039993]}
                zoom={10}
                ref={setMap}
                scrollWheelZoom={true}
                zoomControl={false}
                style={{ height: "100vh", width: "100vw" }}
            >

                <Control position='bottomleft'>
                    <div className={style.container}>
                        <Tooltip label="Our GitHub" position='right'>
                            <a href='https://github.com/simrail/map-v2' rel="noreferrer" target="_blank" className={style.icon}  >
                                <FaGithub color='white' size={32} />
                            </a>
                        </Tooltip>

                        <Tooltip label="Our Discord (French)" position='right'>

                            <a href='https://discord.gg/d65Q8gWM5W' rel="noreferrer" target="_blank" className={[style.icon, style.discord].join(" ")}>
                                <FaDiscord color='white' size={32} />
                            </a>
                        </Tooltip>

                        {map && <>
                            <Tooltip label="Zoom in" position='right'>
                                <button className={style.icon}>
                                    <MdZoomIn onClick={() => map.zoomIn()} size={24} />
                                </button>
                            </Tooltip>
                            <Tooltip label="Zoom out" position='right'>
                                <button className={style.icon}>
                                    <MdZoomOut onClick={() => map.zoomOut()} size={24} />
                                </button>
                            </Tooltip>
                        </>
                        }
                        <Tooltip label={(renderPopup ? 'Hide' : 'Show') + ' train pop-up'} position='right'>
                            <button className={style.icon}>
                                <RenderPopupIcon onClick={() => {
                                    let newRenderPopup = (renderPopup === true ? false : true)
                                    setRenderPopup(newRenderPopup);
                                    // document.body.className = newRenderPopup.valueOf().toString(); 
                                    // This ruins the theme, anyone that knows the programing language unlike me should be able to fix this

                                    localStorage.removeItem('renderPopup')
                                    localStorage.setItem('renderPopup', newRenderPopup.valueOf().toString())

                                }} size={24} />
                            </button>

                        </Tooltip>
                        <Tooltip label={(showSignalInfo ? 'Hide' : 'Show') + ' signal info'} position='right'>
                            <button className={style.icon}>

                                <ShowSignalStatusIcon onClick={() => {
                                    let newShowSignalInfo = (showSignalInfo === true ? false : true)
                                    setShowSignalInfo(newShowSignalInfo);
                                    // document.body.className = newRenderPopup.valueOf().toString(); 
                                    // This ruins the theme, anyone that knows the programing language unlike me should be able to fix this
                                    localStorage.removeItem('showSignalInfo')
                                    localStorage.setItem('showSignalInfo', newShowSignalInfo.valueOf().toString())

                                }} size={24} />
                            </button>
                        </Tooltip>

                        <Tooltip label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} position='right'>
                            <button className={style.icon}>
                                <FullscreenIcon onClick={() => toggleFullscreen()} size={24} />
                            </button>
                        </Tooltip>

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
                        checked={localStorage.getItem('layer-mainline-signals') === null || localStorage.getItem('layer-mainline-signals') === 'true'}
                        name="Mainline signals">
                        <LayerGroup>
                            <MainlineSignals />
                        </LayerGroup>
                    </LayersControl.Overlay>

                    <LayersControl.Overlay 
                        checked={localStorage.getItem('layer-other-signals') === null || localStorage.getItem('layer-other-signals') === 'true'}
                        name="Other signals">
                        <LayerGroup>
                            <OtherSignals />
                        </LayerGroup>
                    </LayersControl.Overlay>

                    <LayersControl.Overlay
                        checked={localStorage.getItem('layer-Signalling') === 'true'}
                        name="Signalling (Not 100% accurate)">
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
                <SpotlightSearch stations={stations} trains={trains} />
            </MapContainer >
        </>
    )
}

export default Map