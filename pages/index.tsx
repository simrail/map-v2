// @ts-nocheck
import Head from 'next/head'
import Image from "next/image";
import { Container, Flex, Space } from '@mantine/core';
import { FeatureCard } from '../components/FeatureCard';
import { Footer } from '../components/Footer';
import Servers from "./servers";

export async function getServerSideProps({ req, res }) {
    res.setHeader(
        'Cache-Control',
        'public, s-maxage=1, stale-while-revalidate=59'
    );

    return {
        props: {
            host: req.headers.host
        }
    };
}

export default function Home({ host }) {

    if (host === 'www.simrail.app') {
        return (<>
            <Head>
                <title>SimRail - Home</title>
                <meta name="description" content="Discover the tools created by the community" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
            </Head>
            <main >
                <Container style={{ marginTop: 50 }}>
                    <Flex align="center" direction={"column"}>
                        <Image alt="SimRail logo" src={"/logos/logo-simrailapp.png"} width={258} height={82} />
                        <Flex style={{ marginTop: 50 }} direction={"column"} gap={48}>
                            <FeatureCard name='Live Map' href='https://map.simrail.app' image='/features/map.png' />
                            <FeatureCard name='EDR' target="_blank" href='https://edr.simrail.app' image='/features/edr.png' />
                            <FeatureCard name='SOON ' href='servers' disabled image='/features/blog.png' />
                        </Flex>
                        <Space h="xl" />
                        <Footer />
                    </Flex>
                </Container>

            </main>
        </>)

    }
    return <Servers />

}
