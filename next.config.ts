import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: ["localhost"],
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false };
    return config;
  },

  reactStrictMode: true,
};

export default nextConfig;
