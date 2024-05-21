// @ts-nocheck
import { getTrainImagePath } from "./Markers/TrainMarker";
import Image from 'next/image';

type TrainTextProps = {
    train: Train
    username: string
    avatar: string | null
}

const TrainText = ({ train, username }: TrainTextProps) => {

    // This code is trash as it needs comments, should just be rewritten
    let originTrainType = train.Vehicles[0];
    let trainTypes = [];
    let trainAmount = 1;
    let totalTrainAmount = 1;
    let trainImages = [];
    trainImages.push(<><Image src={getTrainImagePath(train.Vehicles[0])} width={"195"} height={"80"} alt={train.Vehicles[0]} /><br /></>); // first train image
    for (let i = 1; i < train.Vehicles.length; i++) {
        if (train.Vehicles[i] === originTrainType) {
            trainAmount++, totalTrainAmount++;
            trainImages.push(<><Image src={getTrainImagePath(train.Vehicles[i])} width={"195"} height={"80"} alt={train.Vehicles[i]} /><br /></>);
        }
    }

    let trainAmountString = '';
    if (trainAmount > 1) 
        trainAmountString = `x${trainAmount}`;
    trainTypes.push(<>Type: {train.Vehicles[0]} {trainAmountString}<br /></>)

    //This loop is for multiple locos / EMU's
    for (let i = 1; i < train.Vehicles.length; i++) {
        trainAmount = 0;
        if (train.Vehicles[i].split("/")[0] == originTrainType.split("/")[0] && train.Vehicles[i] != originTrainType) { // If  it is a diffrent subversion of train type
            for (let j = 0; j < train.Vehicles.length; j++) {
                if (train.Vehicles[j] === train.Vehicles[i]) 
                    trainAmount++, totalTrainAmount++;
            }
            trainAmountString = '';
            if (trainAmount > 1) 
                trainAmountString = `x${trainAmount}`;
            if (train.Vehicles[i].split("/")[0] == "201E") // 201E not capable of multi traction
                trainTypes.push(<>Type: {train.Vehicles[i]} {trainAmountString} - cold<br /></>)
            else
                trainTypes.push(<>Type: {train.Vehicles[i]} {trainAmountString}<br /></>)
            trainImages.push(<><Image src={getTrainImagePath(train.Vehicles[i])} width={"200"} height={"85"} alt={"Failed to load " + train.Vehicles[i]} /><br /></>);
            totalTrainAmount++;
        }
    }

    //This code is for the wagons text
    let wagonsAmount = train.Vehicles.length - totalTrainAmount;
    let wagonsAmountString = ''
    if (wagonsAmount > 0)
        wagonsAmountString = <>Wagons: x{wagonsAmount} <br /></>;

    // This code is for the signal infront text
    let distanceToSignal = (train.TrainData.DistanceToSignalInFront/1000).toFixed(1) + "km"
    if (train.TrainData.DistanceToSignalInFront < 1000)
        distanceToSignal = Math.round(train.TrainData.DistanceToSignalInFront) + "m"
    if (train.TrainData.SignalInFront == null )
        distanceToSignal = '> 5km'

    let signalInfront = '';
    if(train.TrainData.SignalInFront != null && train.TrainData.SignalInFront.includes("@"))
        signalInfront = ' ' + train.TrainData.SignalInFront.split("@")[0];
    
    let SignalInFrontSpeed = train.TrainData.SignalInFrontSpeed + ' km/h'
    if (SignalInFrontSpeed == '32767 km/h')
        SignalInFrontSpeed = 'vmax';
    if (train.TrainData.SignalInFront == null )
        SignalInFrontSpeed = 'Signal too far away'

    let signalInfo = <></>
    if (localStorage.getItem('showSignalInfo') == 'true') {
        signalInfo = 
        <>
        Distance to signal{signalInfront}: {distanceToSignal}<br />
        Signal speed: {SignalInFrontSpeed} <br />
        </>
    }

    return (
        <>
            {trainImages}
            {trainTypes}
            Train: {train.TrainName} {train.TrainNoLocal}<br />
            {wagonsAmountString}
            User: {username}<br />
            Speed: {Math.round(train.TrainData.Velocity)} km/h<br />
            Departure: {train.StartStation}<br />
            Destination: {train.EndStation}<br />
            {signalInfo}
        </>
    )
}

export default TrainText;
