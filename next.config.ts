import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production';

// Extract dynamic Supabase host if configured
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qyjhicibrciqcznsdevk.supabase.co';
let supabaseHost = 'qyjhicibrciqcznsdevk.supabase.co';
try {
  supabaseHost = new URL(supabaseUrl).host;
} catch {
  // Use default
}

const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(self), geolocation=(), browsing-topics=()',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // In production, unsafe-eval is completely removed. In dev, eval is allowed for Turbopack/HMR.
      isProd
        ? "script-src 'self' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      `img-src 'self' data: blob: https://${supabaseHost}`,
      `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://generativelanguage.googleapis.com`,
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "qyjhicibrciqcznsdevk.supabase.co",
        pathname: "/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  poweredByHeader: false,
};

export default nextConfig;

