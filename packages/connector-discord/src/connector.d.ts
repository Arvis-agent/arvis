import type { Message as DiscordMessage, Interaction } from 'discord.js';
import type { MessageBus } from '@arvis/core';
import type { IncomingMessage, ButtonClick } from '@arvis/core';
/**
 * THIN adapter between Discord.js and the Message Bus.
 * No business logic — just converts formats and relays events.
 */
export declare class DiscordConnector {
    private bus;
    private config;
    private client;
    constructor(bus: MessageBus, config: {
        token: string;
        defaultAgentId?: number | null;
    });
    /** Start the Discord connector */
    start(): Promise<void>;
    /** Stop the connector */
    stop(): Promise<void>;
    /** Convert Discord message to IncomingMessage */
    parseMessage(msg: DiscordMessage): IncomingMessage;
    /** Convert button interaction to ButtonClick */
    parseButtonClick(interaction: Interaction): ButtonClick;
    /** Convert OutgoingMessage to Discord and send */
    private sendToDiscord;
}
//# sourceMappingURL=connector.d.ts.map