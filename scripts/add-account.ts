#!/usr/bin/env tsx
/**
 * npx tsx scripts/add-account.ts [name]
 *
 * Sets up a new Claude CLI subscription account for Arvis.
 *
 * What it does:
 *   1. Creates  data/accounts/<name>/
 *   2. Launches `claude` with HOME pointed there so auth files land inside
 *   3. After you log in, it prints the .env line to add
 *
 * Usage:
 *   npx tsx scripts/add-account.ts            → account named "acc1" (auto-increments)
 *   npx tsx scripts/add-account.ts work       → account named "work"
 *   npx tsx scripts/add-account.ts personal   → account named "personal"
 */
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const ACCOUNTS_DIR = path.join(ROOT, 'data', 'accounts');

// Determine account name
let name = process.argv[2];
if (!name) {
  // Auto-increment: acc1, acc2, acc3...
  if (!fs.existsSync(ACCOUNTS_DIR)) fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
  const existing = fs.readdirSync(ACCOUNTS_DIR).filter(d =>
    fs.statSync(path.join(ACCOUNTS_DIR, d)).isDirectory()
  );
  let n = 1;
  while (existing.includes(`acc${n}`)) n++;
  name = `acc${n}`;
}

const accountDir = path.join(ACCOUNTS_DIR, name);

console.log('');
console.log(`  \x1b[35m▸ Arvis — Add CLI Subscription Account\x1b[0m`);
console.log('');

// Create account directory
if (!fs.existsSync(accountDir)) {
  fs.mkdirSync(accountDir, { recursive: true });
  console.log(`  \x1b[32m✓\x1b[0m Created ${path.relative(ROOT, accountDir)}/`);
} else {
  console.log(`  \x1b[33m⚠\x1b[0m Directory already exists: ${path.relative(ROOT, accountDir)}/`);
}

// Check if claude is installed
try {
  execSync('claude --version', { stdio: 'pipe' });
} catch {
  console.log('  \x1b[31m✗\x1b[0m Claude CLI not found. Install it first:');
  console.log('    npm install -g @anthropic-ai/claude-code');
  console.log('');
  process.exit(1);
}

// Check if already authenticated
const claudeDir = path.join(accountDir, '.claude');
if (fs.existsSync(claudeDir) && fs.readdirSync(claudeDir).length > 0) {
  console.log(`  \x1b[32m✓\x1b[0m Account "${name}" already authenticated`);
  printEnvInstructions();
  process.exit(0);
}

console.log(`  \x1b[36m⏳\x1b[0m Launching Claude CLI to authenticate as "${name}"...`);
console.log(`  \x1b[90m   (A browser window will open — log in with your Claude account)\x1b[0m`);
console.log('');

// Spawn claude interactively with HOME set to the account directory
const env = { ...process.env, CLAUDECODE: undefined as unknown as string };
if (process.platform === 'win32') {
  env.USERPROFILE = accountDir;
} else {
  env.HOME = accountDir;
}
// Remove CLAUDECODE so it doesn't block nested launch
delete env.CLAUDECODE;

const child = spawn('claude', [], {
  cwd: accountDir,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('close', (code) => {
  console.log('');
  if (code === 0 || fs.existsSync(claudeDir)) {
    console.log(`  \x1b[32m✓\x1b[0m Account "${name}" authenticated successfully!`);
    printEnvInstructions();
  } else {
    console.log(`  \x1b[31m✗\x1b[0m Authentication failed (exit code ${code})`);
    console.log(`  \x1b[90m   Try running manually: claude\x1b[0m`);
  }
  console.log('');
});

function printEnvInstructions() {
  const relPath = path.relative(ROOT, accountDir);
  const absPath = accountDir;
  const existingAccounts = fs.readdirSync(ACCOUNTS_DIR).filter(d =>
    fs.statSync(path.join(ACCOUNTS_DIR, d)).isDirectory() &&
    fs.existsSync(path.join(ACCOUNTS_DIR, d, '.claude'))
  );
  const index = existingAccounts.indexOf(name);

  console.log('');
  console.log(`  \x1b[35mAdd to your .env:\x1b[0m`);
  console.log('');

  if (existingAccounts.length === 1) {
    console.log(`  CLAUDE_CLI_HOME=${absPath}`);
  } else {
    // Show all accounts with indexed env vars
    for (let i = 0; i < existingAccounts.length; i++) {
      const accPath = path.join(ACCOUNTS_DIR, existingAccounts[i]);
      const suffix = i === 0 ? '' : `_${i + 1}`;
      console.log(`  CLAUDE_CLI_HOME${suffix}=${accPath}`);
    }
  }

  console.log('');
  console.log(`  \x1b[90mOr add via Dashboard → Settings → Accounts → Add Account`);
  console.log(`  Type: CLI Subscription, Home Dir: ${absPath}\x1b[0m`);
  console.log('');
  console.log(`  \x1b[90mTotal accounts: ${existingAccounts.length}\x1b[0m`);
}
