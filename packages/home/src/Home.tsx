import { DISCORD_INVITE_URL, INSTANT_GAMING_AFFILIATE_URL } from "common/links";

import blog from "./assets/features/blog.webp";
import edr from "./assets/features/edr.webp";
import map from "./assets/features/map.webp";
import logo from "./assets/logos/logo_simrailapp.png";
import { AdSlot } from "./components/AdSlot";
import { FeatureCard } from "./components/FeatureCard";
import { Footer } from "./components/Footer";

import styles from "./styles/Home.module.css";

const MAP_URL =
	import.meta.env.VITE_MAP_URL ??
	(import.meta.env.DEV ? "http://localhost:3000" : "https://map.simrail.app");

const HOME_AD_SLOTS = {
	leaderboard: import.meta.env.VITE_GOOGLE_ADSENSE_HOME_LEADERBOARD_SLOT,
	inFeed: import.meta.env.VITE_GOOGLE_ADSENSE_HOME_INFEED_SLOT,
	rail: import.meta.env.VITE_GOOGLE_ADSENSE_HOME_RAIL_SLOT,
};

function App() {
	return (
		<div className={styles.page}>
			<div className={styles.glow} aria-hidden="true" />
			<header className={styles.navigation}>
				<a
					href="#top"
					className={styles.brand}
					aria-label="SimRail portal home"
				>
					<img src={logo} alt="SimRail" width={171} height={54} />
				</a>
				<nav className={styles.navLinks} aria-label="Primary navigation">
					<a href="#tools">Tools</a>
					<a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">
						Community
					</a>
				</nav>
			</header>

			<main id="top">
				<section className={styles.hero}>
					<div className={styles.heroCopy}>
						<div className={styles.eyebrow}>
							<span /> Tools from the SimRail France community
						</div>
						<h1>
							Map the network.
							<br />
							Check your train.
						</h1>
						<p>
							See what is happening on each server with the live map, or open
							EDR for the details of a specific train.
						</p>
						<div className={styles.heroActions}>
							<a className={styles.primaryAction} href={MAP_URL}>
								Open live map <span aria-hidden="true">→</span>
							</a>
							<a className={styles.secondaryAction} href="#tools">
								Explore tools
							</a>
						</div>
					</div>

					<a
						className={styles.heroVisual}
						href={MAP_URL}
						aria-label="Open the SimRail live map"
					>
						<img src={map} alt="" width={903} height={408} />
						<div className={styles.visualShade} />
						<div className={styles.liveBadge}>
							<span /> Network live
						</div>
						<div className={styles.routeCard}>
							<small>LIVE MAP</small>
							<strong>See what is moving</strong>
							<span>Trains · Signal boxes · Signals</span>
						</div>
					</a>
				</section>
				<AdSlot placement="leaderboard" slotId={HOME_AD_SLOTS.leaderboard} />

				<section className={styles.toolsSection} id="tools">
					<AdSlot placement="rail" slotId={HOME_AD_SLOTS.rail} />
					<header className={styles.sectionHeader}>
						<div>
							<span className={styles.sectionLabel}>Tools</span>
							<h2>Choose what you need.</h2>
						</div>
						<p>
							We build these for our own sessions and share them with the rest
							of the SimRail community.
						</p>
					</header>

					<div className={styles.featureGrid}>
						<FeatureCard
							name="Live Map"
							label="Live network"
							description="Pick a server and see its trains, active signal boxes and signals on the map."
							actionLabel="View the map"
							href={MAP_URL}
							image={map}
							priority
						/>
						<FeatureCard
							name="EDR"
							label="Train details"
							description="Look up a train's route, consist, speed and signal information."
							actionLabel="Open EDR"
							href="https://edr.simrail.app"
							image={edr}
							target="_blank"
						/>
						<FeatureCard
							name="More to come"
							label="Next up"
							description="We are working on more small, useful tools. We will add them here when they are ready."
							actionLabel="Not ready yet"
							href="#tools"
							image={blog}
							disabled
						/>
						<AdSlot placement="inFeed" slotId={HOME_AD_SLOTS.inFeed} />
					</div>
				</section>

				<section className={styles.purchase} aria-labelledby="purchase-title">
					<div className={styles.purchaseIcon} aria-hidden="true">
						<span>SR</span>
					</div>
					<div className={styles.purchaseCopy}>
						<span className={styles.sectionLabel}>Get the game</span>
						<h2 id="purchase-title">Ready to drive?</h2>
						<p>Find SimRail on Instant Gaming and compare the current offer.</p>
					</div>
					<div className={styles.purchaseAction}>
						<a
							href={INSTANT_GAMING_AFFILIATE_URL}
							target="_blank"
							rel="sponsored noreferrer"
						>
							View on Instant Gaming <span aria-hidden="true">↗</span>
						</a>
						<small>Affiliate link · We may earn a commission.</small>
					</div>
				</section>

				<section className={styles.community}>
					<div>
						<span className={styles.sectionLabel}>SimRail France</span>
						<h2>Made by players, for players.</h2>
						<p>
							Have a question, found a bug or thought of something useful? Come
							talk to us on Discord.
						</p>
					</div>
					<a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer">
						Join the Discord <span aria-hidden="true">↗</span>
					</a>
				</section>
			</main>

			<Footer />
		</div>
	);
}

export default App;
