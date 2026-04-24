import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'VARS',
    short_name: 'VARS',
    description:
      'A Lagos home service beauty platform for stylists, barbers, and makeup artists.',
    start_url: '/',
    display: 'standalone',
    background_color: '#111111',
    theme_color: '#111111',
    icons: [
      {
        src: '/logo-splash.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
