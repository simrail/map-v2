import Image from 'next/image';
import railcarJson from "@/components/railcars.json";
import {Train} from "@simrail/types";
import {Railcar} from "../types/Railcar";
import {useMemo} from "react";
import TrainUpcomingSignal from "@/components/TrainUpcomingSignal";

type TrainTextProps = {
    train: Train
    username: string
    avatar: string | null
}

interface TrainRailcarInfo {
    /** The index in the train where the railcar is located */
    index: number,
    /** The railcar being used. */
    railcar: Railcar,
    /** The load weight, in case this is a wagon. Null if no specific load weight is known. */
    loadWeight: number | null,
}

function getTrainDisplayName(rawTrainName: string, trainNumber: string): string {
    // note: replacement is needed as some train names contain extra white spaces (accidentally?)
    // which makes further work with them way harder. example: 'RPJ  - S1'
    const nameParts = rawTrainName.replace(/\s/g, "").split("-");
    if (nameParts.length > 1) {
        if (nameParts[0] === "ROJ" || nameParts[0] === "RPJ") {
            // special case: local trains have a line identifier appended to them, display that as well
            // results in f. ex. 'ROJ 91352 (RE1)'
            return `${nameParts[0]} ${trainNumber} (${nameParts[1]})`;
        } else {
            // usual case for passenger trains: the train type is the second identifier
            // results in f. ex. 'IC 13125'
            return `${nameParts[1]} ${trainNumber}`;
        }
    } else {
        // usual case for all freight trains, they don't have an additional special identifier
        // results in f. ex. 'PWJ 146035'
        return `${nameParts[0]} ${trainNumber}`;
    }
}

function extractVehicleInformation(rawVehicleName: string): [string, number | null] {
    if (rawVehicleName.includes(":")) {
        // in case the name includes a ':' there is information about the load mass and brake regime included
        // that we want to extract here. example: '424Z/424Z_brazowy:P:40@RandomContainerAll'
        const vehicleNameParts = rawVehicleName.split(":");
        const loadWeight = vehicleNameParts[2].split("@")[0];
        return [vehicleNameParts[0], +loadWeight];
    } else {
        // raw vehicle name is just the name of the vehicle
        return [rawVehicleName, null];
    }
}

const TrainText = ({train, username}: TrainTextProps) => {
    const usedRailcarInfo = useMemo(() => train.Vehicles.map((rawVehicleName, index) => {
        const [vehicleName, loadWeight] = extractVehicleInformation(rawVehicleName);
        const railcar = railcarJson.filter((info) => info.apiName === vehicleName).at(0);
        if (railcar) {
            return {
                index,
                railcar: railcar as Railcar,
                loadWeight: loadWeight,
            }
        }
    }).filter((item): item is TrainRailcarInfo => !!item), [train.Vehicles]);

    // get all wagons and locomotives/EMUs used in the set
    const wagons = usedRailcarInfo.filter((info) => info.railcar.railcarType === "WAGON");
    const locomotives = usedRailcarInfo.filter((info) => info.railcar.railcarType !== "WAGON");

    // get images for all locomotives, but only one per type
    const locomotiveImages = locomotives
        .reduce((acc, current) => {
            if (!acc.some(item => item.railcar.id === current.railcar.id)) {
                acc.push(current);
            }
            return acc;
        }, [] as TrainRailcarInfo[])
        .map((info) => {
            return (<>
                <Image src={`/trains/${info.railcar.id}.png`}
                       key={`${info.railcar.id}@${info.index}`}
                       alt={info.railcar.id}
                       width={"195"}
                       height={"80"}/>
                <br/>
            </>)
        });

    // get some general information about the wagon count
    const wagonCount = wagons.length;
    const freightWagonCount = wagons.filter((wagon) => wagon.railcar.freightTransportation).length;
    const passengerWagonCount = wagons.filter((wagon) => wagon.railcar.passengerTransportation).length;

    // only the first unit is responsible for train traction at the moment, so this is just safe to assume
    // however, this might be wrong in case the first unit is not yet registered in railcars.json, so we just
    // fall back to displaying the raw api name in that case
    const tractionUnit = locomotives.at(0);
    const tractionUnitInfo = tractionUnit && tractionUnit.index === 0
        ? `${tractionUnit.railcar.id} (${tractionUnit.railcar.designation})`
        : train.Vehicles[0];

    // extract information about other units that are travelling in the pack
    const additionalUnitCount = locomotives.filter((info) => info.index !== 0).length;

    // calculate train length and weight
    // for some reason this calculation differs (sometimes!) from the value displayed in game. Note
    // entirely sure what is happening and which calculation is correct, but for indication purposes this
    // should be good enough (mostly only a few tons/meters off the length that is displayed in game).
    const trainLength = usedRailcarInfo
        .map((info) => info.railcar.length)
        .reduce((partial, current) => partial + current, 0);
    const trainWeight = usedRailcarInfo
        .map((info) => {
            const loadWeight = info.loadWeight || 0;
            return loadWeight + info.railcar.weight;
        })
        .reduce((partial, current) => partial + current, 0);

    return (
        <>
            {locomotiveImages}
            Train: {getTrainDisplayName(train.TrainName, train.TrainNoLocal)}<br/>
            Main Unit: {tractionUnitInfo}<br/>
            {additionalUnitCount > 0 && <>Other Units: x{additionalUnitCount}<br/></>}
            {wagonCount > 0 && <>Wagons: x{wagonCount} (P: {passengerWagonCount}, F: {freightWagonCount})<br/></>}
            Length / Weight: {trainLength}m / {trainWeight}t<br/>
            User: {username}<br/>
            Speed: {Math.round(train.TrainData.Velocity)} km/h<br/>
            Departure: {train.StartStation}<br/>
            Destination: {train.EndStation}<br/>
            {localStorage.getItem('showSignalInfo') === "true" && <><TrainUpcomingSignal train={train}/><br/></>}
        </>
    )
}

export default TrainText;
