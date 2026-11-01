import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Shared packages ship as TypeScript source.
  transpilePackages: ['@scoresquid/auth', '@scoresquid/ui'],
  // The About page renders this file at runtime.
  outputFileTracingIncludes: {
    '/gymnastics/about': ['./docs/gymnastics/README.md'],
  },
};

export default nextConfig;
