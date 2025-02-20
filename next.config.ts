import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    domains: ["localhost"],
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false };
    return config;
  },
  rules: {
    "react-hooks/exhaustive-deps": "off",
    "react/no-unescaped-entities": "off",
  },
  reactStrictMode: true,

};
const withTM = require('next-transpile-modules')(['face-api.js']);



export default nextConfig;
