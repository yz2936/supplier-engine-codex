import type { NextConfig } from "next";

const isVercel = Boolean(process.env.VERCEL);

const nextConfig: NextConfig = {
  distDir: isVercel ? ".next" : process.env.NEXT_DIST_DIR?.trim() || ".next",
  typedRoutes: true,
  turbopack: {
    root: process.cwd()
  }
};

export default nextConfig;
