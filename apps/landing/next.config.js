/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
    // Serve AVIF first (smallest), WebP as fallback — automatic for all next/image usage
    formats: ['image/avif', 'image/webp'],
    // 1-year CDN cache for optimised images (blog images don't change)
    minimumCacheTTL: 31536000,
    // Mobile-first breakpoints — Nigerian users are predominantly on phones
    deviceSizes: [390, 640, 828, 1080, 1200],
  },
};
module.exports = nextConfig;
