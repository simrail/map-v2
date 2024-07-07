import Head from 'next/head'
import styles from '../styles/Home.module.css'
import { Server } from '@simrail/types';
import { useEffect, useState } from 'react';
import FavoriteStar from '../components/FavoriteStar';
import { IncomingMessage, ServerResponse } from 'http';
import TopNavigation  from './TopNavigation'

type ServersProps = {
    req: IncomingMessage,
    res: ServerResponse,
}

export async function getServerSideProps({ req, res }: ServersProps) {

    if (req.headers.host === 'www.simrail.app') {
        return {
            notFound: true,
        }
    }

    res.setHeader(
        'Cache-Control',
        'public, s-maxage=1, stale-while-revalidate=59'
    );

    return {
        props: {
        }
    };
}

export default function Servers() {


    const [servers, setServers] = useState<Server[] | null>(null)


    function getServers() {

        fetch('https://panel.simrail.eu:8084/servers-open')
            .then((res) => res.json())
            .then((stations) => {

                let serversData: Server[] = stations.data

                serversData = serversData
                    .sort(function (a, b) {
                        let serverSettings1 = (JSON.parse(localStorage.getItem('server-' + a.id) ?? '{"favorite": false}') ?? { favorite: false });
                        let serverSettings2 = (JSON.parse(localStorage.getItem('server-' + b.id) ?? '{"favorite": false}') ?? { favorite: false });

                        if (serverSettings1.favorite && !serverSettings2.favorite) {
                            return -1;
                        } else if (!serverSettings1.favorite && serverSettings2.favorite) {
                            return 1;
                        } else {
                            if (b.ServerName.startsWith("FR")) {
                                return 1;
                            } else if (a.ServerName.startsWith("FR")) {
                                return -1;
                            } else {
                                return a.ServerCode.localeCompare(b.ServerCode);
                            }
                        }

                    })

                setServers(serversData)
            })
    }



    useEffect(() => {
        // setLoading(true)

        getServers()

        const interval = setInterval(() => {
            getServers()
        }, 10000)


        return () => clearInterval(interval)

    }, [])


    const getStatusIndicatorStyle = (server: Server) => {
        if (server.IsActive) return styles.online;
        else return styles.offline;
    };

    return (<>
        <Head>
            <title>SimRail - Map</title>
            <meta name="description" content="Select your servers to visualize the trains and stations" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <link rel="icon" href="/favicon.ico" />
        </Head>
        <TopNavigation/>
        <main className={styles.main}>
            <h1>Hello, select your server</h1>
            {!servers && 'Loading servers...'}
            <div className={styles.serverList}>

                {servers && servers.map((server: Server) => <>
                    <a
                        id={server.ServerCode}
                        className={styles.server}
                        key={server.id}
                        href={"/server/" + server.ServerCode}>
                        <FavoriteStar server={server} />
                        <span className={`${styles.statusIndicator} ${getStatusIndicatorStyle(server)}`}></span>
                        <span className={styles.serverName}>{server.ServerName}</span>
                    </a>
                </>
                )
                }
            </div>
        </main>
    </>)
}
