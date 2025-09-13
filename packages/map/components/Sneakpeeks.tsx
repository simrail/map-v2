import { SneakpeekMarker } from "@/components/Markers/SneakpeekMarker";
import sneakpeeksjson from "@/components/sneakpeeks.json";
import type { FC } from "react";

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

const SneakpeekMarkers: FC = () => (
	<>
		{sneakpeeksjson.map((sneakpeek: SneakpeekMarkerProps) => (
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
		))}
	</>
);

export default SneakpeekMarkers;
