import { Center, Flex, Space } from '@mantine/core';
import { Train } from '@simrail/types';
import { useSelectedTrain } from 'contexts/SelectedTrainContext';
import Script from 'next/script';
import { useState } from 'react';
import { useMap } from 'react-leaflet';
import style from '../styles/SearchInput.module.css';


type SearchInputProps = {
    trains: Train[]
}
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

    let searchedTrains = trains.filter((train) => train.TrainNoLocal.startsWith(searchInput)).slice(0, 5)


    return <div className={style.wrapper}>
        <div className={style.container}>
            <div className={style.content}>
                <div className={inputBoxTheme}>
                    <input className={inputTheme} type="text" value={searchInput} placeholder="Enter your train number"
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

                        }}>{train.TrainNoLocal} - {train.TrainName}</li>
                    )}
                </ul>
            </div>
        </div>

    </div >
}
