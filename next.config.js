/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  async redirects() {
    return [
      { source: '/mantenimiento', destination: '/residencial', permanent: false },
      { source: '/mantenimiento/:path*', destination: '/residencial/mantenimiento/:path*', permanent: false },
    ]
  },
  experimental: {
    serverActions: { allowedOrigins: ['*'] },
    // Reduce bundle size by tree-shaking large icon/utility packages
    optimizePackageImports: ['lucide-react'],
  },
}
module.exports = nextConfig
