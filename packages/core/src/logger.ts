import pino from 'pino';

let logLevel = (process.env.LOG_LEVEL || 'info') as pino.Level;

export const logger = pino({
  level: logLevel,
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

/** Creates a child logger with a module name prefix */
export function createLogger(module: string): pino.Logger {
  return logger.child({ module });
}
