import type { ArvisDatabase } from '../db/database.js';
import type { QueueManager } from '../queue/queue-manager.js';
/**
 * Runs periodic tasks — heartbeats and user-defined cron jobs.
 * Checks every 60 seconds for due tasks and enqueues them.
 */
export declare class Scheduler {
    private db;
    private queue;
    private interval;
    constructor(db: ArvisDatabase, queue: QueueManager);
    /** Start the scheduler. Uses 10s interval to support sub-minute schedules. */
    start(intervalMs?: number): void;
    /** Stop the scheduler */
    stop(): void;
    /** Check for due tasks and enqueue them */
    tick(): void;
    /** Calculate the next run time from a cron expression or interval shorthand */
    calculateNextRun(schedule: string): string;
}
//# sourceMappingURL=scheduler.d.ts.map