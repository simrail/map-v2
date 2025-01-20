import { Box } from "@mantine/core";
import type { FC } from "react";

export const WorldFlag: FC = () => {
	return (
		<Box
			className="me-e3e6c0b4"
			style={{
				"--flag-radius": "var(--mantine-radius-default)",
				width: "calc(1.75rem * var(--mantine-scale))",
			}}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 28 21"
				width="28"
				height="21"
			>
				<title>International Flag of Planet Earth</title>
				<rect width="28" height="21" fill="#0057b7" />
				<g fill="none" stroke="#ffffff" strokeWidth="0.5">
					<circle cx="14" cy="10.5" r="2.8" />
					<circle cx="11.2" cy="7.7" r="2.8" />
					<circle cx="16.8" cy="7.7" r="2.8" />
					<circle cx="9" cy="10.5" r="2.8" />
					<circle cx="19" cy="10.5" r="2.8" />
					<circle cx="11.2" cy="13.3" r="2.8" />
					<circle cx="16.8" cy="13.3" r="2.8" />
				</g>
			</svg>
		</Box>
	);
};
