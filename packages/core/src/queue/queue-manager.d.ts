import type { ArvisDatabase } from '../db/database.js';
import type { QueueJob, QueueStatus, ProcessResult } from './types.js';
/**
 * SQLite-backed job queue with priorities, retries, and concurrency control.
 * All agent work goes through the queue.
 */
export declare class QueueManager {
    private db;
    private running;
    private interval;
    activeJobs: number;
    private onProcess?;
    constructor(db: ArvisDatabase);
    /** Register the job processor */
    setProcessor(fn: (job: QueueJob) => Promise<string>): void;
    /** Add a job to the queue */
    enqueue(job: {
        agentId: number;
        type: QueueJob['type'];
        payload: Record<string, unknown>;
        priority?: number;
    }): number;
    /** Process the next pending job */
    processNext(): Promise<ProcessResult | null>;
    /** Start the processing loop */
    start(intervalMs?: number, concurrency?: number): void;
    /** Stop the processing loop */
    stop(): void;
    /** Get queue status counts */
    getStatus(): QueueStatus;
    /** Get all pending jobs */
    getPending(): QueueJob[];
    /** Get all currently running jobs */
    getRunning(): QueueJob[];
    /** Cancel a specific job */
    cancel(jobId: number): void;
    /** Cancel all pending jobs for an agent */
    cancelByAgent(agentId: number): void;
    /** Get a job by ID */
    getJob(jobId: number): QueueJob | undefined;
    private hydrateJob;
}
//# sourceMappingURL=queue-manager.d.ts.map