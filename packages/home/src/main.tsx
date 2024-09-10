import { MantineProvider } from "@mantine/core";
import { mantineTheme } from "common";
import React from "react";
import ReactDOM from "react-dom/client";
import Home from "./Home.tsx";

import "@mantine/core/styles.css";
import "./styles/globals.css";

// biome-ignore lint/style/noNonNullAssertion:
ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<MantineProvider theme={mantineTheme} withGlobalClasses={false}>
			<Home />
		</MantineProvider>
	</React.StrictMode>,
);
