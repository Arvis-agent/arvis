export interface AccountConfig {
    name: string;
    type: 'cli_subscription' | 'api_key';
    provider?: string;
    homeDir?: string;
    apiKey?: string;
    baseUrl?: string;
    model: string;
    priority?: number;
}
export interface ArvisConfig {
    dataDir: string;
    discord: {
        token: string;
        ownerId: string;
        conductorChannel?: string;
    };
    telegram: {
        token?: string;
    };
    slack: {
        botToken?: string;
        appToken?: string;
        signingSecret?: string;
    };
    whatsapp: {
        accessToken?: string;
        phoneNumberId?: string;
        verifyToken?: string;
        webhookPath?: string;
    };
    matrix: {
        homeserverUrl?: string;
        accessToken?: string;
        userId?: string;
    };
    web: {
        port: number;
        apiKey?: string;
    };
    accounts: AccountConfig[];
    webhook: {
        port: number;
        secret?: string;
    };
    dashboard: {
        port: number;
        apiKey?: string;
    };
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    timezone: string;
}
/**
 * Loads configuration from .env file and environment variables.
 * Supports multiple LLM providers via env vars.
 * @throws {Error} If no LLM accounts are configured
 */
export declare function loadConfig(envPath?: string): ArvisConfig;
//# sourceMappingURL=config.d.ts.map