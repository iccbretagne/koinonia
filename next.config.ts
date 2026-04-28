import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  images: {
    remotePatterns: [
      { hostname: "lh3.googleusercontent.com" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
    // Limite la taille du corps transmis à travers le middleware (proxy.ts) vers les route handlers
    middlewareClientMaxBodySize: 100 * 1024 * 1024, // 100MB
  },
};

export default nextConfig;
