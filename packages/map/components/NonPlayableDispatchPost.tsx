import React, { FC } from "react";
import nonPlayableDispatchPostsJson from "@/components/nonPlayableDispatchPosts.json";
import { NonPlayableDispatchPostMarker } from "@/components/Markers/NonPlayableDispatchPostMarker";
import { useRouter } from 'next/router';
import serverSceneries from '@/components/serverSceneries.json'


const NonPlayableDispatchPosts: FC = () => {

    const router = useRouter()
    const { id } = router.query

    let Sceneries: string[]
    if (id) {
        const server = serverSceneries.find(server => server.Name === id);
        if (server) {
            Sceneries = server.Sceneries
        }
    }
    

    return (
        <>
            {nonPlayableDispatchPostsJson
                .filter(nonPlayable => Sceneries.includes(nonPlayable.Scenerie))
                .map(nonPlayable => (
                    <NonPlayableDispatchPostMarker key={nonPlayable.Name} nonPlayable={nonPlayable} />
                ))}
        </>
    );
};

export default React.memo(NonPlayableDispatchPosts);