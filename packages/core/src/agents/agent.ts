export type AgentRole = 'conductor' | 'developer' | 'client_manager' | 'devops' | 'writer' | 'custom';

export interface AgentPersonality {
  voice: 'casual' | 'professional' | 'technical' | 'friendly';
  quirks?: string[];
  greeting_style?: string;
  signoff_style?: string;
  emoji_level: 'none' | 'minimal' | 'moderate';
}

export interface ChannelBinding {
  platform: string;
  channelId: string;
  isPrimary: boolean;
  permissions: 'full' | 'read_only' | 'notify_only';
}

export interface AgentConfig {
  slug: string;
  name: string;
  role: AgentRole;
  description?: string;
  model?: string;
  modelPrimary?: string;
  modelFallbacks?: string[];
  allowedTools?: string[];
  projectPath?: string;
  systemPrompt?: string;
  personality?: AgentPersonality;
  channels?: ChannelBinding[];
}

/**
 * Represents a loaded agent with its full configuration.
 */
export interface Agent {
  id: number;
  slug: string;
  name: string;
  role: AgentRole;
  description: string | null;
  model: string;
  modelPrimary: string | null;
  modelFallbacks: string[];
  allowedTools: string[];
  projectPath: string | null;
  systemPrompt: string | null;
  personality: AgentPersonality | null;
  config: Record<string, unknown> | null;
  status: 'active' | 'paused' | 'archived';
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  channels: ChannelBinding[];
}
