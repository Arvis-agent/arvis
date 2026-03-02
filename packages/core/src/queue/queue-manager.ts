import type { ArvisDatabase } from '../db/database.js';
import type { QueueRow } from '../db/schema.js';
import type { QueueJob, QueueStatus, ProcessResult } from './types.js';
import { createLogger } from '../logger.js';

const log = createLogger('queue');

/**
 * SQLite-backed job queue with priorities, retries, and concurrency control.
 * All agent work goes through the queue.
 */
export class QueueManager {
  private running = false;
  private interval: ReturnType<typeof setInterval> | null = null;
  private recoveryInterval: ReturnType<typeof setInterval> | null = null;
  private concurrency = 1;
  activeJobs = 0;
  private onProcess?: (job: QueueJob) => Promise<string>;

  constructor(private db: ArvisDatabase) {}

  /** Register the job processor */
  setProcessor(fn: (job: QueueJob) => Promise<string>): void {
    this.onProcess = fn;
  }

  /** Add a job to the queue */
  enqueue(job: {
    agentId: number;
    type: QueueJob['type'];
    payload: Record<string, unknown>;
    priority?: number;
  }): number {
    const result = this.db.run(
      `INSERT INTO queue (agent_id, type, payload, priority)
       VALUES (?, ?, ?, ?)`,
      job.agentId,
      job.type,
      JSON.stringify(job.payload),
      job.priority ?? 5,
    );

    const id = Number(result.lastInsertRowid);
    log.debug({ jobId: id, type: job.type, priority: job.priority ?? 5 }, 'Job enqueued');

    // Immediately kick off processing instead of waiting for the next poll tick
    if (this.running && this.activeJobs < this.concurrency) {
      setImmediate(() => this.processNext().catch(() => { /* handled inside processNext */ }));
    }

    return id;
  }

  /** Process the next pending job */
  async processNext(): Promise<ProcessResult | null> {
    if (!this.onProcess) {
      throw new Error('No processor registered. Call setProcessor() first.');
    }

    // Get highest-priority pending job, skipping jobs with a future retry time
    const row = this.db.get<QueueRow>(
      `SELECT * FROM queue
       WHERE status = 'pending'
         AND (error IS NULL OR error NOT LIKE '{"retryAfter":%' OR json_extract(error, '$.retryAfter') <= datetime('now'))
       ORDER BY priority ASC, created_at ASC
       LIMIT 1`,
    );

    if (!row) return null;

    // Mark as running
    this.db.run(
      "UPDATE queue SET status = 'running', started_at = datetime('now'), attempts = attempts + 1 WHERE id = ?",
      row.id,
    );
    this.activeJobs++;

    const job = this.hydrateJob(row);

    try {
      const result = await this.onProcess(job);

      this.db.run(
        "UPDATE queue SET status = 'completed', result = ?, completed_at = datetime('now') WHERE id = ?",
        result, row.id,
      );

      log.debug({ jobId: row.id, type: job.type }, 'Job completed');
      return { jobId: row.id, success: true, result };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      const attempts = row.attempts + 1;
      const maxAttempts = row.max_attempts;

      if (attempts >= maxAttempts) {
        this.db.run(
          "UPDATE queue SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?",
          error, row.id,
        );
        log.error({ jobId: row.id, error, attempts }, 'Job failed permanently');
      } else {
        // Retry with exponential backoff: 2^attempts minutes (2min, 4min, 8min)
        const backoffMinutes = Math.pow(2, attempts);
        const retryAfter = new Date(Date.now() + backoffMinutes * 60_000).toISOString();
        const retryError = JSON.stringify({ retryAfter, message: error });
        this.db.run(
          "UPDATE queue SET status = 'pending', error = ? WHERE id = ?",
          retryError, row.id,
        );
        log.warn({ jobId: row.id, error, attempts, maxAttempts, retryAfter }, 'Job failed, will retry');
      }

      return { jobId: row.id, success: false, error };
    } finally {
      this.activeJobs--;
    }
  }

  /**
   * Mark jobs stuck in 'running' for more than 5 minutes as failed.
   * Guards against process crashes that leave jobs orphaned in running state.
   */
  recoverStuckJobs(): void {
    const result = this.db.run(
      `UPDATE queue
       SET status = 'failed',
           error = 'Job timed out — process likely crashed',
           completed_at = datetime('now')
       WHERE status = 'running'
         AND started_at < datetime('now', '-5 minutes')`,
    );
    const recovered = result.changes ?? 0;
    if (recovered > 0) {
      log.warn({ recovered }, 'Recovered stuck jobs');
    }
  }

  /** Start the processing loop */
  start(intervalMs = 1000, concurrency = 1): void {
    if (this.running) return;
    this.running = true;
    this.concurrency = concurrency;

    log.info({ intervalMs, concurrency }, 'Queue processor started');

    // Recover any jobs stuck in 'running' from a previous crashed process
    this.recoverStuckJobs();

    // Run recovery check every 5 minutes
    const recoveryInterval = setInterval(() => {
      this.recoverStuckJobs();
    }, 5 * 60_000);

    this.interval = setInterval(async () => {
      if (this.activeJobs >= concurrency) return;

      try {
        await this.processNext();
      } catch (err) {
        log.error({ err }, 'Queue processing error');
      }
    }, intervalMs);

    this.recoveryInterval = recoveryInterval;
  }

  /** Stop the processing loop */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
      this.recoveryInterval = null;
    }
    this.running = false;
    log.info('Queue processor stopped');
  }

  /** Get queue status counts */
  getStatus(): QueueStatus {
    const counts = this.db.get<{
      pending: number;
      running: number;
      completed: number;
      failed: number;
    }>(
      `SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
       FROM queue`,
    );

    return {
      pending: counts?.pending ?? 0,
      running: counts?.running ?? 0,
      completed: counts?.completed ?? 0,
      failed: counts?.failed ?? 0,
    };
  }

  /** Get all pending jobs */
  getPending(): QueueJob[] {
    const rows = this.db.all<QueueRow>(
      "SELECT * FROM queue WHERE status = 'pending' ORDER BY priority ASC, created_at ASC",
    );
    return rows.map(r => this.hydrateJob(r));
  }

  /** Get all currently running jobs */
  getRunning(): QueueJob[] {
    const rows = this.db.all<QueueRow>(
      "SELECT * FROM queue WHERE status = 'running' ORDER BY started_at ASC",
    );
    return rows.map(r => this.hydrateJob(r));
  }

  /** Cancel a specific job */
  cancel(jobId: number): void {
    this.db.run("UPDATE queue SET status = 'cancelled' WHERE id = ? AND status = 'pending'", jobId);
  }

  /** Cancel all pending jobs for an agent */
  cancelByAgent(agentId: number): void {
    this.db.run("UPDATE queue SET status = 'cancelled' WHERE agent_id = ? AND status = 'pending'", agentId);
  }

  /** Get a job by ID */
  getJob(jobId: number): QueueJob | undefined {
    const row = this.db.get<QueueRow>('SELECT * FROM queue WHERE id = ?', jobId);
    return row ? this.hydrateJob(row) : undefined;
  }

  private hydrateJob(row: QueueRow): QueueJob {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(row.payload);
    } catch {
      log.error({ jobId: row.id, raw: row.payload }, 'Corrupt job payload — using empty object');
      payload = {};
    }
    return {
      id: row.id,
      agentId: row.agent_id,
      priority: row.priority,
      type: row.type,
      payload,
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
