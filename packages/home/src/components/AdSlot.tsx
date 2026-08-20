import { ADSENSE_CLIENT_ID } from "common/ads";
import { useEffect, useRef, useSyncExternalStore } from "react";

import styles from "../styles/AdSlot.module.css";

type AdSlotProps = {
	slotId?: string;
	placement: "leaderboard" | "inFeed" | "rail";
};

declare global {
	interface Window {
		adsbygoogle?: Record<string, never>[];
	}
}

let adSenseScriptRequested = false;
const RAIL_MEDIA_QUERY = "(min-width: 1580px)";

const subscribeToRailViewport = (onStoreChange: () => void) => {
	const mediaQuery = window.matchMedia(RAIL_MEDIA_QUERY);
	mediaQuery.addEventListener("change", onStoreChange);
	return () => mediaQuery.removeEventListener("change", onStoreChange);
};

const getRailViewportSnapshot = () =>
	typeof window !== "undefined" && window.matchMedia(RAIL_MEDIA_QUERY).matches;

const loadAdSense = () => {
	if (adSenseScriptRequested || document.getElementById("google-adsense"))
		return;
	adSenseScriptRequested = true;

	const script = document.createElement("script");
	script.id = "google-adsense";
	script.async = true;
	script.crossOrigin = "anonymous";
	script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`;
	document.head.append(script);
};

export const AdSlot = ({ slotId, placement }: AdSlotProps) => {
	const requested = useRef(false);
	const isPreview = import.meta.env.DEV && !slotId;
	const railViewport = useSyncExternalStore(
		subscribeToRailViewport,
		getRailViewportSnapshot,
		() => false,
	);
	const shouldRender = placement !== "rail" || railViewport;

	useEffect(() => {
		if (!shouldRender || !slotId || requested.current) return;
		loadAdSense();
		try {
			(window.adsbygoogle = window.adsbygoogle ?? []).push({});
			requested.current = true;
		} catch {
			// Ad blockers and network failures should not affect the portal.
		}
	}, [shouldRender, slotId]);

	if (!shouldRender || (!slotId && !isPreview)) return null;

	return (
		<aside
			className={`${styles.slot} ${styles[placement]}`}
			aria-label="Advertisement"
		>
			<span className={styles.label}>Advertisement</span>
			{isPreview ? (
				<div className={styles.preview}>Ad placement · {placement}</div>
			) : (
				<ins
					className="adsbygoogle"
					style={{ display: "block" }}
					data-ad-client={ADSENSE_CLIENT_ID}
					data-ad-slot={slotId}
					data-ad-format="auto"
					data-full-width-responsive="true"
				/>
			)}
		</aside>
	);
};
