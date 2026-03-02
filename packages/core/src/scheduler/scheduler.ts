import CronParser from 'cron-parser';
import type { ArvisDatabase } from '../db/database.js';
import type { QueueManager } from '../queue/queue-manager.js';
import type { HeartbeatConfigRow, CronJobRow } from '../db/schema.js';
import { createLogger } from '../logger.js';

const log = createLogger('scheduler');

/**
 * Runs periodic tasks — heartbeats and user-defined cron jobs.
 * Checks every 60 seconds for due tasks and enqueues them.
 */
export class Scheduler {
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: ArvisDatabase,
    private queue: QueueManager,
  ) {}

  /** Start the scheduler. Uses 10s interval to support sub-minute schedules. */
  start(intervalMs = 10_000): void {
    log.info({ intervalMs }, 'Scheduler started');
    this.tick(); // Run immediately
    this.interval = setInterval(() => this.tick(), intervalMs);
  }

  /** Stop the scheduler */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    log.info('Scheduler stopped');
  }

  /** Check for due tasks and enqueue them */
  tick(): void {
    const now = new Date().toISOString();

    const dueHeartbeats = this.db.all<HeartbeatConfigRow>(
      `SELECT * FROM heartbeat_configs
       WHERE enabled = 1 AND (next_run IS NULL OR next_run <= ?)`,
      now,
    );

    const dueCrons = this.db.all<CronJobRow>(
      `SELECT * FROM cron_jobs
       WHERE enabled = 1 AND (next_run IS NULL OR next_run <= ?)`,
      now,
    );

    for (const task of dueHeartbeats) {
      // Flood guard: skip if a pending/running job already exists for this heartbeat
      const alreadyQueued = this.db.get<{ id: number }>(
        `SELECT id FROM queue WHERE agent_id = ? AND status IN ('pending', 'running')
         AND CAST(json_extract(payload, '$.configId') AS INTEGER) = ? LIMIT 1`,
        task.agent_id, task.id,
      );
      if (alreadyQueued) {
        log.debug({ name: task.name, existingJobId: alreadyQueued.id }, 'Heartbeat skipped — already queued');
        continue;
      }

      this.queue.enqueue({
        agentId: task.agent_id,
        type: 'heartbeat',
        payload: {
          prompt: task.prompt,
          channel: task.channel_id,
          platform: task.platform,
          configId: task.id,
        },
        priority: 10, // Background priority
      });

      const nextRun = this.calculateNextRun(task.schedule);
      this.db.run(
        "UPDATE heartbeat_configs SET last_run = datetime('now'), next_run = ? WHERE id = ?",
        nextRun, task.id,
      );
      log.debug({ name: task.name, nextRun }, 'Heartbeat enqueued');
    }

    for (const task of dueCrons) {
      // Flood guard: skip if a pending/running job already exists for this cron
      const alreadyQueued = this.db.get<{ id: number }>(
        `SELECT id FROM queue WHERE agent_id = ? AND status IN ('pending', 'running')
         AND CAST(json_extract(payload, '$.cronId') AS INTEGER) = ? LIMIT 1`,
        task.agent_id, task.id,
      );
      if (alreadyQueued) {
        log.debug({ name: task.name, existingJobId: alreadyQueued.id }, 'Cron skipped — already queued');
        continue;
      }

      this.queue.enqueue({
        agentId: task.agent_id,
        type: 'cron',
        payload: {
          prompt: task.prompt,
          channel: task.channel_id,
          platform: task.platform,
          cronId: task.id,
        },
        priority: 10,
      });

      const nextRun = this.calculateNextRun(task.schedule);
      this.db.run(
        "UPDATE cron_jobs SET last_run = datetime('now'), next_run = ? WHERE id = ?",
        nextRun, task.id,
      );
      log.debug({ name: task.name, nextRun }, 'Cron job enqueued');
    }

    if (dueHeartbeats.length + dueCrons.length > 0) {
      log.info({
        heartbeats: dueHeartbeats.length,
        crons: dueCrons.length,
      }, 'Scheduled tasks processed');
    }
  }

  /** Calculate the next run time from a cron expression or interval shorthand */
  calculateNextRun(schedule: string): string {
    try {
      // Handle simple interval formats like "every 10s", "every 30s", "every 5m"
      const intervalMatch = schedule.match(/^every\s+(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hours?)$/i);
      if (intervalMatch) {
        const value = parseInt(intervalMatch[1]);
        const unit = intervalMatch[2].charAt(0).toLowerCase();
        let ms = value * 1000; // default seconds
        if (unit === 'm') ms = value * 60_000;
        if (unit === 'h') ms = value * 3_600_000;
        return new Date(Date.now() + ms).toISOString();
      }

      // Handle 6-field cron (with seconds) — extract seconds field and use 5-field for cron-parser
      const fields = schedule.trim().split(/\s+/);
      if (fields.length === 6) {
        // First field is seconds — parse as simple interval
        const secField = fields[0];
        const secMatch = secField.match(/^\*\/(\d+)$/);
        if (secMatch) {
          const seconds = parseInt(secMatch[1]);
          return new Date(Date.now() + seconds * 1000).toISOString();
        }
        // Otherwise try 5-field (drop seconds)
        const fiveField = fields.slice(1).join(' ');
        const interval = CronParser.parseExpression(fiveField);
        return interval.next().toISOString();
      }

      const interval = CronParser.parseExpression(schedule);
      return interval.next().toISOString();
    } catch (err) {
      log.error({ schedule, err }, 'Failed to parse cron expression');
      // Default to 1 hour from now
      return new Date(Date.now() + 3_600_000).toISOString();
    }
  }
}
