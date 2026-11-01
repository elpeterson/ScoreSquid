import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shared packages ship as TypeScript source.
  transpilePackages: ['@scoresquid/auth', '@scoresquid/ui'],
};

export default nextConfig;
