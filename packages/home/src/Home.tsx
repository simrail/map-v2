import { Container, Flex, Space } from "@mantine/core";
import { FeatureCard } from "./components/FeatureCard";
import { Footer } from "./components/Footer";
import ".././../map/styles/globals.css";
import blog from "./assets/features/blog.webp";
import edr from "./assets/features/edr.webp";
import map from "./assets/features/map.webp";
import logo from "./assets/logos/logo_simrailapp.png";

function App() {
	return (
		<>
			<main>
				<Container style={{ marginTop: 50 }}>
					<Flex align="center" direction={"column"}>
						<img alt="SimRail logo" src={logo} width={258} height={82} />
						<Flex style={{ marginTop: 50 }} direction={"column"} gap={48}>
							<FeatureCard
								name="Live Map"
								href="https://map.simrail.app"
								image={map}
							/>
							<FeatureCard
								name="EDR"
								target="_blank"
								href="https://edr.simrail.app"
								image={edr}
							/>
							<FeatureCard name="SOON " href="servers" disabled image={blog} />
						</Flex>
						<Space h="xl" />
						<Footer />
					</Flex>
				</Container>
			</main>
		</>
	);
}

export default App;
