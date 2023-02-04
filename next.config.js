/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  images: {
    domains: ['api1.aws.simrail.eu'],
  },
}

module.exports = nextConfig
