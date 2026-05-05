import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  // better-sqlite3 uses native bindings — must not be bundled
  serverExternalPackages: ['better-sqlite3'],
  // Ensure sqlite.db is included in Vercel's serverless function bundle
  outputFileTracingIncludes: {
    '/**': ['./sqlite.db'],
  },
};

export default nextConfig;
