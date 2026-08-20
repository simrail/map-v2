import { ADSENSE_CLIENT_ID } from "common/ads";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { MdClose } from "react-icons/md";

import styles from "../styles/DelayedAdBanner.module.css";

const ADSENSE_SLOT_ID = process.env.NEXT_PUBLIC_GOOGLE_ADSENSE_MAP_SLOT;
const DISMISSED_KEY = "simrail-map-ad-dismissed";
const MIN_DELAY_MS = 5 * 60 * 1000;
const MAX_DELAY_MS = 10 * 60 * 1000;

declare global {
	interface Window {
		adsbygoogle?: Record<string, never>[];
	}
}

export const DelayedAdBanner = () => {
	const [visible, setVisible] = useState(false);
	const adRequested = useRef(false);

	useEffect(() => {
		if (!ADSENSE_SLOT_ID) return;

		try {
			if (window.sessionStorage.getItem(DISMISSED_KEY) === "true") return;
		} catch {
			// Storage can be unavailable in privacy-focused browsers. The ad can still run.
		}

		const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
		const timer = window.setTimeout(() => setVisible(true), delay);

		return () => window.clearTimeout(timer);
	}, []);

	const requestAd = useCallback(() => {
		if (adRequested.current) return;

		try {
			(window.adsbygoogle = window.adsbygoogle ?? []).push({});
			adRequested.current = true;
		} catch {
			// Ad blockers and network failures should not affect the map.
		}
	}, []);

	useEffect(() => {
		if (visible && window.adsbygoogle) requestAd();
	}, [requestAd, visible]);

	const dismiss = () => {
		setVisible(false);
		try {
			window.sessionStorage.setItem(DISMISSED_KEY, "true");
		} catch {
			// Dismissal still applies until this component unmounts.
		}
	};

	if (!visible || !ADSENSE_SLOT_ID) return null;

	return (
		<aside className={styles.banner} aria-label="Advertisement">
			<Script
				id="google-adsense"
				async
				strategy="afterInteractive"
				crossOrigin="anonymous"
				src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
				onReady={requestAd}
			/>
			<div className={styles.header}>
				<span>Sponsored</span>
				<button
					type="button"
					className={styles.close}
					onClick={dismiss}
					aria-label="Dismiss advertisement for this session"
				>
					<MdClose aria-hidden="true" size={18} />
				</button>
			</div>
			<div className={styles.ad}>
				<ins
					className="adsbygoogle"
					style={{ display: "block" }}
					data-ad-client={ADSENSE_CLIENT_ID}
					data-ad-slot={ADSENSE_SLOT_ID}
					data-ad-format="auto"
					data-full-width-responsive="true"
				/>
			</div>
		</aside>
	);
};
