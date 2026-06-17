import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  output: 'standalone',
  allowedDevOrigins: ['192.168.1.21', 'localhost:3000'],
  turbopack: {
    root: process.cwd(),
    resolveAlias: {
      'tailwindcss': path.join(process.cwd(), 'node_modules/tailwindcss'),
    },
  },
}

export default nextConfig
