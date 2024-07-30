type SteamProfileResponse = {
	response: SteamProfilePlayerList;
};

type SteamProfilePlayerList = {
	players: SteamProfilePlayer[];
};

type SteamProfilePlayer = {
	avatarmedium: string;
	personaname: string;
};

type ProfileResponse = {
	avatar: string;
	personaname: string;
};
export type { ProfileResponse };
