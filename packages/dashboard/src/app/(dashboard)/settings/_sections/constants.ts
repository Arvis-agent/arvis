import {
  DiscordIcon, SlackIcon, TelegramIcon, WhatsAppIcon, MatrixIcon, WebIcon, SmsIcon, EmailIcon,
  AnthropicIcon, OpenAIIcon, GoogleIcon, OllamaIcon, OpenRouterIcon, CustomProviderIcon,
} from '@/components/ui/platform-icons';
import type React from 'react';

export const PROVIDERS: Record<string, { label: string; models: string[] }> = {
  anthropic:  { label: 'Anthropic',  models: [
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
    'claude-opus-4-5-20251101',
    'claude-sonnet-4-5-20250929',
    'claude-sonnet-4-20250514',
    'claude-opus-4-20250514',
  ]},
  openai:     { label: 'OpenAI',     models: [
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'gpt-4o-mini',
    'o3',
    'o4-mini',
  ]},
  openrouter: { label: 'OpenRouter', models: [
    'openai/gpt-4.1',
    'openai/gpt-4.1-mini',
    'anthropic/claude-sonnet-4-6',
    'anthropic/claude-haiku-4-5-20251001',
    'google/gemini-2.5-flash',
    'google/gemini-2.5-pro',
    'meta-llama/llama-3.3-70b-instruct',
    'meta-llama/llama-4-maverick',
    'deepseek/deepseek-r1',
    'deepseek/deepseek-chat-v3-5',
    'qwen/qwen3-235b-a22b',
    'mistralai/mistral-large-2411',
    'cohere/command-r-plus-08-2024',
    'x-ai/grok-3-beta',
  ]},
  google:     { label: 'Google',     models: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
  ]},
  ollama:     { label: 'Ollama',     models: ['llama3.3', 'llama3.1', 'mistral', 'mixtral', 'deepseek-r1', 'qwen2.5', 'phi4'] },
  custom:     { label: 'Custom',     models: [] },
};

export const PROVIDER_OPTIONS = Object.entries(PROVIDERS).map(([k, v]) => ({ value: k, label: v.label }));

export const PROVIDER_COLORS: Record<string, string> = {
  anthropic:  'text-orange-400',
  openai:     'text-emerald-400',
  openrouter: 'text-blue-400',
  google:     'text-yellow-400',
  ollama:     'text-purple-400',
  custom:     'text-muted-foreground',
};

export const PROVIDER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  anthropic:  AnthropicIcon,
  openai:     OpenAIIcon,
  google:     GoogleIcon,
  ollama:     OllamaIcon,
  openrouter: OpenRouterIcon,
  custom:     CustomProviderIcon,
};

export const CONNECTORS = [
  { key: 'discord',  label: 'Discord',   Icon: DiscordIcon,  env: 'DISCORD_TOKEN',        desc: 'Bot token from Discord Developer Portal',    allEnvs: ['DISCORD_TOKEN'] },
  { key: 'telegram', label: 'Telegram',  Icon: TelegramIcon, env: 'TELEGRAM_BOT_TOKEN',   desc: 'Token from @BotFather',                      allEnvs: ['TELEGRAM_BOT_TOKEN'] },
  { key: 'slack',    label: 'Slack',     Icon: SlackIcon,    env: 'SLACK_BOT_TOKEN',       desc: 'xoxb- token from Slack App settings',        allEnvs: ['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN'] },
  { key: 'whatsapp', label: 'WhatsApp',  Icon: WhatsAppIcon, env: 'WHATSAPP_ACCESS_TOKEN', desc: 'Access token from Meta Business API',        allEnvs: ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] },
  { key: 'matrix',   label: 'Matrix',    Icon: MatrixIcon,   env: 'MATRIX_ACCESS_TOKEN',  desc: 'Access token from your Matrix homeserver',   allEnvs: ['MATRIX_HOMESERVER_URL', 'MATRIX_ACCESS_TOKEN'] },
  { key: 'web',      label: 'Web Chat',  Icon: WebIcon,      env: 'WEB_CONNECTOR_PORT',   desc: 'Port for WebSocket connector (default 5070)', allEnvs: ['WEB_CONNECTOR_PORT'] },
  { key: 'sms',      label: 'SMS',       Icon: SmsIcon,      env: 'TWILIO_ACCOUNT_SID',   desc: 'Configure via Add Bot ↑ (uses bot_instances)', allEnvs: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'] },
  { key: 'email',    label: 'Email',     Icon: EmailIcon,    env: 'EMAIL_IMAP_HOST',       desc: 'Configure via Add Bot ↑ (uses bot_instances)', allEnvs: ['EMAIL_IMAP_HOST', 'EMAIL_IMAP_USER', 'EMAIL_IMAP_PASS', 'EMAIL_SMTP_HOST'] },
];

export const BOT_PLATFORMS = [
  { key: 'discord',  label: 'Discord',      Icon: DiscordIcon  },
  { key: 'telegram', label: 'Telegram',     Icon: TelegramIcon },
  { key: 'slack',    label: 'Slack',        Icon: SlackIcon    },
  { key: 'whatsapp', label: 'WhatsApp',     Icon: WhatsAppIcon },
  { key: 'matrix',   label: 'Matrix',       Icon: MatrixIcon   },
  { key: 'sms',      label: 'SMS (Twilio)', Icon: SmsIcon      },
  { key: 'email',    label: 'Email',        Icon: EmailIcon    },
] as const;

export const BOT_PLATFORM_MAP: Record<string, typeof BOT_PLATFORMS[number]> =
  Object.fromEntries(BOT_PLATFORMS.map((p) => [p.key, p]));

export const BOT_PLATFORM_OPTIONS = BOT_PLATFORMS.map((p) => ({ value: p.key, label: p.label }));

export const BOT_STATUS_DOT: Record<string, string> = {
  running: 'bg-emerald-500',
  error:   'bg-red-500',
  stopped: 'bg-muted-foreground/30',
};
