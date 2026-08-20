export type ServerSettings = {
	favorite: boolean;
};

export function readServerSettings(serverId: string): ServerSettings {
	if (typeof window === "undefined") return { favorite: false };

	try {
		const settings = JSON.parse(
			localStorage.getItem(`server-${serverId}`) ?? "{}",
		);
		return { favorite: settings.favorite === true };
	} catch {
		return { favorite: false };
	}
}
