// @ts-nocheck
import Head from 'next/head'
import Image from "next/image";
import {Container, Flex, Space } from '@mantine/core';
import { FeatureCard } from '../../home/src/components/FeatureCard';
import { Footer } from '../../home/src/components/Footer';
import Servers from "./servers";
import FavoriteStar from '@/components/FavoriteStar';
import { useEffect, useState } from 'react';
import styles from '../styles/Home.module.css'
import { TopNavigation } from '@/components/TopNavigation';
import dynamic from 'next/dynamic';
import EUFlag from '@/components/EUFlag';

export default function Home({ host }) {

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
        <TopNavigation disableMapFeatures={true} />
        <main className={styles.main}>
            <h1 className={styles.title}>Select your server</h1>
            {!servers && 'Loading servers...'}
            <div className={styles.serverList}>

                {servers && servers.map((server: Server) => {
                    return (
                        <a
                            id={server.ServerCode}
                            className='server'
                            key={server.id}
                            href={"/server/" + server.ServerCode}>
                            <FavoriteStar server={server} />
                            <span className={`${styles.statusIndicator} ${getStatusIndicatorStyle(server)}`}></span>
                            <span className={styles.serverName}>
                                <FlagIcon  code={server.ServerCode.slice(0, 2).toUpperCase()} />
                                <span>{server.ServerName}</span>
                            </span>
                        </a>
                    )
                })
                }
            </div>
        </main>
        <style jsx>{`
        .server {
            background: rgba(54, 54, 58, 0.8);
            padding: 8px 32px;
            margin: 8px;
            border-radius: 12px;
            width: 60%;
            flex-direction: row;
            transition: all 200ms ease-in-out;
            align-self: center;
            justify-self: center;
            position: relative;
            text-align: start;
            font-size: 23px;
        }
            
        @media (max-width: 1280px) {
            .server {
                width: 80%;
            }

        }

        `}
        </style>
    </>)
}

const FlagIcon = ({ code }) => {
    const [Component, setComponent] = useState(null);

    useEffect(() => {
        if (code) {
            import('mantine-flagpack')
                .then((mod) => {
                    let lang = code.toUpperCase();
                    if (lang === 'EN') lang = 'GB'
                    if (lang === 'EU') {
                        setComponent(() => EUFlag)
                        return;
                    }

                    setComponent(() => mod[lang + 'Flag']);
                })
                .catch((err) => {
                    console.error('Failed to load flag icon', err);
                });
        }
    }, [code]);

    if (!Component) {
        return null; // Or some fallback UI
    }

    return <Component w={28} />;
};