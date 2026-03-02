import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('loadConfig', () => {
  let tmpDir: string;
  let envPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arvis-config-test-'));
    envPath = path.join(tmpDir, '.env');

    // Clear any existing env vars that might interfere
    delete process.env.DISCORD_TOKEN;
    delete process.env.DISCORD_OWNER_ID;
    delete process.env.CLAUDE_CLI_HOME;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ARVIS_DATA_DIR;
    delete process.env.WEBHOOK_PORT;
    delete process.env.DASHBOARD_PORT;
    delete process.env.LOG_LEVEL;
    delete process.env.TIMEZONE;
    delete process.env.CONDUCTOR_CHANNEL;
    delete process.env.CLAUDE_CLI_MODEL;
    delete process.env.ANTHROPIC_API_MODEL;
    delete process.env.WEBHOOK_SECRET;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Clean up
    delete process.env.DISCORD_TOKEN;
    delete process.env.DISCORD_OWNER_ID;
    delete process.env.CLAUDE_CLI_HOME;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ARVIS_DATA_DIR;
  });

  function writeEnv(content: string): void {
    fs.writeFileSync(envPath, content);
  }

  it('loads config from .env file', () => {
    const dataDir = path.join(tmpDir, 'data');
    writeEnv(`
DISCORD_TOKEN=test-token-123
DISCORD_OWNER_ID=owner-456
ARVIS_DATA_DIR=${dataDir}
CLAUDE_CLI_HOME=/home/test
`);

    const config = loadConfig(envPath);
    expect(config.discord.token).toBe('test-token-123');
    expect(config.discord.ownerId).toBe('owner-456');
    expect(config.accounts).toHaveLength(1);
    expect(config.accounts[0].type).toBe('cli_subscription');
    expect(config.accounts[0].homeDir).toBe('/home/test');
  });

  it('allows missing DISCORD_TOKEN (optional)', () => {
    writeEnv('DISCORD_OWNER_ID=owner-456\nCLAUDE_CLI_HOME=/tmp/cli');
    const config = loadConfig(envPath);
    expect(config.discord.token).toBe('');
  });

  it('allows missing DISCORD_OWNER_ID (optional)', () => {
    writeEnv('DISCORD_TOKEN=test-token\nCLAUDE_CLI_HOME=/tmp/cli');
    const config = loadConfig(envPath);
    expect(config.discord.ownerId).toBe('');
  });

  it('creates API account when ANTHROPIC_API_KEY is set', () => {
    const dataDir = path.join(tmpDir, 'data');
    writeEnv(`
DISCORD_TOKEN=test
DISCORD_OWNER_ID=owner
ARVIS_DATA_DIR=${dataDir}
ANTHROPIC_API_KEY=sk-ant-test-key
`);

    const config = loadConfig(envPath);
    // Should have both CLI (default) and API accounts
    const apiAccount = config.accounts.find(a => a.type === 'api_key');
    expect(apiAccount).toBeDefined();
    expect(apiAccount!.apiKey).toBe('sk-ant-test-key');
  });

  it('uses default values for optional vars', () => {
    const dataDir = path.join(tmpDir, 'data');
    writeEnv(`
DISCORD_TOKEN=test
DISCORD_OWNER_ID=owner
ARVIS_DATA_DIR=${dataDir}
CLAUDE_CLI_HOME=/tmp/cli
`);

    const config = loadConfig(envPath);
    expect(config.webhook.port).toBe(5050);
    expect(config.dashboard.port).toBe(5100);
    expect(config.logLevel).toBe('info');
    expect(config.timezone).toBe('UTC');
  });

  it('creates data directory if it does not exist', () => {
    const dataDir = path.join(tmpDir, 'nested', 'data');
    writeEnv(`
DISCORD_TOKEN=test
DISCORD_OWNER_ID=owner
ARVIS_DATA_DIR=${dataDir}
CLAUDE_CLI_HOME=/tmp/cli
`);

    loadConfig(envPath);
    expect(fs.existsSync(dataDir)).toBe(true);
  });

  it('respects CONDUCTOR_CHANNEL', () => {
    const dataDir = path.join(tmpDir, 'data');
    writeEnv(`
DISCORD_TOKEN=test
DISCORD_OWNER_ID=owner
ARVIS_DATA_DIR=${dataDir}
CLAUDE_CLI_HOME=/tmp/cli
CONDUCTOR_CHANNEL=chan-789
`);

    const config = loadConfig(envPath);
    expect(config.discord.conductorChannel).toBe('chan-789');
  });
});
