import type { ProfileResponse } from "types/SteamProfile";

const getSteamProfileInfos = (steamId: string): Promise<ProfileResponse> =>
	fetch(`https://simrail-edr.emeraldnetwork.xyz/steam/${steamId}`).then((r) =>
		r.json(),
	);

export async function getSteamProfileOrBot(steamId: string | null | undefined) {
	if (steamId)
		return getSteamProfileInfos(steamId).then((profile) => [
			profile.avatar,
			profile.personaname,
		]);

	return Promise.resolve([null, "BOT"]);
}
