import { Container, Flex, Space } from '@mantine/core';
import { FeatureCard } from './components/FeatureCard';
import { Footer } from './components/Footer';
import '.././../map/styles/globals.css'
import logo from './assets/logos/logo_simrailapp.png'

function App() {

    return (
        <>
            <main >
                <Container style={{ marginTop: 50 }}>
                    <Flex align="center" direction={"column"}>
                        <img alt="SimRail logo" src={logo} width={258} height={82} />
                        <Flex style={{ marginTop: 50 }} direction={"column"} gap={48}>
                            <FeatureCard name='Live Map' href='https://map.simrail.app' image='/features/map.webp' />
                            <FeatureCard name='EDR' target="_blank" href='https://edr.simrail.app' image='/features/edr.webp' />
                            <FeatureCard name='SOON ' href='servers' disabled image='/features/blog.webp' />
                        </Flex>
                        <Space h="xl" />
                        <Footer />
                    </Flex>
                </Container>
            </main>
        </>
    )
}

export default App
