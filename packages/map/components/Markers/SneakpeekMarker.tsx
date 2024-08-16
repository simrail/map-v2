import L from "leaflet";
import { Marker, Popup } from "react-leaflet";
import { Title } from "@mantine/core";

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

export const SneakpeekMarker = ({ title, desc, url, ImageURL, Image2URL, date, Latititude, Longitude }: SneakpeekMarkerProps) => {
	const icon = L.icon({
		iconUrl: "/markers/icon-sneakpeek.png",
		iconSize: [16, 16],
		popupAnchor: [0, -16],
	});

	let images = <>
		<img src={ImageURL} width="512" height="288" alt="Could not load" /> <br/>
	</> 

	if (ImageURL.endsWith(".mp4"))
		images = <>
			<video width="512" height="288" controls >
      				<source src={ImageURL} type="video/mp4"/>
					<track
						default
						kind="captions"
						srcLang="en"
						label="English"
					/>
     		</video>
		</>

	if (Image2URL !== "") {
		images = <>
			<img src={ImageURL} width="512" height="288" alt="Could not load" /> <br/>
			<img src={Image2URL} width="512" height="288" alt="Could not load" /> <br/> 
		</> 
	}

	return (
		<Marker
			key={title}
			icon={icon}
			position={[Latititude, Longitude]}
			
			zIndexOffset={30}
			eventHandlers={{
				mouseover: (event) => event.target.openPopup(),
			}}
		>
			<Popup maxWidth={999} >
				<Title> <a href={url}>{title}</a> </Title>
				{date} <br/>
				{images}
				<div style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}>
					{desc}
				</div>
			</Popup>
		</Marker>
	);
};
