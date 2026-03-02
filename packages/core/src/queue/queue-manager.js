import { createLogger } from '../logger.js';
const log = createLogger('queue');
/**
 * SQLite-backed job queue with priorities, retries, and concurrency control.
 * All agent work goes through the queue.
 */
export class QueueManager {
    db;
    running = false;
    interval = null;
    activeJobs = 0;
    onProcess;
    constructor(db) {
        this.db = db;
    }
    /** Register the job processor */
    setProcessor(fn) {
        this.onProcess = fn;
    }
    /** Add a job to the queue */
    enqueue(job) {
        const result = this.db.run(`INSERT INTO queue (agent_id, type, payload, priority)
       VALUES (?, ?, ?, ?)`, job.agentId, job.type, JSON.stringify(job.payload), job.priority ?? 5);
        const id = Number(result.lastInsertRowid);
        log.debug({ jobId: id, type: job.type, priority: job.priority ?? 5 }, 'Job enqueued');
        return id;
    }
    /** Process the next pending job */
    async processNext() {
        if (!this.onProcess) {
            throw new Error('No processor registered. Call setProcessor() first.');
        }
        // Get highest-priority pending job, skipping jobs with a future retry time
        const row = this.db.get(`SELECT * FROM queue
       WHERE status = 'pending'
         AND (error IS NULL OR error NOT LIKE '{"retryAfter":%' OR json_extract(error, '$.retryAfter') <= datetime('now'))
       ORDER BY priority ASC, created_at ASC
       LIMIT 1`);
        if (!row)
            return null;
        // Mark as running
        this.db.run("UPDATE queue SET status = 'running', started_at = datetime('now'), attempts = attempts + 1 WHERE id = ?", row.id);
        this.activeJobs++;
        const job = this.hydrateJob(row);
        try {
            const result = await this.onProcess(job);
            this.db.run("UPDATE queue SET status = 'completed', result = ?, completed_at = datetime('now') WHERE id = ?", result, row.id);
            log.debug({ jobId: row.id, type: job.type }, 'Job completed');
            return { jobId: row.id, success: true, result };
        }
        catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            const attempts = row.attempts + 1;
            const maxAttempts = row.max_attempts;
            if (attempts >= maxAttempts) {
                this.db.run("UPDATE queue SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?", error, row.id);
                log.error({ jobId: row.id, error, attempts }, 'Job failed permanently');
            }
            else {
                // Retry with exponential backoff: 2^attempts minutes (2min, 4min, 8min)
                const backoffMinutes = Math.pow(2, attempts);
                const retryAfter = new Date(Date.now() + backoffMinutes * 60_000).toISOString();
                const retryError = JSON.stringify({ retryAfter, message: error });
                this.db.run("UPDATE queue SET status = 'pending', error = ? WHERE id = ?", retryError, row.id);
                log.warn({ jobId: row.id, error, attempts, maxAttempts, retryAfter }, 'Job failed, will retry');
            }
            return { jobId: row.id, success: false, error };
        }
        finally {
            this.activeJobs--;
        }
    }
    /** Start the processing loop */
    start(intervalMs = 1000, concurrency = 1) {
        if (this.running)
            return;
        this.running = true;
        log.info({ intervalMs, concurrency }, 'Queue processor started');
        this.interval = setInterval(async () => {
            if (this.activeJobs >= concurrency)
                return;
            try {
                await this.processNext();
            }
            catch (err) {
                log.error({ err }, 'Queue processing error');
            }
        }, intervalMs);
    }
    /** Stop the processing loop */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.running = false;
        log.info('Queue processor stopped');
    }
    /** Get queue status counts */
    getStatus() {
        const counts = this.db.get(`SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM queue`);
        return {
            pending: counts?.pending ?? 0,
            running: counts?.running ?? 0,
            completed: counts?.completed ?? 0,
            failed: counts?.failed ?? 0,
        };
    }
    /** Get all pending jobs */
    getPending() {
        const rows = this.db.all("SELECT * FROM queue WHERE status = 'pending' ORDER BY priority ASC, created_at ASC");
        return rows.map(r => this.hydrateJob(r));
    }
    /** Get all currently running jobs */
    getRunning() {
        const rows = this.db.all("SELECT * FROM queue WHERE status = 'running' ORDER BY started_at ASC");
        return rows.map(r => this.hydrateJob(r));
    }
    /** Cancel a specific job */
    cancel(jobId) {
        this.db.run("UPDATE queue SET status = 'cancelled' WHERE id = ? AND status = 'pending'", jobId);
    }
    /** Cancel all pending jobs for an agent */
    cancelByAgent(agentId) {
        this.db.run("UPDATE queue SET status = 'cancelled' WHERE agent_id = ? AND status = 'pending'", agentId);
    }
    /** Get a job by ID */
    getJob(jobId) {
        const row = this.db.get('SELECT * FROM queue WHERE id = ?', jobId);
        return row ? this.hydrateJob(row) : undefined;
    }
    hydrateJob(row) {
        return {
            id: row.id,
            agentId: row.agent_id,
            priority: row.priority,
            type: row.type,
            payload: JSON.parse(row.payload),
            status: row.status,
            accountId: row.account_id,
            result: row.result,
            error: row.error,
            attempts: row.attempts,
            maxAttempts: row.max_attempts,
            createdAt: row.created_at,
            startedAt: row.started_at,
            completedAt: row.completed_at,
        };
    }
}
//# sourceMappingURL=queue-manager.js.map