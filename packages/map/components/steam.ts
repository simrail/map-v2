import type { ProfileResponse } from "types/SteamProfile";

const profileCache = new Map<string, Promise<[string | null, string]>>();

const getSteamProfileInfos = async (
	steamId: string,
): Promise<ProfileResponse> => {
	const response = await fetch(
		`https://simrail-edr.emeraldnetwork.xyz/steam/${steamId}`,
	);
	if (!response.ok)
		throw new Error(`Profile request failed: ${response.status}`);
	return response.json() as Promise<ProfileResponse>;
};

export async function getSteamProfileOrBot(steamId: string | null | undefined) {
	if (steamId) {
		const cachedProfile = profileCache.get(steamId);
		if (cachedProfile) return cachedProfile;

		const profileRequest = getSteamProfileInfos(steamId).then(
			(profile): [string | null, string] => [
				profile.avatar,
				profile.personaname,
			],
		);
		profileCache.set(steamId, profileRequest);
		profileRequest.catch(() => profileCache.delete(steamId));
		return profileRequest;
	}

	return [null, "BOT"] as [null, string];
}
