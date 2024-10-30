// import { NavigationDropdown } from './NavigationDropdown';
import serverTimes from "@/components/serverTimes.json";
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
import style from "../styles/TopNavigation.module.css";
import { NavigationDropdown } from "./NavigationDropdown";

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

	useEffect(() => {
		if (id) {
			const serverUtcOffHours = serverTimes.find((server) => server.Name === id)?.UTCOff;
			if (serverUtcOffHours !== undefined) {
				const timer = setInterval(() => {
					// update blinking state of the colon
					setBlinking((currentBlinking) => !currentBlinking);

					// update the server date
					const currentUnixTimestamp = Date.now();
					const utcOffsetInMs = serverUtcOffHours * 60 * 60 * 1000;
					const serverDate = new Date(currentUnixTimestamp + utcOffsetInMs);
					setServerDate(serverDate);
				}, 1000);
				return () => clearInterval(timer);
			}
		}
	}, [id]);

	if (!serverDate) return null;

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
				<div className="datetime">
					<span className={style.time}>
						{serverDate.getUTCHours().toString().padStart(2, "0")}
						<span style={{ color: blinking ? "black" : "#FF9900" }}>:</span>
						{serverDate.getUTCMinutes().toString().padStart(2, "0")}
					</span>
					<span className={style.date}>
						{" "}
						{serverDate.getUTCDate().toString().padStart(2, "0")}
						{"/"}
						{(serverDate.getUTCMonth() + 1).toString().padStart(2, "0")}
						{"/"}
						{serverDate.getUTCFullYear()}
					</span>
				</div>

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
										if (trainId) router.replace(`/server/${id}`);
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
            font-family: 'Saira';
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
            background-color: #43E366;
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
