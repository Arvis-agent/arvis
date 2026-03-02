export interface Webhook {
  id: number;
  path: string;
  agentId: number;
  promptTemplate: string;
  channelId: string | null;
  platform: string | null;
  secret: string | null;
  enabled: boolean;
  lastTriggered: string | null;
  triggerCount: number;
}
