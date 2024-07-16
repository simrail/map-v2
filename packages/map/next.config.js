/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true
  },
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.simrail.eu',
        port: '8083',
        pathname: '/**',
      },
    ],
  },
}

module.exports = nextConfig
