import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Yakunex Hub', template: '%s · Yakunex Hub' },
  description: 'Yakunex Hub — Enterprise workspace, project delivery and video collaboration by Yakunex Technologies.',
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
