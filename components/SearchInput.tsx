import { Center, Flex, Space } from '@mantine/core';
import { Train } from '@simrail/types';
import { useSelectedTrain } from 'contexts/SelectedTrainContext';
import Script from 'next/script';
import { useState } from 'react';
import { useMap } from 'react-leaflet';
import style from '../styles/SearchInput.module.css';
import { getSteamProfileOrBot } from '@/components/steam';


type SearchInputProps = {
    trains: Train[]
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

export const SearchInput = ({ trains }: SearchInputProps) => {

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
                    <input className={inputTheme} type="text" value={searchInput} placeholder="Enter a train number or username"
                        onKeyDown={(event) => {
                            if (event.code === 'Enter') {
                                setSelectedTrain(searchedTrains[0])
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

                        }}>{ControlledByToString(train.TrainData.ControlledBySteamID)} - {train.TrainNoLocal} - {train.TrainName}</li>
                    )}
                </ul>
            </div>
        </div>
    </div >
}
