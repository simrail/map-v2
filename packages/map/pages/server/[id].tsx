import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import Head from "next/head";
import { useEffect, useState } from "react";
import { SelectedTrainProvider } from '../../contexts/SelectedTrainContext';
import { GetStaticPaths, GetStaticProps } from 'next';
import { Server } from '@simrail/types';
import { TopNavigation } from '@/components/TopNavigation';

export const getStaticPaths = (async () => {
    const res = await fetch('https://panel.simrail.eu:8084/servers-open')
    const servers = await res.json()

    const paths = servers.data.map((server: Server) => ({
        params: { id: server.ServerCode }
    }));

    return {
        paths,
        fallback: false
    };
}) satisfies GetStaticPaths

export const getStaticProps = (async () => {
    return { props: {} }
}) satisfies GetStaticProps


const Post = () => {

    const MapWithNoSSR = dynamic(() => import("../../components/Map"), {
        ssr: false
    });

    const router = useRouter()
    const { id, trainId } = router.query


    //z>No profile data</p>

    if (!id) return;


    return <>
        <Head>
            <title>{id.toString().toUpperCase()} - SimRail Map</title>
            <link
                rel="canonical"
                href={"https://map.simrail.app/server/" + id}
                key="canonical"
            />
        </Head>
        <div style={{ height: "100vh", width: '100vw', display: 'flex', flexDirection: 'column' }}>
            <SelectedTrainProvider>
                {!trainId && <TopNavigation />}
                <MapWithNoSSR serverId={id} />
            </SelectedTrainProvider>
        </div>
    </>
}

export default Post