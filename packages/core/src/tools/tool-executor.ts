import fs from 'fs';
import path from 'path';
import { createLogger } from '../logger.js';

const log = createLogger('tools');

// ─── Tool schema (provider-agnostic) ─────────────────────────────────────────

export interface ToolParam {
  type: string;
  description: string;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParam>;
    required?: string[];
  };
}

// ─── Built-in tool definitions ────────────────────────────────────────────────

export const BUILT_IN_TOOLS: ToolDefinition[] = [
  {
    name: 'web_search',
    description: 'Search the web for current information, news, or facts. Returns a summary of relevant results.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'calculate',
    description: 'Evaluate a mathematical expression and return the result. Supports +, -, *, /, **, %, parentheses.',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'The math expression to evaluate, e.g. "2 ** 10" or "(15 * 8) / 3"' },
      },
      required: ['expression'],
    },
  },
  {
    name: 'get_time',
    description: 'Get the current date and time in ISO 8601 format.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'http_fetch',
    description: 'Fetch the text content of a web page or API endpoint. Returns plain text (HTML tags stripped), truncated to 3000 characters.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch (must start with http:// or https://)' },
      },
      required: ['url'],
    },
  },
  {
    name: 'write_plugin',
    description: 'Write a JavaScript ESM plugin file to the plugins/ directory and load it immediately. The code must call registerTool() from @arvis/core to register new tools. New tools are available in the same conversation after writing.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Plugin filename without extension, e.g. "discord-admin" (alphanumeric, hyphens, underscores only)' },
        code: { type: 'string', description: 'Valid JavaScript ESM code. Must import registerTool from @arvis/core and call it.' },
      },
      required: ['name', 'code'],
    },
  },
  {
    name: 'list_plugins',
    description: 'List all currently loaded plugin tools (registered via registerTool).',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'delete_plugin',
    description: 'Delete a plugin file from the plugins/ directory.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Plugin name to delete (without .js extension)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'run_shell',
    description: 'Run a shell command and capture its output. Use for installing npm packages, running scripts, checking processes, reading logs, or any system operation.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
        timeout_ms: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the contents of any file on the local filesystem. Supports absolute and relative paths.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file (absolute or relative to Arvis root)' },
        max_chars: { type: 'number', description: 'Max characters to return (default: 8000)' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to any file on the local filesystem. Creates parent directories if needed.',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the file (absolute or relative to Arvis root)' },
        content: { type: 'string', description: 'Content to write to the file' },
      },
      required: ['file_path', 'content'],
    },
  },
];

/** Names of all built-in tools */
export const BUILT_IN_TOOL_NAMES = BUILT_IN_TOOLS.map(t => t.name);

// ─── Safe Math Expression Parser ──────────────────────────────────────────────

/**
 * Recursive descent parser for mathematical expressions.
 * Safely evaluates: numbers, +, -, *, /, **, %, parentheses, unary minus
 * No eval, no Function, no security issues.
 */
class MathExpressionParser {
  private expr: string;
  private pos: number = 0;

  constructor(expression: string) {
    // Replace ^ with ** for exponentiation
    this.expr = expression.replace(/\^/g, '**').trim();
  }

  parse(): number {
    const result = this.parseAddSub();
    if (this.pos < this.expr.length) {
      throw new Error('Unexpected characters in expression');
    }
    return result;
  }

  private parseAddSub(): number {
    let result = this.parseMulDiv();
    while (this.peekChar() === '+' || this.peekChar() === '-') {
      const op = this.expr[this.pos++];
      const right = this.parseMulDiv();
      result = op === '+' ? result + right : result - right;
    }
    return result;
  }

  private parseMulDiv(): number {
    let result = this.parsePower();
    while (this.peekChar() === '*' || this.peekChar() === '/' || this.peekChar() === '%') {
      const op = this.expr[this.pos++];
      // Handle ** (exponentiation)
      if (op === '*' && this.peekChar() === '*') {
        this.pos++;
        const right = this.parseUnary();
        result = Math.pow(result, right);
      } else {
        const right = this.parsePower();
        if (op === '*') result = result * right;
        else if (op === '/') result = result / right;
        else result = result % right;
      }
    }
    return result;
  }

  private parsePower(): number {
    let result = this.parseUnary();
    if (this.peekChar() === '*' && this.peekChar(1) === '*') {
      this.pos += 2;
      const right = this.parseUnary();
      result = Math.pow(result, right);
    }
    return result;
  }

