import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev over tunnels: allow HMR WebSocket (`/_next/webpack-hmr`) from public dev origins.
  // See https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
