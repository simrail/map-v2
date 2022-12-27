type Train = {
    TrainNoLocal: string,
    TrainName: string,
    StartStation: string,
    EndStation: string,
    Vehicles: string[],
    ServerCode: string,
    TrainData: TrainData,
    id: string,
    Type: "bot" | "user";

}

type TrainData = {
    ControlledBySteamID: string | null
    InBorderStationArea: boolean,
    Latititute: number,
    Longitute: number,
    Velocity: number,
    SignalInFront: string,
    DistanceToSignalInFront: number,
    VDDelayedTimetableIndex: bigint,
}

export type { Train }