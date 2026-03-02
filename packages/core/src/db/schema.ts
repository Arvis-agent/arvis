/** Type-safe row types matching the database schema */

export interface ConfigRow {
  key: string;
  value: string;
  updated_at: string;
}

export interface AccountRow {
  id: number;
  name: string;
  type: 'cli_subscription' | 'api_key';
  home_dir: string | null;
  api_key: string | null;
  model: string;
  status: 'active' | 'rate_limited' | 'disabled';
  rate_limited_until: string | null;
  total_messages: number;
  provider: string;
  base_url: string | null;
  retry_count: number;
  priority: number;
  created_at: string;
}

export interface AgentRow {
  id: number;
  slug: string;
  name: string;
  role: string;
  description: string | null;
  model: string;
  allowed_tools: string | null;
  project_path: string | null;
  system_prompt: string | null;
  personality: string | null;
  config: string | null;
  status: 'active' | 'paused' | 'archived';
  created_by: number | null;
  model_primary: string | null;
  model_fallbacks: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentChannelRow {
  agent_id: number;
  platform: string;
  channel_id: string;
  is_primary: number;
  permissions: 'full' | 'read_only' | 'notify_only';
  created_at: string;
}

export interface ConversationRow {
  id: number;
  agent_id: number;
  platform: string;
  channel_id: string;
  user_id: string | null;
  user_name: string | null;
  status: 'active' | 'compacted' | 'archived';
  total_tokens_estimate: number;
  message_count: number;
  started_at: string;
  last_message_at: string;
  metadata: string | null;
}

export interface MessageRow {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  token_estimate: number;
  attachments: string | null;
  metadata: string | null;
  created_at: string;
}

export interface MemoryFactRow {
  id: number;
  agent_id: number;
  category: string;
  content: string;
  confidence: number;
  source_conversation_id: number | null;
  created_at: string;
  last_accessed: string;
  access_count: number;
}

export interface MemoryStateRow {
  agent_id: number;
  key: string;
  value: string;
  updated_at: string;
}

export interface CompactionRow {
  id: number;
  conversation_id: number;
  agent_id: number;
  summary: string;
  messages_before: number;
  messages_after: number;
  tokens_saved: number;
  created_at: string;
}

export interface HeartbeatConfigRow {
  id: number;
  agent_id: number;
  name: string;
  prompt: string;
  schedule: string;
  channel_id: string | null;
  platform: string | null;
  enabled: number;
  run_condition: string | null;
  last_run: string | null;
  next_run: string | null;
  created_at: string;
}

export interface HeartbeatLogRow {
  id: number;
  config_id: number;
  agent_id: number;
  trigger_type: string;
  prompt: string;
  result: string | null;
  actions_taken: string | null;
  duration_ms: number | null;
  status: 'success' | 'error' | 'skipped';
  created_at: string;
}

export interface CronJobRow {
  id: number;
  agent_id: number;
  name: string;
  description: string | null;
  schedule: string;
  prompt: string;
  channel_id: string | null;
  platform: string | null;
  enabled: number;
  created_by_user: number;
  last_run: string | null;
  next_run: string | null;
  created_at: string;
}

export interface ClientRow {
  id: number;
  name: string;
  slug: string;
  contact_info: string | null;
  plan: 'per_task' | 'monthly' | 'prepaid';
  plan_config: string | null;
  balance: number;
  status: 'active' | string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChargeRow {
  id: number;
  client_id: number;
  agent_id: number | null;
  amount: number;
  type: 'task' | 'subscription' | 'adjustment' | 'payment';
  description: string | null;
  status: 'pending' | 'approved' | 'paid' | 'disputed';
  conversation_id: number | null;
  metadata: string | null;
  created_at: string;
}

export interface WebhookRow {
  id: number;
  path: string;
  agent_id: number;
  prompt_template: string;
  channel_id: string | null;
  platform: string | null;
  secret: string | null;
  enabled: number;
  last_triggered: string | null;
  trigger_count: number;
  created_at: string;
}

export interface SkillRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  file_path: string;
  trigger_patterns: string | null;
  required_tools: string | null;
  category: string | null;
  enabled: number;
  version: string;
  author: string | null;
  install_count: number;
  created_at: string;
}

export interface QueueRow {
  id: number;
  agent_id: number;
  priority: number;
  type: 'message' | 'heartbeat' | 'cron' | 'webhook';
  payload: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  account_id: number | null;
  result: string | null;
  error: string | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface SessionRow {
  id: number;
  agent_id: number;
  account_id: number;
  cli_session_id: string | null;
  status: 'active' | 'expired' | 'compacted';
  messages_in_session: number;
  created_at: string;
  last_used: string;
  expires_at: string | null;
}

export interface UsageLogRow {
  id: number;
  account_id: number;
  agent_id: number | null;
  job_id: number | null;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  duration_ms: number | null;
  created_at: string;
}
