/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: { allowedOrigins: ['*'] },
    // Reduce bundle size by tree-shaking large icon/utility packages
    optimizePackageImports: ['lucide-react'],
  },
}
module.exports = nextConfig
