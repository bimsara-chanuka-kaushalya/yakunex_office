import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import './globals.css';

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://yakunex-hub.vercel.app');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Yakunex Hub — Enterprise Workspace & Project Delivery Platform',
    template: '%s · Yakunex Hub',
  },
  description:
    'Yakunex Hub is an enterprise workspace, project delivery, sprint tracking, time management, and video collaboration platform by Yakunex Technologies.',
  applicationName: 'Yakunex Hub',
  keywords: [
    'Yakunex Hub',
    'Yakunex',
    'Yakunex Technologies',
    'Yakunex Office',
    'Enterprise Workspace',
    'Project Management',
    'Sprint & Task Tracking',
    'Team Collaboration',
  ],
  authors: [{ name: 'Yakunex Technologies' }],
  creator: 'Yakunex Technologies',
  publisher: 'Yakunex Technologies',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'Yakunex Hub',
    title: 'Yakunex Hub — Enterprise Workspace & Project Delivery',
    description:
      'Yakunex Hub — Unified enterprise project delivery, time tracking, attendance, and team collaboration by Yakunex Technologies.',
    images: [{ url: '/icon.png', width: 512, height: 512, alt: 'Yakunex Hub Logo' }],
  },
  twitter: {
    card: 'summary',
    title: 'Yakunex Hub',
    description:
      'Enterprise workspace, project delivery and video collaboration by Yakunex Technologies.',
    images: ['/icon.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-snippet': -1,
      'max-image-preview': 'large',
      'max-video-preview': -1,
    },
  },
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Yakunex Hub',
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  description:
    'Enterprise workspace, project delivery, sprint tracking, and team collaboration platform by Yakunex Technologies.',
  publisher: {
    '@type': 'Organization',
    name: 'Yakunex Technologies',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F5F7' },
    { media: '(prefers-color-scheme: dark)', color: '#101216' },
  ],
};

// Applies the saved theme before first paint to avoid a light flash in dark mode.
const themeScript = `(function(){try{var t=localStorage.getItem('yh-theme')||localStorage.getItem('pf-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-gold focus:px-3 focus:py-2 focus:text-gold-ink"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
