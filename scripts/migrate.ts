import { loadConfig, ArvisDatabase } from '@arvis/core';
import initialMigration from '../packages/core/src/db/migrations/001-initial.js';

const config = loadConfig();
const db = new ArvisDatabase(config);

const arg = process.argv[2];

if (arg === 'rollback') {
  const name = db.rollback([initialMigration]);
  if (name) {
    console.log(`Rolled back: ${name}`);
  } else {
    console.log('No migrations to rollback.');
  }
} else {
  db.migrate([initialMigration]);
  console.log('Migrations applied.');
}

db.close();
