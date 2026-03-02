# Contributing to Arvis

Thanks for wanting to contribute. Arvis is a small, focused project — contributions that keep it clean, fast, and useful are welcome.

---

## What's Useful

- Bug fixes
- New connectors (platforms not yet supported)
- New built-in tools (`packages/core/src/tools/`)
- Performance improvements
- Documentation fixes and additions
- Test coverage improvements

## What to Check Before PRing

- `npm test` — all tests pass (203 currently)
- `npm run build` — builds without TypeScript errors
- No new dependencies added without a real reason
- No changes to the conductor system prompt unless there's a concrete bug

---

## Project Structure

```
packages/core/          — Core engine (touch with care)
  src/
    arvis.ts            — Main orchestrator, wiring
    agents/             — Agent registry, routing, conductor
    runner/             — LLM runners (provider-runner.ts, agent-runner.ts)
    queue/              — Job queue + scheduler
    conversation/       — Context builder, memory manager
    tools/              — Built-in tools + plugin loader
    bus/                — MessageBus event emitter
    db/                 — SQLite database + migrations

packages/dashboard/     — Next.js 15 admin dashboard
  src/app/              — Pages + API routes
  src/components/       — UI components
  src/lib/              — Utilities + DB access

packages/connector-*/   — Platform connectors (thin adapters)
plugins/                — Custom tool plugins (auto-loaded)
skills/                 — Agent skill files (markdown)
docs/                   — Documentation
```

---

## Adding a Connector

Connectors are intentionally thin. They:
1. Listen for incoming messages from the platform
2. Emit `IncomingMessage` events on the `MessageBus`
3. Listen for `OutgoingMessage` events on the bus and send them

```ts
// packages/connector-myplatform/src/connector.ts
import type { MessageBus, IncomingMessage, OutgoingMessage } from '@arvis/core';

export class MyPlatformConnector {
  constructor(private bus: MessageBus, private config: { token: string }) {}

  async start() {
    // Listen for incoming messages from the platform
    platform.onMessage((msg) => {
      this.bus.emit('message', {
        id: msg.id,
        platform: 'myplatform',
        channelId: msg.channelId,
        userId: msg.userId,
        userName: msg.userName,
        content: msg.text,
        timestamp: new Date(),
      });
    });

    // Listen for outgoing messages from Arvis
    this.bus.on('send', async (msg: OutgoingMessage) => {
      if (msg.platform !== 'myplatform') return;
      await platform.sendMessage(msg.channelId, msg.content);
    });
  }

  async stop() { /* cleanup */ }
}
```

Add the connector to `packages/core/src/arvis.ts` via `ConnectorManager`.

---

## Adding a Tool

Drop a plugin file in `plugins/`:

```ts
// plugins/my-tool.ts
import { registerTool } from '@arvis/core';

registerTool({
  name: 'my_tool_name',
  description: 'What this tool does (used by LLM to decide when to call it)',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The query to process' },
    },
    required: ['query'],
  },
  execute: async (input: { query: string }) => {
    // Do something and return a string
    return `Result: ${input.query}`;
  },
});
```

If it should be a built-in tool (always available), add it to `packages/core/src/tools/tool-executor.ts`.

---

## Adding an LLM Provider

1. Create `packages/core/src/runner/providers/myprovider.ts`
2. Implement the `ProviderAdapter` interface (see `providers/anthropic.ts` for reference)
3. Export a factory function `createMyProviderAdapter(request)`
4. Add a case to `ProviderRunner.createAdapter()` in `provider-runner.ts`
5. Add the provider to the `Provider` union type in `runner/types.ts`

That's it — no other files need changes.

---

## Database Migrations

If you need a schema change:

1. Create `packages/core/src/db/migrations/003-your-change.ts`
2. Export a `MigrationScript` with `id`, `name`, `up(db)`, `down(db)`
3. Register it in `packages/core/src/arvis.ts` in the `migrate()` call

Never modify existing migrations.

---

## Code Style

- TypeScript, strict mode, no `any`
- No `as unknown as T` double casts unless absolutely unavoidable (add a comment explaining why)
- Keep files focused — if a file grows past ~300 lines, it probably should be split
- No test mocking tricks needed — vitest's `vi.stubGlobal('fetch', vi.fn())` for HTTP, direct DB for persistence
- Tests go in `packages/core/tests/` matching the source path

---

## Running Tests

```bash
npm test              # Run all tests
npm test -- --watch   # Watch mode
```

All 203 tests must pass before submitting a PR.
