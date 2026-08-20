import { useMantineColorScheme } from "@mantine/core";
import { spotlight } from "@mantine/spotlight";
import { useSelectedTrain } from "contexts/SelectedTrainContext";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import {
	MdArrowBack,
	MdClose,
	MdHome,
	MdMenu,
	MdOutlineDarkMode,
	MdOutlineLightMode,
	MdSearch,
} from "react-icons/md";

// import { NavigationDropdown } from './NavigationDropdown';
import serverTimes from "@/components/serverTimes.json";

import { NavigationDropdown } from "./NavigationDropdown";

import style from "../styles/TopNavigation.module.css";

type TopNavigationProps = {
	disableMapFeatures?: boolean;
};

export const TopNavigation = ({ disableMapFeatures }: TopNavigationProps) => {
	const [blinking, setBlinking] = useState(false);
	const [serverDate, setServerDate] = useState<Date>();
	const { selectedTrain, setSelectedTrain } = useSelectedTrain();

	const { colorScheme, setColorScheme } = useMantineColorScheme();
	const [dropdown, setDropdown] = useState<boolean>(false);

	const router = useRouter();
	const { id, trainId } = router.query;
	const serverCode = Array.isArray(id) ? id[0] : id;

	useEffect(() => {
		const serverUtcOffsetSeconds = serverTimes.find(
			(server) => server.code === serverCode,
		)?.offsetSeconds;

		if (serverUtcOffsetSeconds === undefined) return;

		const updateServerDate = () => {
			setBlinking((currentBlinking) => !currentBlinking);
			setServerDate(new Date(Date.now() + serverUtcOffsetSeconds * 1000));
		};

		updateServerDate();
		const timer = window.setInterval(updateServerDate, 1000);
		return () => window.clearInterval(timer);
	}, [serverCode]);

	const Icon = colorScheme === "dark" ? MdOutlineLightMode : MdOutlineDarkMode;

	return (
		<div>
			<nav className="navigation">
				<div className={style.left}>
					{disableMapFeatures ? (
						<>
							<MdHome
								onClick={() => {
									window.location.href = "https://www.simrail.app";
								}}
								size={24}
								className={style.icons}
							/>
						</>
					) : (
						<>
							<MdArrowBack
								onClick={() => router.push("/")}
								className={style.icons}
								size={24}
							/>
							<MdMenu
								onClick={() => setDropdown(!dropdown)}
								className={style.icons}
								size={24}
							/>
						</>
					)}
					<img
						src="/logos/icon.png"
						alt="SimRail Community Development Logo"
						width={36}
						height={36}
					/>
					<h1 className="title">SimRail Live Map</h1>
					<span className={style.saira}>{id?.toString().toUpperCase()}</span>
					{!disableMapFeatures && <span className="online" />}
				</div>
				{serverDate && (
					<div className="datetime">
						<span className={style.time}>
							{serverDate.getUTCHours().toString().padStart(2, "0")}
							<span style={{ color: blinking ? "black" : "#FF9900" }}>:</span>
							{serverDate.getUTCMinutes().toString().padStart(2, "0")}
						</span>
						<span className={style.date}>
							{serverDate.getUTCDate().toString().padStart(2, "0")}/
							{(serverDate.getUTCMonth() + 1).toString().padStart(2, "0")}/
							{serverDate.getUTCFullYear()}
						</span>
					</div>
				)}

				<div className={style.right}>
					{!disableMapFeatures && (
						<>
							{selectedTrain && (
								<MdClose
									color="#F34747"
									className={style.icons}
									size={24}
									onClick={() => {
										setSelectedTrain(null);
										if (trainId) void router.replace(`/server/${String(id)}`);
									}}
								/>
							)}

							<MdSearch
								onClick={spotlight.open}
								className={[style.icons, "search-icon"].join(" ")}
								size={24}
							/>

							<Icon
								onClick={() =>
									setColorScheme(colorScheme === "light" ? "dark" : "light")
								}
								className={style.icons}
								size={24}
							/>
						</>
					)}
				</div>
			</nav>

			{dropdown && <NavigationDropdown />}
			<style jsx>
				{`
					.search-input-container {
						border: 2px white solid;
						border-radius: 8px;
						padding: 6px 6px;
					}

					.search-icon {
						display: none;
					}

					.title {
						font-size: 24px;
						font-weight: 800;
						line-height: 1;
						font-family: "Saira";
					}

					.datetime {
						font-weight: bold;
						font-size: 16px;
						display: flex;
						justify-content: center;
						align-items: center;
						gap: 16px;
					}

					.navigation {
						overflow: hidden;
						background-color: #111114;
						display: grid;
						grid-template-columns: repeat(3, minmax(0, 1fr));
						vertical-align: middle;
						height: 54px;
					}

					.online {
						height: 12px;
						width: 12px;
						background-color: #43e366;
						border-radius: 9999px;
					}

					@media (max-width: 1280px) {
						.title {
							display: none;
						}
						.search-input-container {
							display: none;
						}
					}
					@media (max-width: 640px) {
						.datetime {
							display: none;
						}
						.navigation {
							grid-template-columns: repeat(2, minmax(0, 1fr));
						}
						.online {
							display: none;
						}
					}
				`}
			</style>
		</div>
	);
};
