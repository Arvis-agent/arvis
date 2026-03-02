export class RateLimitError extends Error {
    retryAfter;
    constructor(message, retryAfter) {
        super(message);
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
    }
}
//# sourceMappingURL=types.js.map