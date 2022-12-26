// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from 'next'


type SteamProfileResponse = {
    response: SteamProfilePlayerList,
}

type SteamProfilePlayerList = {
    players: SteamProfilePlayer[]
}

type SteamProfilePlayer = {
    avatarmedium: string,
    personaname: string,
}

type ProfileResponse = {
    avatarUrl: string,
    username: string,
}
export type { ProfileResponse }
export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<ProfileResponse | { error: true }>
) {
    const { steamid } = req.query

    if (!steamid) return res.status(400).json({ error: true });

    let data = await fetch("http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=" + process.env.STEAM_TOKEN + "&steamids=" + steamid)
    let steamProfileResponse: SteamProfileResponse = await data.json()


    if (!steamProfileResponse.response.players[0]) return res.status(400).json({ error: true });

    let avatar = steamProfileResponse.response.players[0].avatarmedium
    let username = steamProfileResponse.response.players[0].personaname


    res.setHeader('Cache-Control', 's-maxage=86400');
    res.status(200).json({ avatarUrl: avatar, username: username })
}
