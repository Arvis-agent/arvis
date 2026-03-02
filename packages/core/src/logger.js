import pino from 'pino';
let logLevel = (process.env.LOG_LEVEL || 'info');
export const logger = pino({
    level: logLevel,
    transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
});
/** Creates a child logger with a module name prefix */
export function createLogger(module) {
    return logger.child({ module });
}
//# sourceMappingURL=logger.js.map