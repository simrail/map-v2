import type { Server } from "@simrail/types";
import Head from "next/head";
import { type ComponentType, useCallback, useEffect, useState } from "react";

import EUFlag from "@/components/EUFlag";
import FavoriteStar from "@/components/FavoriteStar";
import { TopNavigation } from "@/components/TopNavigation";
import { WorldFlag } from "@/components/WorldFlag";

import { readServerSettings } from "../types/ServerSettings";

import styles from "../styles/Home.module.css";

const sortServers = (servers: Server[]) =>
	[...servers].sort((first, second) => {
		const favoriteDifference =
			Number(readServerSettings(second.id).favorite) -
			Number(readServerSettings(first.id).favorite);
		if (favoriteDifference !== 0) return favoriteDifference;

		const frenchServerDifference =
			Number(second.ServerName.startsWith("FR")) -
			Number(first.ServerName.startsWith("FR"));
		if (frenchServerDifference !== 0) return frenchServerDifference;

		return first.ServerCode.localeCompare(second.ServerCode);
	});

export default function Home() {
	const [servers, setServers] = useState<Server[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	const getServers = useCallback((signal?: AbortSignal) => {
		fetch("https://panel.simrail.eu:8084/servers-open", { signal })
			.then((response) => {
				if (!response.ok) throw new Error(`Request failed: ${response.status}`);
				return response.json();
			})
			.then((stations) => {
				setServers(sortServers(stations.data as Server[]));
				setError(null);
			})
			.catch((requestError: Error) => {
				if (requestError.name !== "AbortError") {
					setError("Could not load servers. Retrying automatically…");
				}
			});
	}, []);

	useEffect(() => {
		const controller = new AbortController();
		getServers(controller.signal);

		const interval = window.setInterval(
			() => getServers(controller.signal),
			10000,
		);
		const resortServers = () =>
			setServers((currentServers) =>
				currentServers ? sortServers(currentServers) : currentServers,
			);
		window.addEventListener("server-favorite-change", resortServers);

		return () => {
			controller.abort();
			window.clearInterval(interval);
			window.removeEventListener("server-favorite-change", resortServers);
		};
	}, [getServers]);

	const getStatusIndicatorStyle = (server: Server) => {
		if (server.IsActive) return styles.online;
		return styles.offline;
	};

	return (
		<>
			<Head>
				<title>SimRail - Map</title>
				<meta
					name="description"
					content="Select your servers to visualize the trains and stations"
				/>
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<link rel="icon" href="/favicon.ico" />
			</Head>
			<TopNavigation disableMapFeatures={true} />
			<main className={styles.main}>
				<h1 className={styles.title}>Select your server</h1>
				{!servers && "Loading servers..."}
				{error && <p role="alert">{error}</p>}
				<div className={styles.serverList}>
					{servers?.map((server: Server) => {
						return (
							<a
								id={server.ServerCode}
								className="server"
								key={server.id}
								href={`/server/${server.ServerCode}`}
							>
								<FavoriteStar server={server} />
								<span
									className={`${styles.statusIndicator} ${getStatusIndicatorStyle(server)}`}
								/>
								<span className="serverName">
									<FlagIcon
										code={
											server.ServerCode.match(/[A-Za-z]+/)?.at(0) ??
											server.ServerCode.slice(0, 2)
										}
									/>
									<span>{server.ServerName}</span>
								</span>
							</a>
						);
					})}
				</div>
			</main>
			<style jsx>
				{`
					.server {
						background: rgba(54, 54, 58, 0.8);
						padding: 8px 32px;
						margin: 8px;
						border-radius: 12px;
						width: 60%;
						flex-direction: row;
						transition: all 200ms ease-in-out;
						align-self: center;
						justify-self: center;
						position: relative;
						text-align: start;
						font-size: 23px;
					}

					.serverName {
						margin-left: 32px;
						margin-right: 16px;
						transition: all 200ms ease-in-out;
						display: flex;
						gap: 16px;
						font-weight: 600;
						align-items: center;
					}

					.server:hover .serverName {
						margin-left: 48px;
					}
					.server:hover {
						background: #111114;
					}

					@media (max-width: 1280px) {
						.server {
							width: 80%;
						}
					}
				`}
			</style>
		</>
	);
}

interface FlagIconProperties {
	code: string;
}

const FlagIcon = ({ code }: FlagIconProperties) => {
	const [Component, setComponent] = useState<ComponentType<{
		w: number;
	}> | null>(null);

	useEffect(() => {
		if (code) {
			import("mantine-flagpack")
				.then((mod) => {
					type FlagPackType = {
						[key: string]: ComponentType<{ w: number }>;
					};

					const flagPack = mod as unknown as FlagPackType;

					let lang = code.toUpperCase();
					if (lang === "EN") lang = "GB";
					if (lang === "EU") {
						setComponent(() => EUFlag);
						return;
					}
					if (lang === "INT") {
						setComponent(() => WorldFlag);
						return;
					}

					const FlagComponent = flagPack[`${lang}Flag`];
					if (FlagComponent) {
						setComponent(() => FlagComponent);
					} else {
						console.error("Flag component not found for code:", lang);
					}
				})
				.catch((err) => {
					console.error("Failed to load flag icon", err);
				});
		}
	}, [code]);

	if (!Component) {
		return null; // Or some fallback UI
	}

	return <Component w={28} />;
};
