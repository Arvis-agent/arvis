import { Context } from 'grammy';
import type { MessageBus } from '@arvis/core';
import type { IncomingMessage } from '@arvis/core';
/**
 * THIN adapter between Telegram Bot API (via grammy) and the Message Bus.
 * No business logic — just converts formats and relays events.
 */
export declare class TelegramConnector {
    private bus;
    private config;
    private bot;
    constructor(bus: MessageBus, config: {
        token: string;
        defaultAgentId?: number | null;
    });
    /** Start the Telegram connector */
    start(): Promise<void>;
    /** Stop the connector */
    stop(): Promise<void>;
    /** Convert a grammy Context to an IncomingMessage */
    parseMessage(ctx: Context): IncomingMessage;
    /** Convert OutgoingMessage to Telegram and send */
    private sendToTelegram;
    private tryParseJson;
}
//# sourceMappingURL=connector.d.ts.map