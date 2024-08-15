import dynamic from "next/dynamic";
import { useRouter } from "next/router";

import { TopNavigation } from "@/components/TopNavigation";
import type { Server } from "@simrail/types";
import type { GetStaticPaths, GetStaticProps } from "next";
import Head from "next/head";
import { SelectedTrainProvider } from "../../contexts/SelectedTrainContext";

export const getStaticPaths = (async () => {
	const res = await fetch("https://panel.simrail.eu:8084/servers-open");
	const servers = await res.json();

	const paths = servers.data.map((server: Server) => ({
		params: { id: server.ServerCode },
	}));

	return {
		paths,
		fallback: false,
	};
}) satisfies GetStaticPaths;

export const getStaticProps = (async () => {
	return { props: {} };
}) satisfies GetStaticProps;

const Post = () => {
	const MapWithNoSSR = dynamic(() => import("../../components/Map"), {
		ssr: false,
	});

	const router = useRouter();
	const { id, trainId } = router.query;

	const pageTitle = `${id?.toString().toUpperCase()} - SimRail Map`;

	if (!id) return;

	return (
		<>
			<Head>
				<title>{pageTitle}</title>
				<link
					rel="canonical"
					href={`https://map.simrail.app/server/${id}`}
					key="canonical"
				/>
			</Head>
			<div
				style={{
					height: "100vh",
					width: "100vw",
					display: "flex",
					flexDirection: "column",
				}}
			>
				<SelectedTrainProvider>
					{!trainId && <TopNavigation />}
					<MapWithNoSSR serverId={id} />
				</SelectedTrainProvider>
			</div>
		</>
	);
};

export default Post;