  private parseUnary(): number {
    this.skipWhitespace();
    if (this.peekChar() === '-') {
      this.pos++;
      return -this.parseUnary();
    }
    if (this.peekChar() === '+') {
      this.pos++;
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    this.skipWhitespace();
    if (this.peekChar() === '(') {
      this.pos++;
      const result = this.parseAddSub();
      if (this.peekChar() !== ')') {
        throw new Error('Missing closing parenthesis');
      }
      this.pos++;
      return result;
    }
    return this.parseNumber();
  }

  private parseNumber(): number {
    this.skipWhitespace();
    const start = this.pos;
    if (this.peekChar() === '.') this.pos++;
    while (this.isDigit(this.peekChar())) this.pos++;
    if (this.peekChar() === '.') {
      this.pos++;
      while (this.isDigit(this.peekChar())) this.pos++;
    }
    if (this.peekChar() === 'e' || this.peekChar() === 'E') {
      this.pos++;
      if (this.peekChar() === '+' || this.peekChar() === '-') this.pos++;
      while (this.isDigit(this.peekChar())) this.pos++;
    }
    const numStr = this.expr.substring(start, this.pos);
    if (!numStr || numStr === '.') {
      throw new Error('Invalid number');
    }
    return parseFloat(numStr);
  }

  private peekChar(offset = 0): string | undefined {
    const idx = this.pos + offset;
    return idx < this.expr.length ? this.expr[idx] : undefined;
  }

  private isDigit(ch: string | undefined): boolean {
    return ch !== undefined && ch >= '0' && ch <= '9';
  }

  private skipWhitespace(): void {
    while (this.peekChar() === ' ' || this.peekChar() === '\t') this.pos++;
  }
}

// ─── Plugin registry ──────────────────────────────────────────────────────────

type ToolHandler = (input: Record<string, unknown>) => Promise<string> | string;

const _pluginTools = new Map<string, { definition: ToolDefinition; handler: ToolHandler }>();

/**
 * Register a custom tool that agents can use.
 * Call this in your plugins/ files before starting Arvis.
 *
 * Example:
 *   registerTool(
 *     { name: 'get_weather', description: '...', parameters: { ... } },
 *     async (input) => {
 *       const res = await fetch(`https://wttr.in/${input.city}?format=3`);
 *       return await res.text();
 *     }
 *   );
 */
export function registerTool(definition: ToolDefinition, handler: ToolHandler): void {
  _pluginTools.set(definition.name, { definition, handler });
  log.info({ tool: definition.name }, 'Custom tool registered');
}

/** Unregister a plugin tool by name */
export function unregisterTool(name: string): void {
  _pluginTools.delete(name);
}

/** All tool names: built-in + registered plugins */
export function getAllToolNames(): string[] {
  return [...BUILT_IN_TOOL_NAMES, ..._pluginTools.keys()];
}

/** Get tool definitions filtered to the allowed set (built-in + plugins) */
export function getEnabledTools(allowedNames: string[]): ToolDefinition[] {
  const builtIn = BUILT_IN_TOOLS.filter(t => allowedNames.includes(t.name));
  const plugins = [..._pluginTools.values()]
    .filter(p => allowedNames.includes(p.definition.name))
    .map(p => p.definition);
  return [...builtIn, ...plugins];
}

// ─── Tool executor ────────────────────────────────────────────────────────────

export class ToolExecutor {
  /** Execute a tool by name with given arguments. Returns a string result. */
  async execute(name: string, input: Record<string, unknown>): Promise<string> {
    log.debug({ tool: name, input }, 'Executing tool');
    try {
      // Check plugin tools first, then built-ins
      const plugin = _pluginTools.get(name);
      if (plugin) return String(await plugin.handler(input));

      switch (name) {
        case 'web_search':   return await this.webSearch(String(input.query ?? ''));
        case 'calculate':    return this.calculate(String(input.expression ?? ''));
        case 'get_time':     return new Date().toISOString();
        case 'http_fetch':   return await this.httpFetch(String(input.url ?? ''));
        case 'write_plugin': return await this.writePlugin(String(input.name ?? ''), String(input.code ?? ''));
        case 'list_plugins': return this.listPlugins();
        case 'delete_plugin':return await this.deletePlugin(String(input.name ?? ''));
        case 'run_shell':    return await this.runShell(String(input.command ?? ''), Number(input.timeout_ms ?? 30_000));
        case 'read_file':    return await this.readFileContents(String(input.file_path ?? ''), Number(input.max_chars ?? 8_000));
        case 'write_file':   return await this.writeFileContents(String(input.file_path ?? ''), String(input.content ?? ''));
        default:             throw new Error(`Unknown tool: ${name}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn({ tool: name, error: message }, 'Tool execution failed');
      return `Error: ${message}`;
    }
  }

  // ─── Implementations ────────────────────────────────────────────────────────

  private async webSearch(query: string): Promise<string> {
    if (!query.trim()) return 'Error: empty query';

    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1&skip_disambig=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Arvis/3.0 (self-hosted AI platform)' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`Search request failed: HTTP ${res.status}`);

    const data = await res.json() as {
      AbstractText?: string;
      AbstractSource?: string;
      AbstractURL?: string;
      Answer?: string;
      AnswerType?: string;
      RelatedTopics?: { Text?: string; FirstURL?: string }[];
      Infobox?: { content?: { label: string; value: string }[] };
    };

    const parts: string[] = [];

    if (data.Answer) {
      parts.push(`Answer: ${data.Answer}`);
    }

    if (data.AbstractText) {
      const source = data.AbstractSource ? ` (${data.AbstractSource})` : '';
      parts.push(`Summary${source}: ${data.AbstractText}`);
      if (data.AbstractURL) parts.push(`Source: ${data.AbstractURL}`);
    }

    if (data.Infobox?.content?.length) {
      const facts = data.Infobox.content
        .slice(0, 6)
        .map(f => `  ${f.label}: ${f.value}`)
        .join('\n');
      parts.push(`Info:\n${facts}`);
    }

    if (data.RelatedTopics?.length) {
      const topics = data.RelatedTopics
        .slice(0, 5)
        .filter(t => t.Text)
        .map(t => `- ${t.Text}${t.FirstURL ? ` (${t.FirstURL})` : ''}`);
      if (topics.length) parts.push(`Related results:\n${topics.join('\n')}`);
    }

    return parts.length ? parts.join('\n\n') : `No results found for: "${query}"`;
  }

  private calculate(expression: string): string {
    if (!expression.trim()) return 'Error: empty expression';

    // Whitelist: only digits, operators, parens, dot, space, e/E for scientific notation
    if (!/^[0-9+\-*/().,%\s^eE]+$/.test(expression)) {
      throw new Error('Invalid expression — only numeric operators allowed');
    }

    // Safe recursive descent parser — no eval, no Function, no security issues
    const parser = new MathExpressionParser(expression);
    const result = parser.parse();

    if (!isFinite(result)) throw new Error('Result is not finite');

    return String(result);
  }

  private async httpFetch(url: string): Promise<string> {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      throw new Error('Only http:// and https:// URLs are allowed');
    }

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Arvis/3.0' },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);

    const contentType = res.headers.get('content-type') || '';
    let text = await res.text();

    // Strip HTML for better readability
    if (contentType.includes('html')) {
      text = text
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    return text.length > 3000 ? text.slice(0, 3000) + '... [truncated]' : text;
  }

  // ─── Power tools ────────────────────────────────────────────────────────────

  private async writePlugin(name: string, code: string): Promise<string> {
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error('Plugin name must be alphanumeric with hyphens/underscores only');
    }
    const pluginsDir = path.join(process.cwd(), 'plugins');
    await fs.promises.mkdir(pluginsDir, { recursive: true });
    const filePath = path.join(pluginsDir, `${name}.js`);
    await fs.promises.writeFile(filePath, code, 'utf-8');

    // Import with cache-bust so re-writing the same plugin name reloads it
    const { pathToFileURL } = await import('url');
    const fileUrl = `${pathToFileURL(filePath).href}?t=${Date.now()}`;
    await import(fileUrl);

    const toolsBefore = _pluginTools.size;
    // Give import a tick to register tools
    await new Promise(r => setTimeout(r, 50));
    const newTools = [..._pluginTools.keys()];

    log.info({ name, tools: newTools }, 'Plugin written and loaded');
    return `Plugin "${name}" written to plugins/${name}.js and loaded.\nRegistered tools: ${newTools.join(', ') || '(none yet — check code called registerTool)'}`;
  }

  private listPlugins(): string {
    const tools = [..._pluginTools.entries()];
    if (tools.length === 0) return 'No plugin tools loaded.';
    return `Loaded plugin tools (${tools.length}):\n${tools.map(([n, t]) => `- ${n}: ${t.definition.description}`).join('\n')}`;
  }

  private async deletePlugin(name: string): Promise<string> {
    if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
      throw new Error('Invalid plugin name');
    }
    const pluginsDir = path.join(process.cwd(), 'plugins');
    const filePath = path.join(pluginsDir, `${name}.js`);
    try {
      await fs.promises.unlink(filePath);
    } catch {
      throw new Error(`Plugin file not found: ${name}.js`);
    }
    log.info({ name }, 'Plugin file deleted');
    return `Plugin file "${name}.js" deleted. Already-registered tools remain active until restart.`;
  }

  private async runShell(command: string, timeoutMs = 30_000): Promise<string> {
    if (!command.trim()) throw new Error('Empty command');
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const { stdout, stderr } = await execAsync(command, {
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
      shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
    });

    const output = [stdout?.trim(), stderr?.trim()].filter(Boolean).join('\n---stderr---\n').trim();
    if (!output) return '(command completed with no output)';
    return output.length > 4000 ? output.slice(0, 4000) + '\n... [truncated]' : output;
  }

  private async readFileContents(filePath: string, maxChars = 8_000): Promise<string> {
    if (!filePath) throw new Error('No file path provided');
    const resolved = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    const content = await fs.promises.readFile(resolved, 'utf-8');
    if (content.length > maxChars) return content.slice(0, maxChars) + `\n... [truncated at ${maxChars} chars]`;
    return content;
  }

  private async writeFileContents(filePath: string, content: string): Promise<string> {
    if (!filePath) throw new Error('No file path provided');
    const resolved = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    await fs.promises.mkdir(path.dirname(resolved), { recursive: true });
    await fs.promises.writeFile(resolved, content, 'utf-8');
    log.info({ path: resolved }, 'File written by agent');
    return `File written: ${resolved}`;
  }
}
