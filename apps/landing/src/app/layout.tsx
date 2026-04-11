import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'VARS — Beauty at your door.',
  description:
    'Book verified barbers, stylists, and makeup artists who come to you. Wherever you are in Nigeria.',
  keywords: 'barber, hair stylist, makeup artist, beauty, home service, Nigeria, Lagos',
  openGraph: {
    title: 'VARS — Beauty at your door.',
    description:
      'Book verified barbers, stylists, and makeup artists who come to you.',
    url: 'https://www.bookwithvars.com',
    siteName: 'VARS',
    type: 'website',
    images: [{ url: 'https://www.bookwithvars.com/landing.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VARS — Beauty at your door.',
    description: 'Book verified beauty vendors who come to you.',
    images: ['https://www.bookwithvars.com/landing.png'],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
