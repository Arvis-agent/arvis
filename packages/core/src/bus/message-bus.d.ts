import { EventEmitter } from 'events';
import type { IncomingMessage, OutgoingMessage, MessageBusEvents } from './types.js';
/**
 * Central event bus for all message routing.
 * All messages flow through here — platform connectors emit events,
 * the router picks them up. Nothing talks directly to anything else.
 */
export declare class MessageBus extends EventEmitter {
    constructor();
    /** Emit a typed event */
    emit<K extends keyof MessageBusEvents>(event: K, data: MessageBusEvents[K]): boolean;
    /** Listen for a typed event */
    on<K extends keyof MessageBusEvents>(event: K, listener: (data: MessageBusEvents[K]) => void): this;
    /** Listen for a typed event once */
    once<K extends keyof MessageBusEvents>(event: K, listener: (data: MessageBusEvents[K]) => void): this;
    /** Remove a typed event listener */
    off<K extends keyof MessageBusEvents>(event: K, listener: (data: MessageBusEvents[K]) => void): this;
    /**
     * Convenience method to reply to an incoming message.
     * Sets the correct channelId and platform from the original message.
     */
    reply(original: IncomingMessage, content: string, options?: Partial<OutgoingMessage>): void;
    /** Emit a typing indicator for a channel */
    sendTyping(channelId: string, platform: string): void;
    /** Emit an error event */
    emitError(error: Error): void;
}
//# sourceMappingURL=message-bus.d.ts.map