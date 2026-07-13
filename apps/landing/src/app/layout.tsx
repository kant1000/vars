import type { Metadata } from 'next';
import './globals.css';
import CookieBanner from '@/components/CookieBanner';

const siteUrl = 'https://www.bookwithvars.com';
const siteTitle = 'VARS | Join Lagos home service beauty platform';
const siteDescription =
  'Join VARS as a Lagos stylist. Get discovered for home service barbing, hair styling, and makeup jobs with verified profiles, payment protection, and real ratings.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: 'VARS',
  title: {
    default: siteTitle,
    template: '%s | VARS',
  },
  description: siteDescription,
  keywords: [
    'VARS',
    'home service beauty platform Lagos',
    'stylist jobs Lagos',
    'home service barber Lagos',
    'mobile barber Lagos',
    'barber near me Lagos',
    'book barber Lagos',
    'barber in Lekki',
    'hairstylist home service',
    'make up artist Lagos',
    'makeup artist that comes to you Lagos',
    'makeup artist VI',
    'beauty professionals Lagos',
  ],
  authors: [{ name: 'VARS' }],
  creator: 'VARS',
  publisher: 'VARS',
  category: 'beauty services',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: siteTitle,
    description: siteDescription,
    url: siteUrl,
    siteName: 'VARS',
    type: 'website',
    locale: 'en_GB',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'VARS - Lagos stylists, your craft, your income',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: '/logo.svg',
    apple: '/logo-splash.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
