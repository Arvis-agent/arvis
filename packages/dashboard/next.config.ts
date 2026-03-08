import type { NextConfig } from 'next';

// ── Security Headers ───────────────────────────────────────────────────────────
// Applied to every response. Safe defaults for a self-hosted dashboard.
const securityHeaders = [
  // Prevent embedding in iframes (clickjacking protection)
  { key: 'X-Frame-Options', value: 'DENY' },
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Referrer policy — don't leak URL to external resources
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Permissions policy — deny access to dangerous browser APIs
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // Strict CSP: allow same-origin scripts/styles, ws: for WebSocket chat
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "connect-src 'self' ws: wss:",  // WebSocket for real-time chat
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },

  // Native modules + connector packages (discord.js etc.) must not be bundled by Next.js
  serverExternalPackages: [
    'better-sqlite3',
    // pino uses thread-stream which spawns worker threads via relative require('./lib/worker.js')
    // — bundling it breaks the worker path resolution, so keep all pino deps external
    'pino',
    'pino-pretty',
    'thread-stream',
    'sonic-boom',
    'on-exit-leak-free',
    'atomic-sleep',
    '@arvis/connector-discord',
    '@arvis/connector-telegram',
    '@arvis/connector-slack',
    '@arvis/connector-whatsapp',
    '@arvis/connector-matrix',
    '@arvis/connector-web',
    '@arvis/connector-sms',
    '@arvis/connector-email',
  ],
  // Transpile @arvis/core from TypeScript source
  transpilePackages: ['@arvis/core'],

  webpack: (config) => {
    // Resolve .js imports to .ts files (ESM convention used by @arvis/core)
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    };

    // Suppress "Critical dependency" warnings from @arvis/core — tool-executor and plugin-loader
    // use dynamic import(variableUrl) for plugin loading which is intentional server-side code
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      { message: /Critical dependency/ },
    ];

    // Connector packages use native deps (discord.js → zlib-sync etc.) — keep them external
    const connectorExternals = [
      '@arvis/connector-discord',
      '@arvis/connector-telegram',
      '@arvis/connector-slack',
      '@arvis/connector-whatsapp',
      '@arvis/connector-matrix',
      '@arvis/connector-web',
      '@arvis/connector-sms',
      '@arvis/connector-email',
    ];
    const existing = config.externals ?? [];
    const existingArr = Array.isArray(existing) ? existing : [existing];
    config.externals = [
      ...existingArr,
      ({ request }: { request?: string }, callback: (err?: Error | null, result?: string) => void) => {
        if (request && connectorExternals.some((pkg) => request === pkg || request.startsWith(pkg + '/'))) {
          return callback(null, `commonjs ${request}`);
        }
        callback();
      },
    ];

    return config;
  },
};

export default nextConfig;
