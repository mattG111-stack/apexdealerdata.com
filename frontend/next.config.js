/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // When NEXT_PUBLIC_API_BASE is empty (e.g. the shareable tunnel build), the
  // browser calls /api on the same origin and Next proxies it to the local
  // backend. This keeps the whole app reachable through a single public URL
  // with no CORS. Harmless otherwise — /api has no frontend routes.
  async rewrites() {
    return [{ source: "/api/:path*", destination: "http://127.0.0.1:8000/api/:path*" }];
  },
};
module.exports = nextConfig;
