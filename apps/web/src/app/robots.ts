import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://yakunex-hub.vercel.app');

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/login'],
        disallow: ['/api/', '/settings', '/audit-logs', '/users'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
