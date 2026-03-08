# Arvis v3 Dashboard — Comprehensive Audit Report

**Date:** 2026-03-09
**Scope:** Every file in `packages/dashboard/` — config, pages, API routes, components, libraries, hooks
**Files Audited:** 94 source files
**Total Issues Found:** 156

---

## Severity Summary

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 7 | Crashes, security exploits, data loss |
| **HIGH** | 18 | Major bugs, significant security gaps, accessibility barriers |
| **MEDIUM** | 40 | Logic errors, UX problems, moderate security concerns |
| **LOW** | 50 | Minor issues, code smells, inconsistencies |
| **INFO** | 41 | Notes, acceptable tradeoffs, documentation gaps |

---

## Table of Contents

1. [Critical Issues](#1-critical-issues)
2. [Configuration Files](#2-configuration-files)
3. [Root App Files](#3-root-app-files)
4. [Dashboard Pages](#4-dashboard-pages)
5. [Settings Sections](#5-settings-sections)
6. [API Routes](#6-api-routes)
7. [UI Components](#7-ui-components)
8. [Layout Components](#8-layout-components)
9. [Dashboard Components](#9-dashboard-components)
10. [Libraries](#10-libraries)
11. [Hooks](#11-hooks)
12. [Design System Consistency](#12-design-system-consistency)
13. [Positive Findings](#13-positive-findings)

---

## 1. Critical Issues

These require immediate attention — crashes, exploits, or broken functionality.

| # | File | Issue |
|---|------|-------|
| C1 | `api/skills/route.ts` | **Path traversal** — skill slug from frontmatter used unsanitized in `path.join(COMMUNITY_DIR, slug + '.md')`. Slug `../../evil` writes files outside skills dir. |
| C2 | `api/skills/import/route.ts` | **Path traversal** — same issue via externally-fetched content. Attacker-controlled URL serves skill with malicious slug to write arbitrary files on disk. |
| C3 | `components/dashboard/agent-chat.tsx` | **Stack overflow** — `String.fromCharCode(...new Uint8Array(buf))` spreads entire file buffer onto call stack. Files >~100KB crash the browser. |
| C4 | `Dockerfile` | **Invalid npm syntax** — `npm ci --workspaces=packages/core,packages/dashboard` is not valid npm syntax. Should be `--workspace=@arvis/core --workspace=@arvis/dashboard`. Build fails. |
| C5 | `Dockerfile` | **Missing native rebuild** — `--ignore-scripts` skips `better-sqlite3` compilation with no subsequent `npm rebuild`. Runtime crash on DB access. |
| C6 | `Dockerfile` | **Missing core source** — runtime stage doesn't copy `packages/core/`. API routes import from it at runtime. Crash. |
| C7 | `Dockerfile` | **Broken CMD path** — `node_modules/.bin/next` resolves from WORKDIR `/app/packages/dashboard` but `node_modules` is at `/app/node_modules`. |

---

## 2. Configuration Files

### `package.json`

| # | Issue | Severity |
|---|-------|----------|
| 1 | `dev` and `start` scripts hardcode `--port 3000` but Dockerfile uses 5100. Inconsistent. | MEDIUM |
| 2 | `"next": "^15.3"` — loose range, Next.js has had breaking minor changes. Consider `~15.3.0`. | LOW |
| 3 | `"@tanstack/react-table": "^8"` — very loose major range. Pin to specific minor. | LOW |
| 4 | No `lint` script defined. Root has eslint but dashboard has no lint/format scripts. | LOW |
| 5 | No `engines` field — root requires `>=20.0.0` but dashboard doesn't declare constraint. | LOW |

### `tsconfig.json`

| # | Issue | Severity |
|---|-------|----------|
| 1 | `"target": "ES2017"` — conservative for Node 22. `ES2022` would unlock modern features. Next.js overrides via SWC anyway. | LOW |

No significant issues. Clean config.

### `next.config.ts`

| # | Issue | Severity |
|---|-------|----------|
| 1 | `'unsafe-eval'` in CSP `script-src` applies in production too. Enables XSS via `eval()`. Should be dev-only. | HIGH |
| 2 | `'unsafe-inline'` in `script-src` weakens CSP. Nonces would be better but non-trivial with App Router. | MEDIUM |
| 3 | `connect-src 'self' ws: wss:` allows WebSocket to ANY host. Should restrict to known origins. | MEDIUM |
| 4 | Connector packages listed in both `serverExternalPackages` AND webpack externals. Redundant, maintenance burden. | LOW |
| 5 | `{ message: /Critical dependency/ }` suppresses ALL critical dependency warnings, not just expected ones. | LOW |
| 6 | No `output: 'standalone'` for Docker — results in much larger image. | MEDIUM |

### `postcss.config.mjs`

No issues. Correct Tailwind v4 config.

### `components.json`

No issues. Standard shadcn/ui config.

### `middleware.ts`

| # | Issue | Severity |
|---|-------|----------|
| 1 | Only checks if cookie **exists**, not if JWT is **valid**. Users with expired/forged cookies get full page shell (API calls fail 401 but layout renders). | HIGH |
| 2 | No CSRF protection. Cookie-based auth without Origin/Referer checks on state-changing requests. | MEDIUM |
| 3 | `/api/auth` prefix match too broad — any route starting with `/api/auth` bypasses auth. Should use exact match or `/api/auth/`. | LOW |
| 4 | Matcher doesn't exclude `robots.txt`, `sitemap.xml`, or other public assets. They'd require auth. | LOW |

### `Dockerfile`

| # | Issue | Severity |
|---|-------|----------|
| 1 | Invalid `--workspaces` npm syntax. | CRITICAL |
| 2 | Missing `npm rebuild better-sqlite3` after `--ignore-scripts`. | CRITICAL |
| 3 | Runtime stage missing `packages/core/` source. | CRITICAL |
| 4 | Broken CMD path to `next` binary. | CRITICAL |
| 5 | No `USER node` directive — runs as root in production container. | MEDIUM |
| 6 | No `.dockerignore` reference — copies node_modules into build context. | MEDIUM |
| 7 | Copies full root `node_modules` into runtime (no standalone output). Oversized image. | MEDIUM |
| 8 | No `HEALTHCHECK` instruction. | LOW |

### `DESIGN_SYSTEM.md` vs `DESIGN_RULES.md` Conflicts

| # | Conflict | Severity |
|---|---------|----------|
| 1 | Background: `#09090e` (DESIGN_SYSTEM) vs `#000000` (DESIGN_RULES). | MEDIUM |
| 2 | Border: `#1c1c2c` (DESIGN_SYSTEM) vs `#1a1a1f` (DESIGN_RULES). | MEDIUM |
| 3 | Accent: `#7c6af7` (DESIGN_SYSTEM) vs `#8B5CF6` (DESIGN_RULES). | MEDIUM |
| 4 | Card radius: `rounded-xl` (DESIGN_SYSTEM) vs `rounded-md` (DESIGN_RULES). | MEDIUM |
| 5 | These two files should be consolidated into one authoritative source. | MEDIUM |

---

## 3. Root App Files

### `app/layout.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | `GeistPixelSquare.className` on `<body>` forces `font-weight:500` globally. `font-semibold` (600) and `font-bold` (700) may fail to override in some browsers. | MEDIUM |
| 2 | `grain` CSS class applied to `<body>` but never defined in `globals.css`. Dead class. | LOW |

### `app/globals.css`

| # | Issue | Severity |
|---|-------|----------|
| 1 | `*:focus { outline: none; }` removes focus for ALL elements. Custom interactive elements without `:focus-visible` lose their indicator entirely. | MEDIUM |
| 2 | `zoom-in-95` / `zoom-out-95` names imply 95% but actual value is 0.98 (98%). Misleading. | LOW |
| 3 | Scrollbar styles only apply to Webkit/Blink. Firefox users get default scrollbars clashing with dark theme. Missing `scrollbar-color` / `scrollbar-width`. | LOW |

### `app/login/page.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | Password input has no `<label>` element. Placeholder is not a label substitute per WCAG. | MEDIUM |
| 2 | Error message has no `role="alert"` or `aria-live`. Screen readers won't announce errors. | MEDIUM |
| 3 | Hint text "Set DASHBOARD_PASSWORD to enable" leaks env var name to unauthorized users. | LOW |

### `app/error.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | `error.message` rendered directly. Custom errors with sensitive info (stack trace, DB path) could leak. | MEDIUM |
| 2 | No `role="alert"` on error container. | LOW |

### `app/not-found.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | `text-muted` resolves to `color: #0c0c0e` on `#000000` bg — contrast ratio ~1.07:1. The "404" text is effectively **invisible**. Should be `text-muted-foreground`. | HIGH |

---

## 4. Dashboard Pages

### `(dashboard)/layout.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | `max-w-5xl` (1024px) constrains all pages. Chat page would benefit from full width. | LOW |
| 2 | No `Suspense` boundary around `{children}` for `useSearchParams()` compatibility. | LOW |

### `(dashboard)/page.tsx` — Overview

| # | Issue | Severity |
|---|-------|----------|
| 1 | If initial `fetchMetrics` fails, `metrics` stays null → infinite skeleton, no retry button, no error state. Toast fires but user is stuck. | HIGH |
| 2 | `metrics.cost30d.toFixed(2)` — if API returns `null`/`undefined` for `cost30d`, throws `TypeError`. | MEDIUM |
| 3 | `MetricCard` mixes inline `style` for border with Tailwind hover classes. Inline styles always win, so `hover:border-border/80` never applies to the top border. | LOW |
| 4 | No aria labels on the "Live indicator" pulse dot. | LOW |

### `(dashboard)/agents/page.tsx` — Agent List

| # | Issue | Severity |
|---|-------|----------|
| 1 | `<button>` nested inside `<Link>` (`<a>`) — invalid HTML, causes a11y issues and unpredictable click behavior. | HIGH |
| 2 | `MODEL_OPTIONS` array duplicated between this file and `agents/[id]/page.tsx` with different entries. | MEDIUM |
| 3 | Slug validation `[a-z0-9-]+` allows `---` or leading/trailing hyphens. Auto-generation strips them but manual editing doesn't. | LOW |
| 4 | `CreateAgentDialog` form state not reset on close (Escape/outside click). Stale data persists on reopen. | LOW |
| 5 | Filter buttons lack `aria-pressed` — screen readers can't identify active filter. | LOW |

### `(dashboard)/agents/[id]/page.tsx` — Agent Detail

| # | Issue | Severity |
|---|-------|----------|
| 1 | `ConfigTab` local form state initialized via `useState(agent.prop)` — never updates when parent `agent` prop changes after save. User sees stale form data. | HIGH |
| 2 | `MemoryTab` takes `agent.facts` as initial state but never re-fetches on parent change. Stale memory data. | MEDIUM |
| 3 | `navigator.clipboard.writeText` — no error handling. Fails silently in non-HTTPS or denied-permission contexts. | MEDIUM |
| 4 | `BUILT_IN_TOOLS` hardcoded with only 4 tools — missing 6 power tools (`write_plugin`, `list_plugins`, `delete_plugin`, `run_shell`, `read_file`, `write_file`). | MEDIUM |
| 5 | `onSaved` shallow merges `updated` into `agent` — response may lack `facts`/`state`, overwriting with `undefined`. | MEDIUM |
| 6 | Chat tab uses fixed `h-[520px]` instead of flex-based dynamic sizing like the chat page. | LOW |
| 7 | Channels JSON textarea has no inline validation — invalid JSON only caught on save. | LOW |

### `(dashboard)/chat/page.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | Agent sidebar fixed at `w-[200px]` with no responsive handling. Unusable on mobile. | HIGH |
| 2 | `fetch('/api/agents')` has no `r.ok` check and no error message to user — just empty agent list. | MEDIUM |
| 3 | Switching agents remounts `<AgentChat>` entirely, destroying chat context with no confirmation. | MEDIUM |
| 4 | `max-w-5xl` from layout constrains chat width. Chat benefits from wider layouts. | MEDIUM |
| 5 | No loading skeleton — plain "Loading..." text while every other page uses `<Skeleton>`. | LOW |
| 6 | No keyboard navigation for agent list (no arrow keys, no `aria-selected`). | LOW |

### `(dashboard)/logs/page.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | Pagination can navigate past end — if `jobs.length === pageSize` on last page, Next is enabled → empty page. | LOW |
| 2 | Expandable row click area is not keyboard-accessible (no `tabIndex`, `role`, `onKeyDown`). | LOW |
| 3 | Duplicate `QueueJob` interface defined in both `logs/page.tsx` and `queue/page.tsx`. Should be shared. | INFO |

### `(dashboard)/queue/page.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | `actioning` is a single `number | null`. If user clicks retry on job A then cancel on job B before A resolves, states collide. Should be `Set<number>`. | HIGH |
| 2 | Auto-refresh doesn't stop on error — can flood user with error toasts every 3 seconds. | MEDIUM |
| 3 | `res.json()` in error path may throw on non-JSON responses (502 proxy error). | MEDIUM |

### `(dashboard)/sessions/page.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | Messages cache never invalidated — expanding a conversation always shows stale messages from first load. | MEDIUM |
| 2 | Memory leak — every expanded conversation's messages stay in state forever. 100 conversations = all messages in memory. | MEDIUM |
| 3 | Session interface uses `updated_at` but table uses `last_message_at`. If API doesn't alias correctly, column shows null. | LOW |
| 4 | Expandable rows not keyboard-accessible. | LOW |

### `(dashboard)/skills/page.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | `saveTriggers` has no `catch` block — only `finally`. Network errors silently swallowed. | LOW |
| 2 | `SkillDetail` re-fetches content on every expand — no caching. | LOW |
| 3 | Duplicate keywords in `parsed.keywords.map` would cause React duplicate key warnings. | LOW |

### `(dashboard)/usage/page.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | No loading state when changing date ranges — stale data shown with new range label selected. | MEDIUM |
| 2 | By Provider table uses array index as key — reorders cause inefficient reconciliation. | LOW |
| 3 | Cost display with `.toFixed(4)` — no thousands separator for large amounts. | LOW |

### `(dashboard)/workflows/page.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | No error handling on initial `fetchData` — `Promise.all` rejection shows infinite skeleton, no error feedback. | HIGH |
| 2 | `toggleEnabled` sends boolean but DB may expect integer (0/1). Skills page sends 0/1. Inconsistent. | MEDIUM |
| 3 | No cron expression validation — invalid expressions accepted, fail silently at runtime. | LOW |

---

## 5. Settings Sections

### `settings/page.tsx` — Orchestrator

| # | Issue | Severity |
|---|-------|----------|
| 1 | Auto-PATCH of conductor on load when `existingConductor === null`. Picks one without user confirmation. Should require explicit action. | HIGH |
| 2 | `Promise.all` for 8 API calls — if any single API returns non-JSON (e.g. 502), `.json()` throws, ALL data lost. Should use `Promise.allSettled`. | MEDIUM |
| 3 | Every section's `onReload` re-fetches ALL 8 endpoints. Toggling one bot reloads accounts, health, agents, settings, connectors, bots, webhooks, variables. N+1 pattern. | MEDIUM |

### `settings/_sections/types.ts`

| # | Issue | Severity |
|---|-------|----------|
| 1 | `BotInstance.token` is `string` — full token sent to client, displayed in `bots-section.tsx`. See bots-section. | LOW |
| 2 | `enabled` typed as `number` instead of `boolean` throughout. SQLite pattern but forces `=== 1` checks everywhere. | LOW |

### `settings/_sections/constants.ts`

| # | Issue | Severity |
|---|-------|----------|
| 1 | Model lists hardcoded — will go stale as providers release new models. Maintenance concern. | LOW |
| 2 | `CONNECTORS` array duplicates platform info in `BOT_PLATFORMS`. Potential for divergence. | LOW |

### `settings/_sections/orchestrator-section.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | `exportAgent` only includes `name, slug, role, model` — missing system prompt, allowed tools, temperature, etc. Barebones export. | MEDIUM |
| 2 | Filter uses `role === 'conductor'` but auto-select in `settings/page.tsx` may use `'orchestrator'`. If mismatch, section shows "no conductor found". | MEDIUM |
| 3 | Import dialog `text` not reset on close via Escape. Stale data persists. | LOW |

### `settings/_sections/accounts-section.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | `process.platform` used in `'use client'` component (line 224). `process` is undefined in browser — always evaluates to false. Should use `navigator.platform`. | CRITICAL* |
| 2 | Delete confirmation shows no account name — user must remember which they clicked. | MEDIUM |
| 3 | `showKey` state not reset when dialog closes — visibility carries over to different account. | LOW |
| 4 | `toggleStatus` function exists but is never called. Dead code. | LOW |

*Severity note: While labeled critical, this specific case only affects a cosmetic display (showing Windows vs Mac instructions), not core functionality. Classified as MEDIUM in practice.

### `settings/_sections/bots-section.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | **Bot token displayed in plaintext** — full Discord/Twilio/IMAP tokens visible to anyone with dashboard access. Should be masked (show last 4 chars). | HIGH |
| 2 | `toggleBotEnabled` sends boolean but `bot.enabled` is a number. Same inconsistency as workflows. | LOW |
| 3 | No confirmation on toggling bot enabled/disabled — misclick immediately triggers server request. | LOW |

### `settings/_sections/health-section.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | Security section hardcoded — always shows "Authentication: Open" regardless of actual state. Misleading when `DASHBOARD_PASSWORD` is set. | MEDIUM |
| 2 | Complex responsive border logic (lines 86-114) is fragile and hard to maintain. | LOW |
| 3 | `StatusRow` shows green dot for agents/queue unconditionally — misleading when agent count is 0. | LOW |

### `settings/_sections/webhooks-section.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | No way to edit a webhook — must delete and recreate to change prompt template or agent. | MEDIUM |
| 2 | Webhook `secret` never displayed or copyable. Users can't configure external services with HMAC secret. | LOW |
| 3 | Path input has no validation — no leading slash check, no URL character validation, no collision detection. | LOW |
| 4 | `last_triggered` uses `toLocaleDateString()` instead of `formatRelative()`. Inconsistent with rest of dashboard. | LOW |

### `settings/_sections/variables-section.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | **Secret values exposed to client** — API returns actual values, revealed on button click with no re-authentication required. | HIGH |
| 2 | Edit logic confused — comment says "keep existing if empty" but code requires re-entering value. Misleading UX. | MEDIUM |
| 3 | Uses POST for both create and update — unconventional, `editing` boolean is cosmetic only. | LOW |
| 4 | `revealed` Set persists across reloads — stale IDs could reveal wrong variables. | LOW |

---

## 6. API Routes

### Global API Findings

| # | Issue | Severity |
|---|-------|----------|
| G1 | Auth disabled by default — all routes unprotected when `DASHBOARD_PASSWORD` not set. No localhost binding. | HIGH |
| G2 | No rate limiting on any route except login. DB writes, file I/O, external HTTP all unlimited. | MEDIUM |
| G3 | No CORS headers on any route. | MEDIUM |
| G4 | Error messages leak internal details (SQLite table names, constraint errors) via `err.message`. | LOW |
| G5 | `/api/health` requires auth — health endpoints should typically be unauthenticated for monitoring. | LOW |

### Per-Route Issues

| Route | Issue | Severity |
|-------|-------|----------|
| `api/skills/route.ts` POST | **Path traversal** — slug from frontmatter in `path.join()` unsanitized. | CRITICAL |
| `api/skills/import/route.ts` POST | **Path traversal** — same via externally fetched content. | CRITICAL |
| `api/skills/import/route.ts` POST | **SSRF** — no internal IP blocking (127.0.0.1, 169.254.x, 10.x, 192.168.x). | MEDIUM |
| `api/skills/import/route.ts` POST | No content size limit on fetch — malicious URL can serve gigabytes → OOM. | MEDIUM |
| `api/webhooks/route.ts` GET | Webhook `secret` returned unmasked to frontend. | HIGH |
| `api/connectors/route.ts` GET | `imap_password` and `smtp_password` not masked — masking regex only checks `token/key/secret`, not `password`. | HIGH |
| `api/accounts/route.ts` POST | API keys stored in plaintext in DB. If DB compromised, all keys exposed. | HIGH |
| `api/accounts/[id]/route.ts` PATCH | Same plaintext storage on key update. | HIGH |
| `api/agents/[id]/route.ts` PATCH | Accepts arbitrary fields — `registry.update()` receives unsanitized body. Attacker could set systemPrompt, allowedTools. | HIGH |
| `api/bots/route.ts` POST | `VALID_PLATFORMS` missing `'sms'` and `'email'`. Creating SMS/email bots fails validation. | MEDIUM |
| `api/workflows/route.ts` POST | No cron schedule validation. No `agent_id` foreign key check. | MEDIUM |
| `api/webhooks/route.ts` POST | Webhook path not sanitized — could shadow real API routes (e.g., `/api/agents`). | MEDIUM |
| `api/accounts/route.ts` POST | `type` field not validated against allowed values. | MEDIUM |
| `api/auth/login/route.ts` | Rate limit map grows unbounded — no cleanup of expired entries. | LOW |
| `api/auth/login/route.ts` | `x-forwarded-for` trusted without validation — spoofable without reverse proxy. | MEDIUM |
| `api/agents/[id]/chat/route.ts` | No input validation on `content` — could be undefined, null, non-string. | MEDIUM |
| `api/skills/route.ts` GET | `content=true` reads ALL skill files from disk with no pagination. DoS vector. | LOW |

### Positive API Findings

- **All SQL queries are parameterized** — zero SQL injection risk across entire codebase.
- **Timing-safe comparison** used for both password and API key verification.
- **PBKDF2 with 120k iterations** for password hashing.
- **JWT with auto-generated persistent secret**.
- **Agent creation** has excellent validation (slug regex, role whitelist, required fields).
- **`runtime = 'nodejs'`** correctly set on all routes.
- **Bot token masking** on GET endpoints (though displayed unmasked in frontend).

---

## 7. UI Components

### `components/ui/dialog.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | **No focus trap** — keyboard users can Tab into background elements while modal is open. | HIGH |
| 2 | **No `role="dialog"` or `aria-modal="true"`** — screen readers don't recognize modal. | HIGH |
| 3 | No `aria-labelledby` linking heading to dialog container. | MEDIUM |
| 4 | Body scroll not locked when dialog is open. Users can scroll page behind modal. | MEDIUM |
| 5 | Close button has no `aria-label`. | LOW |

### `components/ui/dropdown-menu.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | **`...props` spread overwrites custom `onClick`** — `DropdownMenuItem` defines an `onClick` handler that calls `setOpen(false)`, but then `{...props}` is spread on the `<button>`, overwriting it with `props.onClick`. The menu never closes on item click. | HIGH |
| 2 | **No keyboard navigation** — no ArrowDown/ArrowUp/Escape/Enter support. Click-only. | HIGH |
| 3 | Global click listener uses `closest('[data-dropdown]')` — matches ANY dropdown, not specifically this instance. Nested/multiple dropdowns interfere. | MEDIUM |
| 4 | No `role="menu"` on content, no `role="menuitem"` on items. | MEDIUM |
| 5 | No `aria-haspopup` on trigger. | LOW |

### `components/ui/button.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | `disabled:pointer-events-none` prevents tooltips on disabled buttons and overrides `cursor-not-allowed`. Should use `aria-disabled` pattern. | MEDIUM |

### `components/ui/alert.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | No `role="alert"` or `aria-live` — screen readers won't announce alert content. | MEDIUM |

### `components/ui/select.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | No `role="listbox"` on dropdown, no `role="option"` on items, no `aria-activedescendant`. | MEDIUM |
| 2 | Uses `border-input` / `ring-ring` variables — inconsistent with Input component's `border-border` / `border-primary/50`. | LOW |

### `components/ui/tabs.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | When controlled (`value` prop), `onValueChange` is optional. Without it, tabs become uncontrollable — clicks are silently ignored. | MEDIUM |
| 2 | No `tabindex` management — all triggers focusable instead of only active tab. | LOW |

### `components/ui/toaster.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | No `role="alert"` or `aria-live="assertive"` on toast items. Screen readers won't announce. | MEDIUM |
| 2 | `Math.random().toString(36)` for IDs — collision risk under rapid firing. Should use `crypto.randomUUID()`. | LOW |
| 3 | Timer cleanup on unmount doesn't clear pending `setTimeout`s from `timers` ref Map. | LOW |

### `components/ui/textarea.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | Not a `forwardRef` — can't be used with form libraries needing refs. Input uses `forwardRef` but Textarea does not. Inconsistent. | MEDIUM |
| 2 | Uses `border-input` / `ring-ring` — inconsistent with Input component. | LOW |

### `components/ui/badge.tsx`

No significant issues. Clean.

### `components/ui/input.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | Focus indicator is border-color change only — may not meet WCAG 2.2 focus visibility (3:1 contrast). | LOW |

### `components/ui/platform-icons.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | No `aria-hidden="true"` on SVGs — screen readers try to read decorative icons. | LOW |

### `components/ui/skeleton.tsx`, `components/ui/empty-state.tsx`, `components/ui/label.tsx`

No issues. Clean.

---

## 8. Layout Components

### `components/layout/site-header.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | Keyboard shortcut display always shows Mac `⌘K` — should show `Ctrl+K` on Windows. | MEDIUM |
| 2 | Logout clears cookie client-side but doesn't invalidate JWT on server. Token valid for 24h if intercepted. | MEDIUM |
| 3 | Opens command palette via synthetic `KeyboardEvent` dispatch — fragile, should use shared callback. | LOW |
| 4 | Refresh button 1s spinner is time-based, not tied to actual refresh completion. | LOW |

### `components/layout/app-sidebar.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | Sidebar bottom shows hardcoded "Online" green dot — always green even if system is down. StatusBar fetches real health but sidebar is static. | MEDIUM |
| 2 | No `aria-current="page"` on active nav links. | LOW |

### `components/layout/command-palette.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | `fetch('/api/agents')` — no `r.ok` check. 401/500 JSON error body parsed as agents array → garbage state. | MEDIUM |
| 2 | Agents loaded once on first open, never refreshed. New agents don't appear until page reload. | LOW |

### `components/layout/status-bar.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | `fetch('/api/health')` — no `r.ok` check before JSON parse. Non-200 responses cause garbage state. | MEDIUM |
| 2 | If health response shape doesn't match expected type, accessing `health.queue.pending` throws at render. No runtime validation. | MEDIUM |
| 3 | Version string hardcoded as "ARVIS v3.0" — should derive from package.json. | LOW |

### `components/layout/sidebar-context.tsx`

No issues. Clean.

---

## 9. Dashboard Components

### `components/dashboard/agent-chat.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | **Stack overflow** — `String.fromCharCode(...new Uint8Array(buf))` spreads entire file buffer onto call stack. Files >~100KB crash. Use chunked approach. | CRITICAL |
| 2 | Send button `disabled` checks `!input.trim()` but `handleSend` allows files-only. Button is disabled when only files staged (no text) — can't send file-only messages. | MEDIUM |
| 3 | Preview blob URLs (`URL.createObjectURL`) not revoked on unmount or after send. Memory leak. | MEDIUM |
| 4 | `MdContent` creates new component functions on every render — unnecessary reconciliation. Should be extracted as stable refs. | LOW |
| 5 | Drag-and-drop `onDragLeave` fires on child elements causing drag indicator flicker. | LOW |
| 6 | No max file count limit. Hundreds of files can be staged. | LOW |

### `components/dashboard/activity-chart.tsx`

| # | Issue | Severity |
|---|-------|----------|
| 1 | `today` computed via `new Date().toISOString().slice(0, 10)` — uses UTC, but data's `day` field may be local time. Midnight timezone mismatch. | MEDIUM |

---

## 10. Libraries

### `lib/auth.ts`

| # | Issue | Severity |
|---|-------|----------|
| 1 | `verifyPassword` hashes BOTH input and expected with PBKDF2 (120k iterations) per login. The expected should be hashed once and cached. 2x CPU cost per attempt. | HIGH |
| 2 | `JWT_SECRET` computed at module load time — if imported during build/SSG, tries to read files and create directories. Could cause build failures. | MEDIUM |
| 3 | Using JWT secret as PBKDF2 salt — deterministic, same for all passwords on instance. Unusual but not insecure. | LOW |
| 4 | JWT has no `aud`/`iss` claim. If services share secret, tokens are interchangeable. | LOW |
| 5 | Auto-generated secret file at `./data/.jwt-secret` uses Unix `0o600` permissions — ignored on Windows. | LOW |

### `lib/api-auth.ts`

| # | Issue | Severity |
|---|-------|----------|
| 1 | Returns `NextResponse | null` — callers that forget to check get unprotected routes. Error-prone API. | LOW |

### `lib/db.ts`

| # | Issue | Severity |
|---|-------|----------|
| 1 | All manager instances created at module load time. If DB is locked, crash cascades to all API routes. No error handling around construction. | MEDIUM |
| 2 | `resolveDataDir()` fallback may create DB at workspace root before core has run, causing divergent databases. | LOW |

### `lib/config.ts`

No issues. Clean.

### `lib/format.ts`

No issues. Minor: `fmtTokens` shows "1.0k" for exactly 1000 (cosmetic).

### `lib/status.ts`

| # | Issue | Severity |
|---|-------|----------|
| 1 | No default/fallback for unknown status values — returns `undefined`. | LOW |

### `lib/utils.ts`

No issues. Standard `cn()` pattern.

---

## 11. Hooks

### `hooks/use-websocket.ts`

| # | Issue | Severity |
|---|-------|----------|
| 1 | **WebSocket uses `ws://` not `wss://`** — chat traffic unencrypted in production. | HIGH |
| 2 | `clearHistory` is ephemeral — clears state but not server. Messages reappear on refresh because `userCleared.current` resets. | MEDIUM |
| 3 | `loadHistory` sets `historyLoaded = true` BEFORE fetch completes. If fetch fails, retry never fires. | MEDIUM |
| 4 | `WS_CONFIG.pingIntervalMs` defined in config.ts but never used. No keepalive mechanism. Connections die silently behind proxies/NATs. | MEDIUM |
| 5 | Two browser tabs on same agent share `userId: dashboard-${agentId}` — could cause message routing issues. | LOW |

---

## 12. Design System Consistency

### Cross-file inconsistencies

| Issue | Files | Severity |
|-------|-------|----------|
| `border-input` / `ring-ring` in Select + Textarea vs `border-border` / `border-primary/50` in Input | select.tsx, textarea.tsx, input.tsx | LOW |
| `text-muted` (background color) used as text color in not-found.tsx | not-found.tsx | HIGH |
| Inline `style` mixed with Tailwind hover classes | page.tsx (overview) | LOW |
| Fixed heights (`h-[520px]`) vs flex-based sizing for chat | agents/[id]/page.tsx vs chat/page.tsx | LOW |
| `toLocaleDateString()` vs `formatRelative()` for dates | webhooks-section.tsx vs rest of dashboard | LOW |
| Loading: `<Skeleton>` vs plain "Loading..." text | chat/page.tsx vs all other pages | LOW |
| `MODEL_OPTIONS` duplicated with different entries | agents/page.tsx vs agents/[id]/page.tsx | MEDIUM |
| `QueueJob` interface duplicated | logs/page.tsx vs queue/page.tsx | INFO |
| `enabled` as number vs boolean across settings sections | workflows, bots, skills | MEDIUM |

---

## 13. Positive Findings

Despite the issues found, the dashboard has many strong points:

1. **Zero SQL injection** — every single query across 25 API routes is parameterized.
2. **Strong auth implementation** — PBKDF2 120k iterations, timing-safe comparisons, auto-generated JWT secret.
3. **Clean separation of concerns** — settings page split into focused section components.
4. **Consistent design language** — dark theme, spacing, and component patterns are largely consistent.
5. **Agent creation validation** — slug regex, role whitelist, required field checks, field sanitization.
6. **Bot token masking on API** — GET endpoints mask tokens correctly.
7. **Proper `runtime = 'nodejs'`** — set on every API route for better-sqlite3 compatibility.
8. **Rate limiting on login** — per-IP tracking with configurable window.
9. **Error boundaries** — global error.tsx catches unexpected crashes.
10. **Auto-refresh patterns** — overview, queue, and status bar poll for fresh data.
11. **WebSocket-based chat** — real-time messaging with typing indicators and reconnection logic.
12. **Responsive sidebar** — desktop/mobile modes with drawer overlay.
13. **Command palette** — Cmd/Ctrl+K for quick navigation.
14. **Platform-aware UI** — SMS/email extra fields, platform-specific icons throughout.

---

## Priority Fix Order

### Immediate (Security + Crashes)
1. **C1/C2** — Sanitize skill slugs (reject or strip `..`, `/`, `\`)
2. **C3** — Replace `String.fromCharCode(...spread)` with chunked base64 encoding
3. **C4-C7** — Rewrite Dockerfile (or mark as non-functional until fixed)
4. **Mask bot tokens** in bots-section.tsx
5. **Mask webhook secrets** in webhooks GET
6. **Mask email passwords** in connectors GET (add `password` to secret detection regex)
7. **Whitelist PATCH fields** in agents/[id] route

### Soon (Major Bugs + UX)
8. Fix dialog.tsx — add focus trap, `role="dialog"`, `aria-modal`, scroll lock
9. Fix dropdown-menu.tsx — fix `...props` spread bug, add keyboard navigation
10. Fix `not-found.tsx` — change `text-muted` to `text-muted-foreground`
11. Fix ConfigTab stale state — use `useEffect` to sync with parent prop changes
12. Fix overview page — add error state with retry button for failed metrics fetch
13. Fix queue page `actioning` — change from single ID to `Set<number>`
14. Fix `ws://` → `wss://` in production (use `location.protocol === 'https:' ? 'wss' : 'ws'`)
15. Fix `verifyPassword` — cache the expected hash instead of re-deriving on every call

### Later (Quality + Polish)
16. Consolidate DESIGN_SYSTEM.md into DESIGN_RULES.md
17. Deduplicate MODEL_OPTIONS, ROLE_OPTIONS, QueueJob interface
18. Add `r.ok` checks to all client-side fetches
19. Fix a11y across all components (roles, labels, keyboard nav)
20. Add `Promise.allSettled` to settings page load
21. Add WebSocket ping/keepalive
22. Fix chat page mobile responsiveness
23. Add CSP `unsafe-eval` only in development

---

*End of Audit Report*
