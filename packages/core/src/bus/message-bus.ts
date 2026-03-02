import { EventEmitter } from 'events';
import { createLogger } from '../logger.js';
import type {
  IncomingMessage,
  OutgoingMessage,
  ButtonClick,
  TypingEvent,
  MessageBusEvents,
} from './types.js';

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

  /** Emit a typed event */
  override emit<K extends keyof MessageBusEvents>(event: K, data: MessageBusEvents[K]): boolean;
  override emit(event: string | symbol, ...args: unknown[]): boolean {
    log.debug({ event, hasData: args.length > 0 }, 'Bus event emitted');
    return super.emit(event, ...args);
  }

  /** Listen for a typed event */
  override on<K extends keyof MessageBusEvents>(
    event: K,
    listener: (data: MessageBusEvents[K]) => void,
  ): this;
  override on(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }

  /** Listen for a typed event once */
  override once<K extends keyof MessageBusEvents>(
    event: K,
    listener: (data: MessageBusEvents[K]) => void,
  ): this;
  override once(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.once(event, listener);
  }

  /** Remove a typed event listener */
  override off<K extends keyof MessageBusEvents>(
    event: K,
    listener: (data: MessageBusEvents[K]) => void,
  ): this;
  override off(event: string | symbol, listener: (...args: unknown[]) => void): this {
    return super.off(event, listener);
  }

  /**
   * Convenience method to reply to an incoming message.
   * Sets the correct channelId and platform from the original message.
   */
  reply(original: IncomingMessage, content: string, options?: Partial<OutgoingMessage>): void {
    const outgoing: OutgoingMessage = {
      channelId: original.channelId,
      platform: original.platform,
      content,
      replyTo: original.id,
      ...options,
    };
    this.emit('send', outgoing);
  }

  /** Emit a typing indicator for a channel */
  sendTyping(channelId: string, platform: string): void {
    this.emit('typing', { channelId, platform });
  }

  /** Emit an error event */
  emitError(error: Error): void {
    log.error({ err: error }, 'Bus error');
    this.emit('error', error);
  }
}
