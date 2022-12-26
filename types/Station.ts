type Station = {
    Name: string,
    Prefix: string,
    DifficultyLevel: bigint,
    MainImageURL: string,
    AdditionalImage1URL: string,
    AdditionalImage2URL: string,
    DispatchedBy: DispatchedBy[],
    Latititude: number,
    Longitude: number,
    id: string,
}

type DispatchedBy = {
    ServerCode: string,
    SteamId: string,
}

export type { Station }