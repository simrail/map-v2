import "../styles/globals.css";
import { MantineProvider } from "@mantine/core";
import { GoogleTagManager } from "@next/third-parties/google";
import { mantineTheme } from "common";
import type { AppProps } from "next/app";
import "@mantine/core/styles.css";
import "@mantine/spotlight/styles.css";
import "mantine-flagpack/styles.css";
import "@mantine/carousel/styles.css";

export default function Home({ Component, pageProps }: AppProps) {
	return (
		<MantineProvider theme={mantineTheme} defaultColorScheme="auto">
			{process.env.NODE_ENV !== "development" && (
				<GoogleTagManager gtmId="GTM-TWKQ769Q" />
			)}
			<Component {...pageProps} />
		</MantineProvider>
	);
}
