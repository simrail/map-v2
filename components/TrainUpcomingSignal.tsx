import { Train } from "@simrail/types";
import React from "react";
import Image from "next/image";

type TrainSignalProps = {
  train: Train;
};

const signalStates = {
  open: "signal-open.png",
  limited40: "signal-limited-40.png",
  limited60: "signal-limited-60.png",
  limited100: "signal-limited-100.png",
  closed: "signal-closed.png",
};

const getSignalState = (signalSpeed: number | string) => {
  if (signalSpeed === "vmax" || signalSpeed === 32767) {
    return "open";
  }

  if (signalSpeed === 0) {
    return "closed";
  }

  if (typeof signalSpeed === "number" && signalSpeed <= 40) {
    return "limited40";
  }

  if (typeof signalSpeed === "number" && signalSpeed <= 60) {
    return "limited60";
  }

  if (typeof signalSpeed === "number" && signalSpeed <= 100) {
    return "limited100";
  }

  return null;
};

const TrainUpcomingSignal = ({ train }: TrainSignalProps) => {
  // Définition de signalInfront
  let signalInfront = "";
  if (
    train.TrainData.SignalInFront !== null &&
    train.TrainData.SignalInFront.includes("@")
  ) {
    signalInfront = " " + train.TrainData.SignalInFront.split("@")[0];
  }

  // Définition de distanceToSignal
  let distanceToSignal;
  if (
    train.TrainData.DistanceToSignalInFront === null ||
    train.TrainData.DistanceToSignalInFront === 0
  ) {
    distanceToSignal = "> 5km";
  } else if (train.TrainData.DistanceToSignalInFront < 1000) {
    distanceToSignal =
      Math.round(train.TrainData.DistanceToSignalInFront) + "m";
  } else {
    distanceToSignal =
      (train.TrainData.DistanceToSignalInFront / 1000).toFixed(1) + "km";
  }

  // Définition de SignalInFrontSpeed
  let SignalInFrontSpeed;
  if (train.TrainData.SignalInFront === null) {
    SignalInFrontSpeed = "Signal too far away";
  } else if (train.TrainData.SignalInFrontSpeed === 32767) {
    SignalInFrontSpeed = "vmax";
  } else if (train.TrainData.SignalInFrontSpeed === 0) {
    SignalInFrontSpeed = "0 km/h";
  } else {
    SignalInFrontSpeed = train.TrainData.SignalInFrontSpeed + " km/h";
  }

  const signalSpeed = train.TrainData.SignalInFrontSpeed;
  const signalState = getSignalState(signalSpeed);
  const signalImageSrc = signalState
    ? `/signals/${signalStates[signalState]}`
    : null;

  return (
    <>
      Distance to signal{signalInfront}: {distanceToSignal}
      <br />
      Signal speed: {SignalInFrontSpeed}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "0.8rem" }}>Signal Status</span>
        {SignalInFrontSpeed === "Signal too far away" ? (
          <span style={{ fontSize: "0.8rem" }}>Signal too far away</span>
        ) : SignalInFrontSpeed === "0 km/h" ? (
          <Image
            src={`/signals/${signalStates.closed}`}
            alt="closed"
            width={32}
            height={32}
          />
        ) : (
          signalImageSrc && (
            <Image
              src={signalImageSrc}
              alt={signalState ?? ""}
              width={32}
              height={32}
            />
          )
        )}
      </div>
    </>
  );
};

export default TrainUpcomingSignal;
