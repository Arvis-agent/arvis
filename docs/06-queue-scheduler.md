# 06 — Queue & Scheduler
> How jobs are queued, prioritized, retried, and scheduled.

---

## The Job Queue

Every LLM call goes through the queue — including messages, heartbeats, delegations, and webhooks.

```
queue table schema:
  id           — auto-increment
  agent_id     — which agent handles this
  type         — 'message' | 'heartbeat' | 'cron' | 'webhook'
  status       — 'pending' | 'running' | 'completed' | 'failed'
  priority     — 1-10 (10 = highest, processed first)
  payload      — JSON: prompt, systemPrompt, channelId, platform, images, ...
  attempts     — how many times we've tried
  max_attempts — default 3
  result       — final response text (on success)
  error        — error message (on failure)
  retry_after  — timestamp: don't pick up until after this time
  created_at   — when queued
  started_at   — when processing began
  completed_at — when finished
```

### Priority Levels

| Priority | What | When |
|----------|------|------|
| 10 | Heartbeat/cron jobs | Scheduled tasks |
| 5 | Normal user messages | Default |
| 4 | Delegation sub-jobs | When conductor delegates to sub-agent |
| 1 | Low-priority background | Future use |

Highest priority jobs are processed first. If two jobs have the same priority, oldest wins (FIFO).

---

## Processing Flow

```
QueueManager.enqueue(job)
  → INSERT INTO queue (status='pending')
  → setImmediate(() => processNext())   ← fires instantly, no 1s wait

QueueManager.processNext()
  → SELECT * FROM queue WHERE status='pending' AND (retry_after IS NULL OR retry_after < now())
    ORDER BY priority DESC, created_at ASC LIMIT 1
  → If none: return (idle)
  → UPDATE SET status='running', started_at=now, attempts+=1
  → activeJobs++
  → processJob(job)
  → processNext() again (keeps drain loop going)

On success:
  → UPDATE SET status='completed', result=response, completed_at=now
  → activeJobs--
  → processNext()

On error (attempts < max_attempts):
  → backoff = 2^attempts minutes (1 min, 2 min, 4 min)
  → UPDATE SET status='pending', retry_after=now+backoff, error=message
  → Job retries after backoff

On error (attempts >= max_attempts):
  → UPDATE SET status='failed', completed_at=now
  → Shows in /queue page as failed
  → Can retry manually via dashboard
```

---

## Job Recovery On Restart

When Arvis starts, `recoverStuckJobs()` runs:
```sql
SELECT * FROM queue
WHERE status = 'running'
  AND started_at < datetime('now', '-5 minutes')
```
Any job that was "running" for >5 minutes is marked as failed (process likely crashed). These appear in the /queue page and can be retried manually.

This runs once on startup AND every 5 minutes while running.

---

## Live Queue Monitor (Dashboard)

Dashboard → Queue page shows:
- **Running** jobs (highlighted amber) — currently being processed
- **Pending** jobs — waiting to run
- **Failed** jobs — need manual retry

Actions:
- **Retry** — PATCH to reset a failed job back to pending
- **Cancel** — DELETE a pending job from queue
- Auto-refreshes every 3 seconds

---

## The Scheduler

The scheduler manages two types of recurring jobs:

### Heartbeats
Simple interval-based tasks: "Run this prompt every X minutes"

```
heartbeat_configs table:
  agent_id    — which agent runs it
  name        — human label
  schedule    — e.g., 'every 5m', 'every 1h', 'every 1d'
  prompt      — the prompt to send
  channel_id  — where to post the response
  platform    — discord, telegram, etc.
  enabled     — on/off toggle
  last_run_at — when last executed
```

**Example:** "Check BTC price every 5 minutes and post to #prices"

### Cron Jobs
Full cron expression format: run at specific times

```
cron_jobs table:
  agent_id    — which agent runs it
  name        — human label
  cron        — cron expression, e.g. "0 9 * * 1-5" (9am weekdays)
  prompt      — the prompt to send
  channel_id  — where to post
  platform    — discord, telegram, etc.
  enabled     — on/off toggle
  last_run_at — when last executed
```

**Example:** "Every Monday at 9am, write a weekly crypto market summary"

---

## Scheduler Loop

```
Scheduler polls every 10 seconds:
  ↓
For each enabled heartbeat:
  Is it due? (now >= last_run_at + interval)
  → NO: skip
  → YES:
    Flood guard: is there already a pending/running job for this heartbeat?
    → YES: skip (prevents pile-up if processing is slow)
    → NO: enqueue job with priority 10
    UPDATE last_run_at = now

For each enabled cron job:
  Does cron expression match current minute?
  (Parsed with cronstrue/cron-parser)
  → NO: skip
  → YES:
    Flood guard check
    → already queued: skip
    → not queued: enqueue job
    UPDATE last_run_at = now
```

---

## Managing Schedules (Dashboard)

Dashboard → Workflows page:
- Create heartbeat: agent + interval + prompt + channel
- Create cron: agent + cron expression + prompt + channel
- Enable/disable toggle (instant, no restart needed)
- Delete jobs
- See last run time

**Cron presets available:**
- Every 5 minutes
- Every hour
- Daily at midnight
- Weekly on Monday

---

## Queue API

```
GET  /api/queue        — list jobs (filter by status, agent)
PATCH /api/queue/:id   — retry failed job (reset to pending)
DELETE /api/queue/:id  — cancel/remove a job
```
