/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	eslint: {
		ignoreDuringBuilds: true,
	},
	transpilePackages: ["common"],
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
