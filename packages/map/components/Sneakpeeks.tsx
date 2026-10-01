import type { FC } from "react";

import { LazyLayer } from "@/components/LazyLayer";
import { SneakpeekMarker } from "@/components/Markers/SneakpeekMarker";

type SneakpeekMarkerProps = {
	title: string;
	desc: string;
	url: string;
	ImageURL: string;
	Image2URL: string;
	date: string;
	Latititude: number;
	Longitude: number;
};

// Off by default, so the data is only loaded once the layer is shown.
const loadSneakpeeks = () =>
	import("@/components/sneakpeeks.json").then(
		(module) => module.default as SneakpeekMarkerProps[],
	);

const SneakpeekMarkers: FC = () => (
	<LazyLayer load={loadSneakpeeks}>
		{(sneakpeeks) =>
			sneakpeeks.map((sneakpeek) => (
				<SneakpeekMarker
					key={sneakpeek.title}
					title={sneakpeek.title}
					desc={sneakpeek.desc}
					url={sneakpeek.url}
					ImageURL={sneakpeek.ImageURL}
					Image2URL={sneakpeek.Image2URL}
					date={sneakpeek.date}
					Latititude={sneakpeek.Latititude}
					Longitude={sneakpeek.Longitude}
				/>
			))
		}
	</LazyLayer>
);

export default SneakpeekMarkers;
