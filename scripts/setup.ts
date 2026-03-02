import { loadConfig } from '@arvis/core';
import { ArvisDatabase } from '@arvis/core';
import initialMigration from '../packages/core/src/db/migrations/001-initial.js';
import { AccountManager } from '@arvis/core';
import fs from 'fs';
import path from 'path';

async function setup() {
  console.log('=== Arvis v3 Setup ===\n');

  // Check for .env
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    const examplePath = path.resolve(process.cwd(), '.env.example');
    if (fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, envPath);
      console.log('Created .env from .env.example — please fill in your values.\n');
      process.exit(0);
    } else {
      console.error('No .env file found. Copy .env.example to .env and fill in your values.');
      process.exit(1);
    }
  }

  // Load config
  const config = loadConfig();
  console.log(`Data directory: ${config.dataDir}`);

  // Initialize database
  const db = new ArvisDatabase(config);
  db.migrate([initialMigration]);
  console.log('Database initialized and migrations applied.');

  // Sync accounts
  const accounts = new AccountManager(db);
  accounts.syncFromConfig(config.accounts);
  console.log(`Accounts synced: ${config.accounts.length} account(s)`);

  // Create data subdirectories
  for (const subdir of ['logs', 'backups']) {
    const dir = path.join(config.dataDir, subdir);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  db.close();

  console.log('\nSetup complete! Run `npm start` to launch Arvis.');
}

setup().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
