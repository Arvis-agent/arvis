import { Arvis, createLogger } from '@arvis/core';

const log = createLogger('main');
const arvis = new Arvis();

async function main() {
  await arvis.start();

  // Seed env-var bots into DB (no-op if already present), then start all enabled bots.
  // ConnectorManager polls DB every 30s — bots added via dashboard start automatically.
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

  if (arvis.config.dashboard.port) {
    log.info(
      { port: arvis.config.dashboard.port },
      'Dashboard available at http://localhost:' + arvis.config.dashboard.port + ' (run: npm run dashboard)',
    );
  }
}

process.on('SIGINT',  async () => { await arvis.stop(); process.exit(0); });
process.on('SIGTERM', async () => { await arvis.stop(); process.exit(0); });

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
