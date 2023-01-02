// @ts-nocheck
import { getTrainImagePath, TrainMarker } from "./TrainMarker";
import { useSelectedTrain } from '../contexts/AppContext';
import Image from 'next/image';
import { AiOutlineClose } from 'react-icons/ai'
import styles from '../styles/SelectedTrainPopup.module.css'

const SelectedTrainPopup = () => {

    const { selectedTrain, setSelectedTrain } = useSelectedTrain()

    return (
        <>
            {selectedTrain &&
                <div className={styles.popup}>
                    <AiOutlineClose onClick={() => setSelectedTrain(null)} size={32} className={styles.closeButton} />
                    <Image src={getTrainImagePath(selectedTrain)} width={"64"} height={"64"} alt={selectedTrain.Vehicles[0]} /><br />
                    Locomotive: {selectedTrain.Vehicles[0]}<br />
                    Train: {selectedTrain.TrainName} {selectedTrain.TrainNoLocal}<br />
                    {/* User: {username}<br /> */}
                    Speed: {Math.round(selectedTrain.TrainData.Velocity)} km/h<br />
                    Departure: {selectedTrain.StartStation}<br />
                    Destination: {selectedTrain.EndStation}<br />
                </div>
            }
        </>

    )
}

export default SelectedTrainPopup;
