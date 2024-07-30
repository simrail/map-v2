import styles from "../styles/Home.module.css";
import type { Server } from "@simrail/types";
import { MouseEventHandler, useState } from "react";
import { AiFillStar, AiOutlineStar } from "react-icons/ai";
import type { ServerSettings } from "../types/ServerSettings";
import { useRouter } from "next/router";

type FavoriteStarProps = {
	server: Server;
};

export default function FavoriteStar({ server }: FavoriteStarProps) {
	const serverSettings: ServerSettings = JSON.parse(
		localStorage.getItem(`server-${server.id}`) ?? "{}",
	);
	const router = useRouter();

	const [favorite, SetFavorite] = useState<boolean>(
		serverSettings.favorite ?? false,
	);

	// @ts-expect-error todo
	const toggleFavorite = (event) => {
		event.preventDefault();
		serverSettings.favorite = !favorite;
		SetFavorite(!favorite);
		localStorage.setItem(`server-${server.id}`, JSON.stringify(serverSettings));
		router.reload();
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
