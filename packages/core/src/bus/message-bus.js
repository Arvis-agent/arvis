import { EventEmitter } from 'events';
import { createLogger } from '../logger.js';
const log = createLogger('message-bus');
/**
 * Central event bus for all message routing.
 * All messages flow through here — platform connectors emit events,
 * the router picks them up. Nothing talks directly to anything else.
 */
export class MessageBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50);
    }
    emit(event, ...args) {
        log.debug({ event, hasData: args.length > 0 }, 'Bus event emitted');
        return super.emit(event, ...args);
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    once(event, listener) {
        return super.once(event, listener);
    }
    off(event, listener) {
        return super.off(event, listener);
    }
    /**
     * Convenience method to reply to an incoming message.
     * Sets the correct channelId and platform from the original message.
     */
    reply(original, content, options) {
        const outgoing = {
            channelId: original.channelId,
            platform: original.platform,
            content,
            replyTo: original.id,
            ...options,
        };
        this.emit('send', outgoing);
    }
    /** Emit a typing indicator for a channel */
    sendTyping(channelId, platform) {
        this.emit('typing', { channelId, platform });
    }
    /** Emit an error event */
    emitError(error) {
        log.error({ err: error }, 'Bus error');
        this.emit('error', error);
    }
}
//# sourceMappingURL=message-bus.js.map