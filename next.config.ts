import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
  experimental: {
    serverActions: {
      // Headroom for raw phone photos (default is 1MB). Note: the scan flows
      // downscale images in the browser before upload (see src/lib/image.ts), so
      // the payload that actually crosses the wire is ~1-2MB regardless.
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
