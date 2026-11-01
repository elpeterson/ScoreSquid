import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shared packages ship as TypeScript source.
  transpilePackages: ['@scoresquid/ui'],
};

export default nextConfig;
