import { spawn } from 'child_process';
import { createLogger } from '../logger.js';
const log = createLogger('cli-runner');
/**
 * Executes Claude via the CLI subprocess.
 * System prompt is embedded in the user prompt since --system-prompt
 * flag exceeds Windows command line length limits for long prompts.
 * User prompt is piped via stdin.
 */
export class CLIRunner {
    async execute(request) {
        const cwd = request.projectPath || request.agent.projectPath || process.cwd();
        // Build the full prompt with system instructions embedded
        let fullPrompt = request.prompt;
        if (request.systemPrompt) {
            fullPrompt = `<instructions>\n${request.systemPrompt}\n</instructions>\n\nRespond to the following. You MUST follow all instructions above, especially any action tag formats.\n\n${request.prompt}`;
        }
        const args = [
            '--print',
            '--model', request.model || request.agent.model || 'claude-sonnet-4-20250514',
            '--max-turns', String(request.maxTurns || 25),
        ];
        // Tool restrictions
        const tools = request.allowedTools || request.agent.allowedTools;
        if (tools?.length) {
            for (const tool of tools) {
                args.push('--allowedTools', tool);
            }
        }
        if (request.sessionId) {
            args.push('--session-id', request.sessionId);
        }
        if (request.resume) {
            args.push('--continue');
        }
        const env = { ...process.env };
        if (request.account?.homeDir) {
            env.HOME = request.account.homeDir;
            env.USERPROFILE = request.account.homeDir;
        }
        delete env.CLAUDECODE;
        const startTime = Date.now();
        return new Promise((resolve, reject) => {
            log.info({ promptLen: fullPrompt.length, cwd }, 'Starting CLI');
            const child = spawn('claude', args, {
                cwd,
                env: env,
                shell: true,
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            let stdout = '';
            let stderr = '';
            let killed = false;
            const timeout = setTimeout(() => {
                killed = true;
                child.kill('SIGKILL');
                reject(new Error('Claude CLI timed out after 180s'));
            }, 180_000);
            child.stdout.on('data', (d) => { stdout += d.toString(); });
            child.stderr.on('data', (d) => { stderr += d.toString(); });
            // Pipe full prompt via stdin
            child.stdin.write(fullPrompt);
            child.stdin.end();
            child.on('close', (code) => {
                clearTimeout(timeout);
                if (killed)
                    return;
                const durationMs = Date.now() - startTime;
                log.info({ code, durationMs, stdoutLen: stdout.length, stderrLen: stderr.length }, 'CLI exited');
                if (stderr) {
                    log.warn({ stderr: stderr.substring(0, 500) }, 'CLI stderr');
                }
                if (code !== 0 && !stdout) {
                    log.error({ code, stderr: stderr.substring(0, 500) }, 'CLI failed');
                    reject(new Error(`CLI exit ${code}: ${stderr}`));
                    return;
                }
                // Log first 500 chars of output for debugging
                log.debug({ output: stdout.substring(0, 500) }, 'CLI output preview');
                const estimatedTokens = estimateTokensFromOutput(stdout);
                resolve({
                    content: stdout.trim(),
                    model: request.model || request.agent.model,
                    provider: (request.account?.provider || 'anthropic'),
                    inputTokens: 0,
                    outputTokens: estimatedTokens,
                    tokensUsed: estimatedTokens,
                    costUsd: 0, // CLI subscription — no per-request cost
                    mode: 'full',
                    sessionId: request.sessionId,
                    durationMs,
                });
            });
            child.on('error', (err) => {
                clearTimeout(timeout);
                reject(new Error(`Failed to start CLI: ${err.message}`));
            });
        });
    }
}
function estimateTokensFromOutput(output) {
    return Math.ceil(output.length / 3.5);
}
//# sourceMappingURL=cli-runner.js.map