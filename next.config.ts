import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['spatial-review.alterno.dev'],
  async headers() {
    return [{source: '/spatial-review', headers: [
      {key: 'Content-Security-Policy', value: "frame-ancestors 'self' https://spatial-review.alterno.dev"},
    ]}, {source: '/.well-known/spatial-review.json', headers: [
      {key: 'Access-Control-Allow-Origin', value: 'https://spatial-review.alterno.dev'},
      {key: 'Cache-Control', value: 'no-cache'},
    ]}];
  },
};

export default nextConfig;
