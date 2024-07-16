import { Center, Flex, Space } from '@mantine/core';
import { Train } from '@simrail/types';
import { useSelectedTrain } from 'contexts/SelectedTrainContext';
import Script from 'next/script';
import { useState } from 'react';
import { useMap } from 'react-leaflet';
import style from '../styles/SearchInput.module.css';
import { getSteamProfileOrBot } from '@/components/steam';
import { Station } from '@simrail/types'
import { LatLng } from 'leaflet';

type SearchInputProps = {
    trains: Train[]
    stations: Station[]
}

class user {
    username: string = "";
    steamID: string = "";
    constructor(username: string, steamID: string) {
        this.username = username
        this.steamID = steamID
    }
}

export var usernames: user[] = []

export const SearchInput = ({ trains, stations }: SearchInputProps) => {

    const [searchInput, setSearch] = useState('');
    const { selectedTrain, setSelectedTrain } = useSelectedTrain()
    const map = useMap();

    // This is prob stupid
    const theme = localStorage.getItem('theme');
    var inputBoxTheme
    var inputTheme
    var listTheme
    switch(theme) {
        case 'dark':
            inputBoxTheme = style.inputBoxDark
            inputTheme = style.inputDark
            listTheme = style.listDark
        break;
        case 'light':
            inputBoxTheme = style.inputBoxLight
            inputTheme = style.inputLight
            listTheme = style.listLight
        break;
    }

    var userIDs = []
    for (let i = 0; i < trains.length; i++) {
        if (trains[i].Type === "user" && trains[i] != null)
            userIDs.push(trains[i].TrainData.ControlledBySteamID)
    }

    async function getUsernames(userIDs: (string | null | undefined)[]) {
        var localUsernames: user[] = []
        for (let i = 0; i < userIDs.length; i++) {
            let profile = await getSteamProfileOrBot(userIDs[i])

            if (profile[1] != null && userIDs[i] != null) {
                localUsernames.push(new user(profile[1], userIDs[i]!))
            }
        }

        usernames = localUsernames
    }

    let searchedTrains: Train[] = trains.filter((train) => train.TrainNoLocal.startsWith(searchInput)).slice(0, 5)
    let searchedTrainTypes: Train[] = trains.filter((train) => train.TrainName.toLowerCase().includes(searchInput.toLowerCase())).slice(0, 5)
    let searchedTrainLocomotives: Train[] = trains.filter((train) => train.Vehicles[0].toLowerCase().includes(searchInput.toLowerCase())).slice(0,5)
    let searchedStations: Station[] = stations.filter((station) => station.Name.toLowerCase().startsWith(searchInput.toLowerCase())).slice(0, 5)

    if (searchedTrains.length === 0) {
        getUsernames(userIDs)
        for (let j = 0; j < trains.length; j++) {
            let train = trains[j]
            for (let i = 0; i < usernames.length; i++) {
                if (train.TrainData.ControlledBySteamID != null) {
                    if (usernames[i].username.toLowerCase().startsWith(searchInput.toLowerCase()) && train.TrainData.ControlledBySteamID === usernames[i].steamID) {
                        searchedTrains.push(train)
                        break
                    }
                } 
            }
        }
        searchedTrains = searchedTrains.slice(0, 5)
   }

   function ControlledByToString(id: string | null) {
    if (id === null)
        return "Bot"
    for (let users of usernames) {
        if (users.steamID == id)
            return users.username
    }
    return "Error"
   }
   
    return <div className={style.wrapper}>
        <div className={style.container}>
            <div className={style.content}>
                <div className={inputBoxTheme}>
                    <input className={inputTheme} type="text" value={searchInput} placeholder="Enter Train/Username/Station"
                        onKeyDown={(event) => {
                            if (event.code === 'Enter') {
                                if (searchedTrains.length != 0){
                                    setSelectedTrain(searchedTrains[0])
                                }
                                else if (searchedTrainTypes.length != 0) {
                                    setSelectedTrain(searchedTrainTypes[0])
                                }
                                else if (searchedTrainLocomotives.length != 0 ) {
                                    setSelectedTrain(searchedTrainLocomotives[0])
                                }
                                else if (searchedStations.length != 0){
                                    map?.panTo(new LatLng(searchedStations[0].Latititude, searchedStations[0].Longitude))
                                }
                                setSearch('')
                                map?.setZoom(13)
                            }
                        }}
                        onChange={(event) => setSearch(event.target.value)} />
                </div>
                <ul className={listTheme}>
                    {searchInput && searchedTrains.map(train =>
                        <li key={train.id} className={style.item} onClick={() => {
                            setSearch('')
                            setSelectedTrain(train)
                            map?.setZoom(13)
                        }}>{train.TrainNoLocal} - {ControlledByToString(train.TrainData.ControlledBySteamID)} - {train.TrainName}</li>
                    )}
                    {searchInput && searchedTrainTypes.map(train =>
                        <li key={train.id} className={style.item} onClick={() => {
                            setSearch('')
                            setSelectedTrain(train)
                            map?.setZoom(13)
                        }}>{train.TrainNoLocal} - {ControlledByToString(train.TrainData.ControlledBySteamID)} - {train.TrainName}</li>
                    )}
                    {searchInput && searchedTrainLocomotives.map(train =>
                        <li key={train.id} className={style.item} onClick={() => {
                            setSearch('')
                            setSelectedTrain(train)
                            map?.setZoom(13)
                        }}>{train.TrainNoLocal} - {ControlledByToString(train.TrainData.ControlledBySteamID)} - {train.TrainName}</li>
                    )}
                    {searchInput && searchedStations.map(station =>
                        <li key={station.id} className={style.item} onClick={() => {
                            setSearch('')
                            map?.panTo(new LatLng(station.Latititude, station.Longitude))
                            map?.setZoom(13)
                        }}>{station.Name} - {station.Prefix}</li>
                    )}
                </ul>
            </div>
        </div>
    </div >
}
