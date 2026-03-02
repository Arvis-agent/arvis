export interface QueueJob {
    id: number;
    agentId: number;
    priority: number;
    type: 'message' | 'heartbeat' | 'cron' | 'webhook';
    payload: Record<string, unknown>;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    accountId: number | null;
    result: string | null;
    error: string | null;
    attempts: number;
    maxAttempts: number;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
}
export interface QueueStatus {
    pending: number;
    running: number;
    completed: number;
    failed: number;
}
export interface ProcessResult {
    jobId: number;
    success: boolean;
    result?: string;
    error?: string;
}
//# sourceMappingURL=types.d.ts.map