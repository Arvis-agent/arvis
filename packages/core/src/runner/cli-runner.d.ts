import type { RunRequest, RunResult } from './types.js';
/**
 * Executes Claude via the CLI subprocess.
 * System prompt is embedded in the user prompt since --system-prompt
 * flag exceeds Windows command line length limits for long prompts.
 * User prompt is piped via stdin.
 */
export declare class CLIRunner {
    execute(request: RunRequest): Promise<RunResult>;
}
//# sourceMappingURL=cli-runner.d.ts.map