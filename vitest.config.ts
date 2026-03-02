import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/**/src/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      '@arvis/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@arvis/connector-discord': path.resolve(__dirname, 'packages/connector-discord/src/index.ts'),
      '@arvis/connector-telegram': path.resolve(__dirname, 'packages/connector-telegram/src/index.ts'),
      '@arvis/connector-web': path.resolve(__dirname, 'packages/connector-web/src/index.ts'),
      '@arvis/dashboard': path.resolve(__dirname, 'packages/dashboard/src/index.ts'),
    },
  },
});
