import fs from 'fs';
import path from 'path';
import { createLogger } from '../logger.js';

const log = createLogger('plugins');

/**
 * Auto-loads plugin files from the plugins/ directory.
 * Each plugin file can call registerTool() to add custom tools,
 * or import connectors/hooks to extend Arvis functionality.
 *
 * Files are loaded in alphabetical order.
 * Errors in individual plugins are caught and logged — one bad plugin
 * won't crash the whole system.
 */
export async function loadPlugins(pluginsDir: string): Promise<void> {
  if (!fs.existsSync(pluginsDir)) {
    log.debug({ dir: pluginsDir }, 'No plugins directory found — skipping');
    return;
  }

  const files = fs.readdirSync(pluginsDir)
    .filter(f => f.endsWith('.ts') || f.endsWith('.js') || f.endsWith('.mjs'))
    .filter(f => !f.startsWith('_') && !f.startsWith('.'))
    .sort();

  if (files.length === 0) {
    log.debug({ dir: pluginsDir }, 'No plugin files found');
    return;
  }

  log.info({ count: files.length, dir: pluginsDir }, 'Loading plugins');

  for (const file of files) {
    const fullPath = path.join(pluginsDir, file);
    try {
      await import(fullPath);
      log.info({ file }, 'Plugin loaded');
    } catch (err) {
      log.error({ file, err }, 'Failed to load plugin — skipping');
    }
  }
}
