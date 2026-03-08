export interface Agent {
  id: number;
  slug: string;
  name: string;
  role: string;
  model: string;
  status: string;
  created_by: number | null;
}

export interface Account {
  id: number;
  name: string;
  type: 'cli_subscription' | 'api_key';
  provider: string;
  model: string;
  priority: number;
  status: string;
  base_url: string | null;
  home_dir: string | null;
  rate_limited_until: string | null;
  total_messages: number;
}

export interface BotInstance {
  id: number;
  name: string;
  platform: string;
  token: string;
  extra_config: Record<string, string> | null;
  agent_id: number | null;
  agent_name: string | null;
  enabled: number;
  status: string;
  last_error: string | null;
  created_at: string;
}

export interface WebhookEntry {
  id: number;
  path: string;
  agent_id: number;
  agent_name: string | null;
  prompt_template: string | null;
  secret: string | null;
  enabled: number;
  trigger_count: number;
  last_triggered: string | null;
}

export interface HealthData {
  status: string;
  database: boolean;
  agents: number;
  queue: { pending: number; running: number };
  authEnabled?: boolean;
}
