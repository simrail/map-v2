import { ADSENSE_CLIENT_ID } from "common/ads";
import Script from "next/script";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import styles from "../styles/AdSlot.module.css";

type AdSlotProps = {
	slotId?: string;
	placement: "leaderboard" | "inFeed" | "rail";
};

const RAIL_MEDIA_QUERY = "(min-width: 1500px)";

const subscribeToRailViewport = (onStoreChange: () => void) => {
	const mediaQuery = window.matchMedia(RAIL_MEDIA_QUERY);
	mediaQuery.addEventListener("change", onStoreChange);
	return () => mediaQuery.removeEventListener("change", onStoreChange);
};

const getRailViewportSnapshot = () =>
	typeof window !== "undefined" && window.matchMedia(RAIL_MEDIA_QUERY).matches;

export const AdSlot = ({ slotId, placement }: AdSlotProps) => {
	const requested = useRef(false);
	const isPreview = process.env.NODE_ENV === "development" && !slotId;
	const railViewport = useSyncExternalStore(
		subscribeToRailViewport,
		getRailViewportSnapshot,
		() => false,
	);
	const shouldRender = placement !== "rail" || railViewport;

	const requestAd = useCallback(() => {
		if (!shouldRender || !slotId || requested.current) return;
		try {
			(window.adsbygoogle = window.adsbygoogle ?? []).push({});
			requested.current = true;
		} catch {
			// Ad blockers and network failures should not affect server selection.
		}
	}, [shouldRender, slotId]);

	useEffect(() => {
		if (slotId) requestAd();
	}, [requestAd, slotId]);

	if (!shouldRender || (!slotId && !isPreview)) return null;

	return (
		<aside
			className={`${styles.slot} ${styles[placement]}`}
			aria-label="Advertisement"
		>
			{slotId && (
				<Script
					id="google-adsense"
					async
					strategy="afterInteractive"
					crossOrigin="anonymous"
					src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
					onReady={requestAd}
				/>
			)}
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
