import {
	type MantineThemeOverride,
	colorsTuple,
	createTheme,
} from "@mantine/core";

const mantineTheme: MantineThemeOverride = createTheme({
	headings: { fontFamily: "Saira" },
	colors: {
		blue: colorsTuple("#55C1F6"),
		orange: colorsTuple("#FF9900"),
		red: colorsTuple("#DF3838"),
	},
});

export { mantineTheme };
