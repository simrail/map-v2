import {ProfileResponse} from "../pages/api/profile";

export const getSteamProfileInfos = (steamId: string): Promise<ProfileResponse> =>
        fetch('/api/profile?steamid=' + steamId).then((r) => r.json());
