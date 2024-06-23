import {Train} from "@simrail/types";
import React from "react";

type TrainSignalProps = {
    train: Train;
};

function formatSignalDistance(distanceMeters: number): string {
    if (distanceMeters > 1000) {
        // signal is more than 1 kilometer away, display in kilometers
        const distanceKilometers = (distanceMeters / 1000).toFixed(1);
        return `${distanceKilometers.toString().replace(/\./g, ',')} km`;
    } else {
        // closer than 1 kilometer, display in kilometers
        return `${distanceMeters.toFixed(1).toString().replace(/\./g, ',')} m`;
    }
}

function formatSignalSpeed(rawSpeedLimit: number): string {
    if (rawSpeedLimit === 32767) {
        return "vmax";
    } else {
        return `${rawSpeedLimit} km/h`;
    }
}

const TrainUpcomingSignal: React.FC<TrainSignalProps> = ({train}) => {
    const {TrainData: {SignalInFront, SignalInFrontSpeed, DistanceToSignalInFront}} = train;

    // signal names contain some sort of identifier delimited with a '@' which is
    // completely irrelevant to the user so just remove it: 'KMB_M@-10828,8-1721,6'
    const signalName = SignalInFront?.split("@")[0];

    return (
        <>
            {signalName && <>Distance to signal {signalName}: {formatSignalDistance(DistanceToSignalInFront)}</>}
            {!signalName && <>Distance to signal: {">5km"}</>}
            {signalName && <><br/>Signal speed: {formatSignalSpeed(SignalInFrontSpeed)}</>}
        </>
    );
};

export default TrainUpcomingSignal;
