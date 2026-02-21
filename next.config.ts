import type { NextConfig } from "next";

const isVercel = Boolean(process.env.VERCEL);

const nextConfig: NextConfig = {
  distDir: isVercel ? ".next" : process.env.NEXT_DIST_DIR?.trim() || ".next",
  experimental: {
    typedRoutes: true
  }
};

export default nextConfig;
