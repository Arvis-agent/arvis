import { config as dotenvConfig } from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createLogger } from './logger.js';

const log = createLogger('config');

export interface AccountConfig {
  name: string;
  type: 'cli_subscription' | 'api_key';
  provider?: string;
  homeDir?: string;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  priority?: number;
}

export interface ArvisConfig {
  dataDir: string;
  discord: {
    token: string;
    ownerId: string;
    conductorChannel?: string;
  };
  telegram: {
    token?: string;
  };
  slack: {
    botToken?: string;
    appToken?: string;
    signingSecret?: string;
  };
  whatsapp: {
    accessToken?: string;
    phoneNumberId?: string;
    verifyToken?: string;
    webhookPath?: string;
  };
  matrix: {
    homeserverUrl?: string;
    accessToken?: string;
    userId?: string;
  };
  web: {
    port: number;
    apiKey?: string;
  };
  accounts: AccountConfig[];
  webhook: {
    port: number;
    secret?: string;
  };
  dashboard: {
    port: number;
    apiKey?: string;
  };
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  timezone: string;
}

/**
 * Loads configuration from .env file and environment variables.
 * Supports multiple LLM providers via env vars.
 * @throws {Error} If no LLM accounts are configured
 */
export function loadConfig(envPath?: string): ArvisConfig {
  // Load .env file
  const resolvedPath = envPath || path.resolve(process.cwd(), '.env');
  if (fs.existsSync(resolvedPath)) {
    dotenvConfig({ path: resolvedPath });
    log.debug({ path: resolvedPath }, 'Loaded .env file');
  }

  // Build accounts list from all detected providers
  const accounts: AccountConfig[] = [];

  // --- Anthropic CLI subscriptions (supports indexed: CLAUDE_CLI_HOME, _1, _2, ...) ---
  const cliHomes = collectIndexedKeys('CLAUDE_CLI_HOME');
  const cliModels = collectIndexedKeys('CLAUDE_CLI_MODEL');
  for (let i = 0; i < cliHomes.length; i++) {
    accounts.push({
      name: i === 0 ? 'primary-cli' : `primary-cli-${i + 1}`,
      type: 'cli_subscription',
      provider: 'anthropic',
      homeDir: cliHomes[i],
      model: cliModels[i] || process.env.CLAUDE_CLI_MODEL || 'claude-sonnet-4-6',
      priority: 10 + i, // 10, 11, 12 ... so first account is tried first
    });
  }

  // --- Anthropic API keys (supports indexed: ANTHROPIC_API_KEY, _1, _2, ...) ---
  const anthropicKeys = collectIndexedKeys('ANTHROPIC_API_KEY');
  for (let i = 0; i < anthropicKeys.length; i++) {
    accounts.push({
      name: i === 0 ? 'anthropic-api' : `anthropic-api-${i + 1}`,
      type: 'api_key',
      provider: 'anthropic',
      apiKey: anthropicKeys[i],
      model: process.env.ANTHROPIC_API_MODEL || 'claude-haiku-4-5-20251001',
      priority: 20,
    });
  }

  // --- OpenAI API keys ---
  const openaiKeys = collectIndexedKeys('OPENAI_API_KEY');
  for (let i = 0; i < openaiKeys.length; i++) {
    accounts.push({
      name: i === 0 ? 'openai-api' : `openai-api-${i + 1}`,
      type: 'api_key',
      provider: 'openai',
      apiKey: openaiKeys[i],
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      priority: 50,
    });
  }

  // --- OpenRouter API keys ---
  const openrouterKeys = collectIndexedKeys('OPENROUTER_API_KEY');
  for (let i = 0; i < openrouterKeys.length; i++) {
    accounts.push({
      name: i === 0 ? 'openrouter-api' : `openrouter-api-${i + 1}`,
      type: 'api_key',
      provider: 'openrouter',
      apiKey: openrouterKeys[i],
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4',
      priority: 60,
    });
  }

  // --- Google Gemini API keys ---
  const googleKeys = collectIndexedKeys('GOOGLE_API_KEY');
  for (let i = 0; i < googleKeys.length; i++) {
    accounts.push({
      name: i === 0 ? 'google-api' : `google-api-${i + 1}`,
      type: 'api_key',
      provider: 'google',
      apiKey: googleKeys[i],
      model: process.env.GOOGLE_MODEL || 'gemini-2.0-flash',
      priority: 70,
    });
  }

  // --- Ollama (local, no key needed) ---
  const ollamaUrl = process.env.OLLAMA_BASE_URL;
  if (ollamaUrl) {
    accounts.push({
      name: 'ollama-local',
      type: 'api_key',
      provider: 'ollama',
      baseUrl: ollamaUrl,
      model: process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b',
      priority: 200, // lowest priority — use as last resort
    });
  }

  // Validate: need at least one account
  if (accounts.length === 0) {
    throw new Error(
      `No LLM accounts configured. Set at least one of:\n` +
      `  - CLAUDE_CLI_HOME (Claude CLI subscription)\n` +
      `  - ANTHROPIC_API_KEY (Anthropic API)\n` +
      `  - OPENAI_API_KEY (OpenAI API)\n` +
      `  - OPENROUTER_API_KEY (OpenRouter)\n` +
      `  - GOOGLE_API_KEY (Google Gemini)\n` +
      `  - OLLAMA_BASE_URL (Ollama local)\n\n` +
      `See .env.example for reference.`
    );
  }

  log.info({ accountCount: accounts.length, providers: [...new Set(accounts.map(a => a.provider))] }, 'LLM accounts detected');

  const dataDir = process.env.ARVIS_DATA_DIR || './data';
  const resolvedDataDir = path.resolve(process.cwd(), dataDir);
  if (!fs.existsSync(resolvedDataDir)) {
    fs.mkdirSync(resolvedDataDir, { recursive: true });
  }

  const discordToken = process.env.DISCORD_TOKEN || '';
  const discordOwnerId = process.env.DISCORD_OWNER_ID || '';

  const config: ArvisConfig = {
    dataDir: resolvedDataDir,
    discord: {
      token: discordToken,
      ownerId: discordOwnerId,
      conductorChannel: process.env.CONDUCTOR_CHANNEL || undefined,
    },
    telegram: {
      token: process.env.TELEGRAM_BOT_TOKEN || undefined,
    },
    slack: {
      botToken: process.env.SLACK_BOT_TOKEN || undefined,
      appToken: process.env.SLACK_APP_TOKEN || undefined,
      signingSecret: process.env.SLACK_SIGNING_SECRET || undefined,
    },
    whatsapp: {
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || undefined,
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || undefined,
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || undefined,
      webhookPath: process.env.WHATSAPP_WEBHOOK_PATH || '/whatsapp',
    },
    matrix: {
      homeserverUrl: process.env.MATRIX_HOMESERVER_URL || undefined,
      accessToken: process.env.MATRIX_ACCESS_TOKEN || undefined,
      userId: process.env.MATRIX_USER_ID || undefined,
    },
    web: {
      port: parseInt(process.env.WEB_CONNECTOR_PORT || '5070', 10),
      apiKey: process.env.WEB_API_KEY || undefined,
    },
    accounts,
    webhook: {
      port: parseInt(process.env.WEBHOOK_PORT || '5050', 10),
      secret: process.env.WEBHOOK_SECRET || undefined,
    },
    dashboard: {
      port: parseInt(process.env.DASHBOARD_PORT || '5100', 10),
      apiKey: process.env.DASHBOARD_API_KEY || undefined,
    },
    logLevel: (process.env.LOG_LEVEL || 'info') as ArvisConfig['logLevel'],
    timezone: process.env.TIMEZONE || 'UTC',
  };

  log.info('Configuration loaded successfully');
  return config;
}

/**
 * Collect indexed env var keys.
 * Given prefix "ANTHROPIC_API_KEY", collects:
 * - ANTHROPIC_API_KEY (if set)
 * - ANTHROPIC_API_KEY_1, _2, _3, ... (up to first gap)
 */
function collectIndexedKeys(prefix: string): string[] {
  const keys: string[] = [];

  // Primary key
  const primary = process.env[prefix];
  if (primary) keys.push(primary);

  // Indexed keys: PREFIX_1, PREFIX_2, ...
  for (let i = 1; i <= 50; i++) {
    const key = process.env[`${prefix}_${i}`];
    if (key) {
      keys.push(key);
    } else {
      break; // Stop at first gap
    }
  }

  return keys;
}
