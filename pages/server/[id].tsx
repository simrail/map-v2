import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'

import Head from "next/head";
import { SelectedTrainProvider } from '../../contexts/SelectedTrainContext';
import TopNavigation from '@/components/TopNavigation';


const Post = () => {

    const MapWithNoSSR = dynamic(() => import("../../components/Map"), {
        ssr: false
    });

    const router = useRouter()
    const { id } = router.query



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
        <div style={{height: "100vh", width: '100vw', display: 'flex', flexDirection: 'column'}}>
        <TopNavigation/>
        <SelectedTrainProvider>
            <MapWithNoSSR serverId={id} />
            </SelectedTrainProvider>
        </div>
    </>
}

export default Post