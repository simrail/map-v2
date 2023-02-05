import {ProfileResponse} from "../pages/api/profile";

const getSteamProfileInfos = (steamId: string): Promise<ProfileResponse> =>
    fetch('/api/profile?steamid=' + steamId).then((r) => r.json());

export async function getSteamProfileOrBot(steamId: string | null | undefined) {
    if (steamId)
        return getSteamProfileInfos(steamId)
            .then((profile) => [profile.avatarUrl, profile.username])
    else
        return Promise.resolve(["BOT", null]);
}