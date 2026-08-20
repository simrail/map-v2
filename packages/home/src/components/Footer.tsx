import { DISCORD_INVITE_URL } from "common/links";

import styles from "../styles/Footer.module.css";

export const Footer = () => {
	return (
		<footer className={styles.footer}>
			<div className={styles.footerInner}>
				<div>
					<strong>SimRail France community tools</strong>
					<span>Built and maintained by SimRail players.</span>
				</div>
				<nav className={styles.socials} aria-label="Community social links">
					<a
						aria-label="SimRail France on X"
						href="https://twitter.com/SimRailFR"
						target="_blank"
						rel="noreferrer"
					>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="M18.9 2H22l-6.78 7.75L23.2 22h-6.25l-4.9-6.4L6.46 22H3.34l7.25-8.29L2.93 2h6.41l4.42 5.84L18.9 2Zm-1.1 17.84h1.73L8.4 4.05H6.55L17.8 19.84Z" />
						</svg>
					</a>
					<a
						aria-label="SimRail France on Instagram"
						href="https://www.instagram.com/simrailfr/"
						target="_blank"
						rel="noreferrer"
					>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm10.5 1.5a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
						</svg>
					</a>
					<a
						aria-label="Join SimRail on Discord"
						href={DISCORD_INVITE_URL}
						target="_blank"
						rel="noreferrer"
					>
						<svg viewBox="0 0 24 24" aria-hidden="true">
							<path d="M19.5 5.34A17.4 17.4 0 0 0 15.28 4l-.52 1.07a16 16 0 0 0-5.5 0L8.72 4A17.5 17.5 0 0 0 4.5 5.35C1.83 9.3 1.1 13.15 1.46 16.94A17 17 0 0 0 6.64 19.5l1.27-1.72c-.7-.27-1.37-.59-2.02-.97l.5-.39c3.9 1.8 8.15 1.8 12 0l.52.4c-.65.38-1.32.7-2.02.96l1.27 1.72a17 17 0 0 0 5.18-2.56c.43-4.35-1.14-8.17-3.84-11.6ZM8.85 14.67c-1.17 0-2.13-1.08-2.13-2.4 0-1.31.94-2.4 2.13-2.4 1.2 0 2.16 1.1 2.13 2.4 0 1.32-.94 2.4-2.13 2.4Zm6.3 0c-1.17 0-2.13-1.08-2.13-2.4 0-1.31.94-2.4 2.13-2.4 1.2 0 2.16 1.1 2.13 2.4 0 1.32-.93 2.4-2.13 2.4Z" />
						</svg>
					</a>
				</nav>
			</div>
			<div className={styles.footerMeta}>
				<span>Not affiliated with SimRail S.A.</span>
				<span>
					Bot monitoring by{" "}
					<a href="https://upbot.app/?utm_source=simrail&utm_medium=referral&utm_campaign=simrail_footer">
						upbot
					</a>
				</span>
			</div>
		</footer>
	);
};
