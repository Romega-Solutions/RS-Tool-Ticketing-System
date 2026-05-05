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
  images: {
    // Allow SVG files to pass through the image pipeline unmodified
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
