# Arvis Plugins

Drop a `.ts` or `.js` file here to extend Arvis with custom tools, connectors, or hooks. Files are auto-loaded on startup in alphabetical order.

## Adding a Custom Tool

```ts
// plugins/my-tool.ts
import { registerTool } from '@arvis/core';

registerTool(
  {
    name: 'my_tool',
    description: 'What this tool does',
    parameters: {
      query: { type: 'string', description: 'Input parameter', required: true },
    },
  },
  async ({ query }) => {
    // Your tool logic here
    return `Result for: ${query}`;
  },
);
```

Once registered, assign the tool to an agent via the dashboard (Agents → Config → Allowed Tools) or in the conductor chat:

> "Give the research-bot access to `my_tool`"

## Tool Parameter Types

| type | description |
|------|-------------|
| `string` | Text input |
| `number` | Numeric input |
| `boolean` | True/false |
| `array` | List of items |

Set `required: true` for required parameters.

## Rules

- Plugin files starting with `_` or `.` are ignored
- Each plugin runs in isolation — errors won't crash Arvis
- Keep plugins focused on one tool or feature per file
- Use `@arvis/core` imports for `registerTool` and other APIs
