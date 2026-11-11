const apiInternalUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Docker runtime image.
  output: 'standalone',
  poweredByHeader: false,
  // Same-origin API: the browser talks to /api, Next forwards it to the Nest API.
  // Cookies therefore stay first-party and HttpOnly without CORS gymnastics.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiInternalUrl}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
