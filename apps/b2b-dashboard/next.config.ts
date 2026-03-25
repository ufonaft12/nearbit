import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "path";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb", // allow large CSV/Excel uploads
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
