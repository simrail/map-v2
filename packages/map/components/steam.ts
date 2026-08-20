import type { ProfileResponse } from "types/SteamProfile";

const getSteamProfileInfos = (steamId: string): Promise<ProfileResponse> =>
	fetch(`https://simrail-edr.emeraldnetwork.xyz/steam/${steamId}`).then((r) =>
		r.json(),
	);

export async function getSteamProfileOrBot(steamId: string | null | undefined) {
	if (steamId)
		return getSteamProfileInfos(steamId).then(
			(profile): [string | null, string] => [
				profile.avatar,
				profile.personaname,
			],
		);

	return [null, "BOT"] as [null, string];
}
