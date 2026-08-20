import type { Server } from "@simrail/types";
import Head from "next/head";
import Link from "next/link";
import {
	Fragment,
	type ComponentType,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { MdRefresh, MdSearch, MdTrain } from "react-icons/md";

import { AdSlot } from "@/components/AdSlot";
import EUFlag from "@/components/EUFlag";
import FavoriteStar from "@/components/FavoriteStar";
import { TopNavigation } from "@/components/TopNavigation";
import { WorldFlag } from "@/components/WorldFlag";

import { readServerSettings } from "../types/ServerSettings";

import styles from "../styles/Home.module.css";

const SERVER_REFRESH_INTERVAL = 15_000;

const SERVER_AD_SLOTS = {
	leaderboard: process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_SERVERS_LEADERBOARD_SLOT,
	inFeed: process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_SERVERS_INFEED_SLOT,
	rail: process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_SERVERS_RAIL_SLOT,
};

const sortServers = (servers: Server[]) =>
	[...servers].sort((first, second) => {
		const favoriteDifference =
			Number(readServerSettings(second.id).favorite) -
			Number(readServerSettings(first.id).favorite);
		if (favoriteDifference !== 0) return favoriteDifference;

		const activeDifference = Number(second.IsActive) - Number(first.IsActive);
		if (activeDifference !== 0) return activeDifference;

		return first.ServerCode.localeCompare(second.ServerCode, undefined, {
			numeric: true,
		});
	});

export default function Home() {
	const [servers, setServers] = useState<Server[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [isRefreshing, setIsRefreshing] = useState(false);

	const getServers = useCallback(async (signal?: AbortSignal) => {
		setIsRefreshing(true);
		try {
			const response = await fetch(
				"https://panel.simrail.eu:8084/servers-open",
				{
					signal,
				},
			);
			if (!response.ok) throw new Error(`Request failed: ${response.status}`);
			const payload = (await response.json()) as { data: Server[] };
			setServers(sortServers(payload.data));
			setError(null);
		} catch (requestError) {
			if ((requestError as Error).name !== "AbortError") {
				setError("Live server data is temporarily unavailable.");
			}
		} finally {
			if (!signal?.aborted) setIsRefreshing(false);
		}
	}, []);

	useEffect(() => {
		const controller = new AbortController();

		const refresh = () => {
			if (document.visibilityState === "visible") {
				void getServers(controller.signal);
			}
		};
		const initialRefresh = window.setTimeout(refresh, 0);
		const interval = window.setInterval(refresh, SERVER_REFRESH_INTERVAL);
		const resortServers = () =>
			setServers((currentServers) =>
				currentServers ? sortServers(currentServers) : currentServers,
			);
		window.addEventListener("server-favorite-change", resortServers);

		return () => {
			controller.abort();
			window.clearTimeout(initialRefresh);
			window.clearInterval(interval);
			window.removeEventListener("server-favorite-change", resortServers);
		};
	}, [getServers]);

	const filteredServers = useMemo(() => {
		const normalizedQuery = query.trim().toLocaleLowerCase();
		if (!normalizedQuery) return servers ?? [];
		return (servers ?? []).filter((server) =>
			`${server.ServerName} ${server.ServerCode}`
				.toLocaleLowerCase()
				.includes(normalizedQuery),
		);
	}, [query, servers]);

	const onlineCount = servers?.filter((server) => server.IsActive).length ?? 0;

	return (
		<>
			<Head>
				<title>SimRail Live Map — Choose a server</title>
				<meta
					name="description"
					content="Explore live SimRail trains, dispatch stations, signals and player activity."
				/>
				<meta name="viewport" content="width=device-width, initial-scale=1" />
			</Head>
			<TopNavigation disableMapFeatures />
			<main className={styles.main}>
				<div className={styles.backdrop} aria-hidden="true" />
				<section className={styles.content}>
					<header className={styles.hero}>
						<div className={styles.eyebrow}>
							<span className={styles.liveDot} /> Live network overview
						</div>
						<h1 className={styles.title}>Where do you want to drive?</h1>
						<p className={styles.subtitle}>
							Choose a server to explore live trains, dispatchers and railway
							traffic across the SimRail network.
						</p>
						{servers && (
							<div className={styles.summary} aria-label="Network summary">
								<span>
									<strong>{onlineCount}</strong> online
								</span>
								<span aria-hidden="true">·</span>
								<span>{servers.length} servers</span>
								{isRefreshing && (
									<span className={styles.syncing}>Syncing…</span>
								)}
							</div>
						)}
					</header>
					<AdSlot placement="rail" slotId={SERVER_AD_SLOTS.rail} />

					<div className={styles.toolbar}>
						<label className={styles.search}>
							<MdSearch size={21} aria-hidden="true" />
							<span className={styles.srOnly}>Search servers</span>
							<input
								type="search"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search by region or server…"
							/>
						</label>
						<button
							type="button"
							className={styles.refreshButton}
							onClick={() => void getServers()}
							disabled={isRefreshing}
						>
							<MdRefresh size={20} aria-hidden="true" />
							<span>Refresh</span>
						</button>
					</div>

					{error && (
						<div className={styles.error} role="alert">
							<span>{error}</span>
							<button type="button" onClick={() => void getServers()}>
								Try again
							</button>
						</div>
					)}
					<AdSlot
						placement="leaderboard"
						slotId={SERVER_AD_SLOTS.leaderboard}
					/>

					<div className={styles.serverList} aria-live="polite">
						{!servers &&
							Array.from({ length: 6 }, (_, index) => (
								<div className={styles.skeleton} key={index} />
							))}
						{servers && filteredServers.length === 0 && (
							<div className={styles.emptyState}>
								<MdTrain size={30} aria-hidden="true" />
								<strong>No matching servers</strong>
								<span>Try a server code, country or region.</span>
							</div>
						)}
						{filteredServers.map((server, index) => (
							<Fragment key={server.id}>
								<article className={styles.serverCard}>
									<Link
										id={server.ServerCode}
										className={styles.serverLink}
										href={`/server/${server.ServerCode}`}
										aria-label={`Open ${server.ServerName}${server.IsActive ? ", online" : ", offline"}`}
									>
										<span className={styles.flagWrap}>
											<FlagIcon
												code={
													server.ServerCode.match(/[A-Za-z]+/)?.at(0) ??
													server.ServerCode.slice(0, 2)
												}
											/>
										</span>
										<span className={styles.serverDetails}>
											<strong>{server.ServerName}</strong>
											<span>{server.ServerCode.toUpperCase()}</span>
										</span>
										<span
											className={`${styles.status} ${server.IsActive ? styles.online : styles.offline}`}
										>
											<span className={styles.statusDot} />
											{server.IsActive ? "Online" : "Offline"}
										</span>
										<span className={styles.arrow} aria-hidden="true">
											→
										</span>
									</Link>
									<FavoriteStar server={server} />
								</article>
								{index === 5 && (
									<AdSlot placement="inFeed" slotId={SERVER_AD_SLOTS.inFeed} />
								)}
							</Fragment>
						))}
					</div>
				</section>
			</main>
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
		if (!code) return;
		let active = true;

		void import("mantine-flagpack").then((flagPack) => {
			if (!active) return;
			let language = code.toUpperCase();
			if (language === "EN") language = "GB";
			if (language === "EU") return setComponent(() => EUFlag);
			if (language === "INT") return setComponent(() => WorldFlag);

			const FlagComponent = (
				flagPack as unknown as Record<string, ComponentType<{ w: number }>>
			)[`${language}Flag`];
			if (FlagComponent) setComponent(() => FlagComponent);
		});

		return () => {
			active = false;
		};
	}, [code]);

	return Component ? (
		<Component w={30} />
	) : (
		<span className={styles.flagFallback} />
	);
};
