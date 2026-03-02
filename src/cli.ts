#!/usr/bin/env tsx
/**
 * Arvis CLI entry point.
 * Usage: npx tsx src/cli.ts   (dev)
 *        node dist/cli.js     (after build)
 *        npx arvis            (if installed globally)
 */
import { Arvis, createLogger } from '@arvis/core';

const log = createLogger('main');

const BANNER = `
  ╔══════════════════════════════════════════════╗
  ║                                              ║
  ║   >_<   arvis   v3                          ║
  ║                                              ║
  ║   self-hosted AI agent platform              ║
  ║                                              ║
  ╚══════════════════════════════════════════════╝
`;

const arvis = new Arvis();

async function main() {
  console.log(BANNER);

  await arvis.start();

  // Seed env-var bots into DB (no-op if already present), then start all enabled bots.
  arvis.connectorManager.seedFromEnv();
  await arvis.connectorManager.startAll();

  // Web connector always starts (powers dashboard chat + REST API)
  if (arvis.config.web.port) {
    try {
      const { WebConnector } = await import('@arvis/connector-web');
      const web = new WebConnector(arvis.bus, {
        port:   arvis.config.web.port,
        apiKey: arvis.config.web.apiKey,
      });
      await web.start();
      log.info({ port: arvis.config.web.port }, 'Web connector started');
    } catch (err) {
      log.error({ err }, 'Web connector failed to start');
    }
  }

  const dashboardPort = arvis.config.dashboard.port || 5100;
  console.log(`\n  Core ready. Start the dashboard:  npm run dashboard`);
  console.log(`  Dashboard will be at:             http://localhost:${dashboardPort}\n`);
}

process.on('SIGINT',  async () => { await arvis.stop(); process.exit(0); });
process.on('SIGTERM', async () => { await arvis.stop(); process.exit(0); });

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
