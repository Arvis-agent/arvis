import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// All connector config keys stored in the config table
const CONNECTOR_KEYS = [
  'connector.discord.token',
  'connector.discord.owner_id',
  'connector.telegram.token',
  'connector.slack.bot_token',
  'connector.slack.app_token',
  'connector.slack.signing_secret',
  'connector.whatsapp.access_token',
  'connector.whatsapp.phone_number_id',
  'connector.whatsapp.verify_token',
  'connector.matrix.homeserver_url',
  'connector.matrix.access_token',
  'connector.matrix.user_id',
  'connector.web.port',
  'connector.web.api_key',
  'connector.sms.account_sid',
  'connector.sms.auth_token',
  'connector.sms.phone_number',
  'connector.email.imap_host',
  'connector.email.imap_port',
  'connector.email.imap_user',
  'connector.email.imap_password',
  'connector.email.smtp_host',
  'connector.email.smtp_port',
  'connector.email.smtp_user',
  'connector.email.smtp_password',
  'connector.email.from_address',
] as const;

/** GET /api/connectors — returns all connector config values (masked secrets) */
export async function GET(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;

  const rows = db.all<{ key: string; value: string }>(
    `SELECT key, value FROM config WHERE key LIKE 'connector.%' ORDER BY key`,
  );

  // Build a map: connector.discord.token → value
  const config: Record<string, string> = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }

  // Also check env vars as fallback (so existing setups show as configured)
  const envFallbacks: Record<string, string> = {
    'connector.discord.token':           process.env.DISCORD_TOKEN || '',
    'connector.discord.owner_id':        process.env.DISCORD_OWNER_ID || '',
    'connector.telegram.token':          process.env.TELEGRAM_BOT_TOKEN || '',
    'connector.slack.bot_token':         process.env.SLACK_BOT_TOKEN || '',
    'connector.slack.app_token':         process.env.SLACK_APP_TOKEN || '',
    'connector.slack.signing_secret':    process.env.SLACK_SIGNING_SECRET || '',
    'connector.whatsapp.access_token':   process.env.WHATSAPP_ACCESS_TOKEN || '',
    'connector.whatsapp.phone_number_id':process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    'connector.whatsapp.verify_token':   process.env.WHATSAPP_VERIFY_TOKEN || '',
    'connector.matrix.homeserver_url':   process.env.MATRIX_HOMESERVER_URL || '',
    'connector.matrix.access_token':     process.env.MATRIX_ACCESS_TOKEN || '',
    'connector.matrix.user_id':          process.env.MATRIX_USER_ID || '',
    'connector.web.port':                process.env.WEB_CONNECTOR_PORT || '5070',
    'connector.web.api_key':             process.env.WEB_API_KEY || '',
    'connector.sms.account_sid':         process.env.TWILIO_ACCOUNT_SID || '',
    'connector.sms.auth_token':          process.env.TWILIO_AUTH_TOKEN || '',
    'connector.sms.phone_number':        process.env.TWILIO_PHONE_NUMBER || '',
    'connector.email.imap_host':         process.env.EMAIL_IMAP_HOST || '',
    'connector.email.imap_port':         process.env.EMAIL_IMAP_PORT || '993',
    'connector.email.imap_user':         process.env.EMAIL_IMAP_USER || '',
    'connector.email.imap_password':     process.env.EMAIL_IMAP_PASSWORD || '',
    'connector.email.smtp_host':         process.env.EMAIL_SMTP_HOST || '',
    'connector.email.smtp_port':         process.env.EMAIL_SMTP_PORT || '587',
    'connector.email.smtp_user':         process.env.EMAIL_SMTP_USER || '',
    'connector.email.smtp_password':     process.env.EMAIL_SMTP_PASSWORD || '',
    'connector.email.from_address':      process.env.EMAIL_FROM_ADDRESS || '',
  };

  const result: Record<string, string> = {};
  for (const key of CONNECTOR_KEYS) {
    // DB config overrides env var
    const value = config[key] ?? envFallbacks[key] ?? '';
    // Mask secrets (tokens/keys) — show only last 4 chars if set
    const isSecret = key.includes('token') || key.includes('key') || key.includes('secret') || key.includes('password');
    result[key] = isSecret && value.length > 4
      ? `${'•'.repeat(Math.min(value.length - 4, 20))}${value.slice(-4)}`
      : value;
  }

  // Check bot_instances table — any enabled bot counts as "configured" for its platform
  const botRows = db.all<{ platform: string }>(
    `SELECT DISTINCT platform FROM bot_instances WHERE enabled = 1`,
  );
  const botPlatforms = new Set(botRows.map((r) => r.platform));

  // A connector is configured if it has a token in config/env OR has an enabled bot_instance
  const configured = {
    discord:  !!(config['connector.discord.token']  || process.env.DISCORD_TOKEN  || botPlatforms.has('discord')),
    telegram: !!(config['connector.telegram.token'] || process.env.TELEGRAM_BOT_TOKEN || botPlatforms.has('telegram')),
    slack:    !!(config['connector.slack.bot_token'] || process.env.SLACK_BOT_TOKEN   || botPlatforms.has('slack')),
    whatsapp: !!(config['connector.whatsapp.access_token'] || process.env.WHATSAPP_ACCESS_TOKEN || botPlatforms.has('whatsapp')),
    matrix:   !!(config['connector.matrix.access_token'] || process.env.MATRIX_ACCESS_TOKEN   || botPlatforms.has('matrix')),
    web:      true, // always available
    sms:      !!(config['connector.sms.account_sid'] || process.env.TWILIO_ACCOUNT_SID || botPlatforms.has('sms')),
    email:    !!(config['connector.email.imap_host'] || process.env.EMAIL_IMAP_HOST    || botPlatforms.has('email')),
  };

  return NextResponse.json({ config: result, configured });
}

/** PATCH /api/connectors — save connector config values to config table */
export async function PATCH(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;

  const body = await request.json() as Record<string, string>;

  for (const [key, value] of Object.entries(body)) {
    if (!CONNECTOR_KEYS.includes(key as typeof CONNECTOR_KEYS[number])) continue;
    if (value === '' || value === null) {
      db.run(`DELETE FROM config WHERE key = ?`, key);
    } else {
      db.run(
        `INSERT OR REPLACE INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
        key,
        value,
      );
    }
  }

  return NextResponse.json({ ok: true, message: 'Restart Arvis for changes to take effect' });
}
