import type { Server } from "@simrail/types";
import { useState } from "react";
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

	const toggleFavorite = () => {
		const nextFavorite = !favorite;
		setFavorite(nextFavorite);
		localStorage.setItem(
			`server-${server.id}`,
			JSON.stringify({ favorite: nextFavorite }),
		);
		window.dispatchEvent(new Event("server-favorite-change"));
	};

	const Icon = favorite ? AiFillStar : AiOutlineStar;

	return (
		<button
			type="button"
			className={styles.star}
			onClick={toggleFavorite}
			aria-label={`${favorite ? "Remove" : "Add"} ${server.ServerName} ${favorite ? "from" : "to"} favorites`}
			aria-pressed={favorite}
		>
			<Icon size={21} color={favorite ? "#ffb442" : undefined} />
		</button>
	);
}
