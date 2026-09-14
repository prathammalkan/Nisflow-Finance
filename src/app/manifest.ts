import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NisFlow Finance',
    short_name: 'NisFlow',
    description: 'Your personal AI-powered finance companion. Track accounts, transactions, savings and investments.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#faf6f1',
    theme_color: '#7c3aed',
    orientation: 'portrait',
    categories: ['finance', 'productivity'],
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icon-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
