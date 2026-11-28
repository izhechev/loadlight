import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://accounts.google.com/gsi/client",
              "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self' *.supabase.co wss://*.supabase.co api.openai.com generativelanguage.googleapis.com https://www.googleapis.com https://accounts.google.com/gsi/",
              "frame-src https://accounts.google.com/gsi/",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
