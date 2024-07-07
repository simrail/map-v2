import { Train } from "@simrail/types";
import React from "react";

type TrainSignalProps = {
  train: Train;
};

const signalStates = {
  open: "signal-open.png",
  limited40: "signal-limited-40.png",
  limited60: "signal-limited-60.png",
  limited100: "signal-limited-100.png",
  limited130: "signal-limited-130.png",
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

  if (typeof signalSpeed === "number" && signalSpeed <= 130) {
    return "limited130";
  }

  return null;
};

const signalStyles = {
  container: {
    display: "flex",
    gap: "0.25rem",
  },
  row: {
    display: "flex",
    alignItems: "center",
  },
  label: {
    marginRight: "0.5rem",
  },
  value: {
    fontWeight: "bold",
  },
  statusLabel: {
    fontSize: "0.9rem",
    marginRight: "0.5rem",
  },
  statusValue: {
    fontSize: "0.8rem",
    color: "gray",
  },
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

  const isSignalTooFar = distanceToSignal === "> 5km";

  return (
    <div style={{ ...signalStyles.container, flexDirection: "column" }}>
      <div style={signalStyles.row}>
        <span style={signalStyles.label}>
          Distance to signal{signalInfront}:
        </span>
        <span style={signalStyles.value}>{distanceToSignal}</span>
      </div>
      {!isSignalTooFar && (
        <>
          <div style={signalStyles.row}>
            <span style={signalStyles.label}>Signal speed:</span>
            <span style={signalStyles.value}>{SignalInFrontSpeed}</span>
          </div>
          <div style={signalStyles.row}>
            <span style={signalStyles.statusLabel}>Signal Status :</span>
            {SignalInFrontSpeed === "Signal too far away" ? (
              <span style={signalStyles.statusValue}>Signal too far away</span>
            ) : SignalInFrontSpeed === "0 km/h" ? (
              <img
                src={`/signals/${signalStates.closed}`}
                alt="closed"
                width={30}
                height={30}
              />
            ) : (
              signalImageSrc && (
                <img
                  src={signalImageSrc}
                  alt={signalState ?? ""}
                  width={30}
                  height={30}
                />
              )
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default TrainUpcomingSignal;
