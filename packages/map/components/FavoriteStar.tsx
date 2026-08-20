import type { Server } from "@simrail/types";
import { type MouseEvent, useState } from "react";
import { AiFillStar, AiOutlineStar } from "react-icons/ai";

import { readServerSettings } from "../types/ServerSettings";

import styles from "../styles/Home.module.css";

type FavoriteStarProps = {
	server: Server;
};

export default function FavoriteStar({ server }: FavoriteStarProps) {
	const [favorite, setFavorite] = useState(
		() => readServerSettings(server.id).favorite,
	);

	const toggleFavorite = (event: MouseEvent<SVGElement>) => {
		event.preventDefault();
		event.stopPropagation();
		const nextFavorite = !favorite;
		setFavorite(nextFavorite);
		localStorage.setItem(
			`server-${server.id}`,
			JSON.stringify({ favorite: nextFavorite }),
		);
		window.dispatchEvent(new Event("server-favorite-change"));
	};

	if (favorite) {
		return (
			<AiFillStar
				size={24}
				color="#FF9900"
				className={styles.star}
				onClick={toggleFavorite}
			/>
		);
	}
	return (
		<AiOutlineStar size={24} className={styles.star} onClick={toggleFavorite} />
	);
}
