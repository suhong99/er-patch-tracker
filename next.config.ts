import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // firebase-admin은 서버 사이드에서만 사용
  serverExternalPackages: ['firebase-admin'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
  },
};

export default nextConfig;
