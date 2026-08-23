import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  allowedDevOrigins: ["excretory-sizzle-hankering.ngrok-free.dev"],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
