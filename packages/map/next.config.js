/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	eslint: {
		ignoreDuringBuilds: true,
	},
	typescript: {
		ignoreBuildErrors: true,
	},
	transpilePackages: ["common", "mantine-flagpack"],
	experimental: {
		optimizePackageImports: ["mantine-flagpack"],
	},
	output: "export",
	distDir: "dist",
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "api.simrail.eu",
				port: "8083",
				pathname: "/**",
			},
		],
	},
};

module.exports = nextConfig;
