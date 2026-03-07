import { query } from '@anthropic-ai/claude-agent-sdk';
import { estimateTokens } from '../lib/token-utils.js';
import { createLogger } from '../logger.js';
const log = createLogger('cli-runner');
/**
 * Executes Claude via the official Agent SDK.
 *
 * Stateless design: Arvis owns all conversation history (DB-backed).
 * Each invocation gets a fresh, self-contained prompt with full context.
 * No session persistence — no session files on disk, no folder sprawl.
 *
 * Uses @anthropic-ai/claude-agent-sdk instead of manual child_process.spawn.
 * Handles Windows .cmd resolution, stdin piping, and platform quirks automatically.
 */
export class CLIRunner {
    async execute(request) {
        const cwd = request.projectPath || request.agent.projectPath || process.cwd();
        const startTime = Date.now();
        // Build the full prompt with system instructions embedded
        let fullPrompt = request.prompt;
        if (request.systemPrompt) {
            fullPrompt = `<instructions>\n${request.systemPrompt}\n</instructions>\n\nRespond to the following. You MUST follow all instructions above, especially any action tag formats.\n\n${request.prompt}`;
        }
        // Map Arvis tool names to Claude Code CLI tool names
        const ARVIS_TO_CLI = {
            http_fetch: ['WebFetch'],
            web_search: ['WebSearch'],
            run_shell: ['Bash'],
            read_file: ['Read'],
            write_file: ['Write', 'Edit'],
            write_plugin: ['Write', 'Edit'],
            list_plugins: [],
            delete_plugin: [],
            get_time: [],
            calculate: [],
        };
        const tools = request.allowedTools || request.agent.allowedTools;
        const allowedTools = [];
        if (tools?.length) {
            const cliTools = new Set();
            for (const tool of tools) {
                const mapped = ARVIS_TO_CLI[tool];
                if (mapped) {
                    mapped.forEach(t => { if (t)
                        cliTools.add(t); });
                }
                else {
                    cliTools.add(tool);
                }
            }
            allowedTools.push(...cliTools);
        }
        // Build env — multi-account support via HOME dir override
        const env = { ...process.env };
        if (request.account?.homeDir) {
            env.HOME = request.account.homeDir;
            env.USERPROFILE = request.account.homeDir;
        }
        delete env.CLAUDECODE;
        log.info({ promptLen: fullPrompt.length, cwd, model: request.model || request.agent.model }, 'Starting SDK query');
        try {
            const conversation = query({
                prompt: fullPrompt,
                options: {
                    model: request.model || request.agent.model || 'claude-sonnet-4-6',
                    maxTurns: request.maxTurns || 25,
                    cwd,
                    env,
                    persistSession: false,
                    allowedTools,
                    permissionMode: 'bypassPermissions',
                    allowDangerouslySkipPermissions: true,
                },
            });
            // Collect the final text response
            let content = '';
            for await (const message of conversation) {
                if (message.type === 'assistant' && message.message?.content) {
                    const msgContent = message.message.content;
                    if (typeof msgContent === 'string') {
                        content = msgContent;
                    }
                    else if (Array.isArray(msgContent)) {
                        content = msgContent
                            .filter((block) => block.type === 'text' && block.text)
                            .map((block) => block.text)
                            .join('');
                    }
                }
            }
            const durationMs = Date.now() - startTime;
            const estimatedTokens = estimateTokens(content);
            log.info({ durationMs, contentLen: content.length }, 'SDK query completed');
            return {
                content: content.trim(),
                model: request.model || request.agent.model,
                provider: (request.account?.provider || 'anthropic'),
                inputTokens: 0,
                outputTokens: estimatedTokens,
                tokensUsed: estimatedTokens,
                costUsd: 0,
                mode: 'full',
                sessionId: undefined,
                durationMs,
            };
        }
        catch (err) {
            const durationMs = Date.now() - startTime;
            log.error({ err, durationMs }, 'SDK query failed');
            throw new Error(`Claude SDK failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
}
//# sourceMappingURL=cli-runner.js.map
