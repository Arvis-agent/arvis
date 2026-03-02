/** Default page size for paginated lists */
export const PAGE_SIZE = 50;

/** WebSocket connection config for the chat connector */
export const WS_CONFIG = {
  reconnectDelayMs: 3_000,
  pingIntervalMs: 30_000,
  maxReconnectAttempts: 10,
} as const;
