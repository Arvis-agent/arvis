export interface ScheduledTask {
  id: number;
  agentId: number;
  name: string;
  schedule: string;
  prompt: string;
  channelId: string | null;
  platform: string | null;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  type: 'heartbeat' | 'cron';
}
