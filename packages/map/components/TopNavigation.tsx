import { useComputedColorScheme, useMantineColorScheme } from "@mantine/core";
import { spotlight } from "@mantine/spotlight";
import { useSelectedTrain } from "contexts/SelectedTrainContext";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import {
	MdArrowBack,
	MdClose,
	MdHome,
	MdMenu,
	MdOutlineDarkMode,
	MdOutlineLightMode,
	MdSearch,
} from "react-icons/md";

import serverTimes from "@/components/serverTimes.json";

import { NavigationDropdown } from "./NavigationDropdown";

import style from "../styles/TopNavigation.module.css";

type TopNavigationProps = {
	disableMapFeatures?: boolean;
};

export const TopNavigation = ({ disableMapFeatures }: TopNavigationProps) => {
	const [serverDate, setServerDate] = useState<Date>();
	const { selectedTrain, setSelectedTrain } = useSelectedTrain();
	const { setColorScheme } = useMantineColorScheme();
	const computedColorScheme = useComputedColorScheme("dark", {
		getInitialValueInEffect: true,
	});
	const [dropdown, setDropdown] = useState(false);
	const menuButtonRef = useRef<HTMLButtonElement>(null);
	const router = useRouter();
	const { id, trainId } = router.query;
	const serverCode = Array.isArray(id) ? id[0] : id;
	useEffect(() => {
		const serverUtcOffsetSeconds = serverTimes.find(
			(server) => server.code === serverCode,
		)?.offsetSeconds;
		if (serverUtcOffsetSeconds === undefined) return;

		const updateServerDate = () =>
			setServerDate(new Date(Date.now() + serverUtcOffsetSeconds * 1000));
		updateServerDate();
		const timer = window.setInterval(updateServerDate, 1000);
		return () => window.clearInterval(timer);
	}, [serverCode]);

	useEffect(() => {
		if (!dropdown) return;
		const closeMenu = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setDropdown(false);
				menuButtonRef.current?.focus();
			}
		};
		window.addEventListener("keydown", closeMenu);
		return () => window.removeEventListener("keydown", closeMenu);
	}, [dropdown]);

	return (
		<header className={style.header}>
			<nav className={style.navigation} aria-label="Primary navigation">
				<div className={style.left}>
					{disableMapFeatures ? (
						<a
							href="https://www.simrail.app"
							className={style.iconButton}
							aria-label="Return to SimRail home"
						>
							<MdHome size={22} />
						</a>
					) : (
						<>
							<Link
								href="/"
								className={style.iconButton}
								aria-label="Change server"
							>
								<MdArrowBack size={22} />
							</Link>
							<button
								ref={menuButtonRef}
								type="button"
								className={style.iconButton}
								onClick={() => setDropdown((current) => !current)}
								aria-label="Open navigation menu"
								aria-expanded={dropdown}
								aria-controls="navigation-menu"
							>
								<MdMenu size={22} />
							</button>
						</>
					)}
					<img
						src="/logos/icon.png"
						alt=""
						width={34}
						height={34}
						className={style.logo}
					/>
					<span className={style.title}>SimRail Live Map</span>
					{serverCode && (
						<span className={style.serverCode}>{serverCode.toUpperCase()}</span>
					)}
					{!disableMapFeatures && (
						<span className={style.connection} title="Live data connected" />
					)}
				</div>

				{serverDate && (
					<time className={style.datetime} dateTime={serverDate.toISOString()}>
						<span className={style.time}>
							{serverDate.getUTCHours().toString().padStart(2, "0")}:
							{serverDate.getUTCMinutes().toString().padStart(2, "0")}
						</span>
						<span className={style.date}>
							{serverDate.getUTCDate().toString().padStart(2, "0")}/
							{(serverDate.getUTCMonth() + 1).toString().padStart(2, "0")}/
							{serverDate.getUTCFullYear()}
						</span>
					</time>
				)}

				<div className={style.right}>
					{!disableMapFeatures && (
						<>
							{selectedTrain && (
								<button
									type="button"
									className={`${style.iconButton} ${style.dangerButton}`}
									aria-label="Close selected train"
									onClick={() => {
										setSelectedTrain(null);
										if (trainId) void router.replace(`/server/${String(id)}`);
									}}
								>
									<MdClose size={22} />
								</button>
							)}
							<button
								type="button"
								className={style.searchButton}
								onClick={spotlight.open}
								aria-label="Search trains, players and stations"
							>
								<MdSearch size={20} />
								<span>Search</span>
								<kbd>⌘ K</kbd>
							</button>
							<button
								type="button"
								className={style.iconButton}
								onClick={() =>
									setColorScheme(
										computedColorScheme === "light" ? "dark" : "light",
									)
								}
								aria-label="Toggle color scheme"
							>
								<MdOutlineLightMode className={style.lightModeIcon} size={22} />
								<MdOutlineDarkMode className={style.darkModeIcon} size={22} />
							</button>
						</>
					)}
				</div>
			</nav>
			{dropdown && <NavigationDropdown />}
		</header>
	);
};
