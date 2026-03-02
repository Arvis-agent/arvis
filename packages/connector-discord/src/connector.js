import { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, } from 'discord.js';
const MAX_MESSAGE_LENGTH = 2000;
const BUTTON_STYLE_MAP = {
    primary: ButtonStyle.Primary,
    secondary: ButtonStyle.Secondary,
    success: ButtonStyle.Success,
    danger: ButtonStyle.Danger,
};
/**
 * THIN adapter between Discord.js and the Message Bus.
 * No business logic — just converts formats and relays events.
 */
export class DiscordConnector {
    bus;
    config;
    client;
    constructor(bus, config) {
        this.bus = bus;
        this.config = config;
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
            ],
            partials: [Partials.Channel, Partials.Message],
        });
    }
    /** Start the Discord connector */
    async start() {
        // Incoming messages
        this.client.on('messageCreate', (msg) => {
            if (msg.author.bot)
                return;
            this.bus.emit('message', this.parseMessage(msg));
        });
        // Button interactions
        this.client.on('interactionCreate', (interaction) => {
            if (!interaction.isButton())
                return;
            this.bus.emit('button_click', this.parseButtonClick(interaction));
            interaction.deferUpdate().catch(() => { });
        });
        // Outgoing messages
        this.bus.on('send', async (msg) => {
            if (msg.platform !== 'discord')
                return;
            await this.sendToDiscord(msg);
        });
        // Typing indicator
        this.bus.on('typing', (data) => {
            if (data.platform !== 'discord')
                return;
            const channel = this.client.channels.cache.get(data.channelId);
            channel?.sendTyping().catch(() => { });
        });
        await this.client.login(this.config.token);
    }
    /** Stop the connector */
    async stop() {
        this.client.destroy();
    }
    /** Convert Discord message to IncomingMessage */
    parseMessage(msg) {
        const attachments = msg.attachments.map(a => ({
            id: a.id,
            filename: a.name || 'unknown',
            url: a.url,
            contentType: a.contentType ?? undefined,
            size: a.size,
        }));
        return {
            id: msg.id,
            platform: 'discord',
            channelId: msg.channelId,
            userId: msg.author.id,
            userName: msg.author.displayName || msg.author.username,
            content: msg.content,
            attachments: attachments.length > 0 ? attachments : undefined,
            replyTo: msg.reference?.messageId ?? undefined,
            metadata: {
                guildId: msg.guildId,
                threadId: msg.channel.isThread() ? msg.channelId : undefined,
                isDM: msg.channel.isDMBased(),
                assignedAgentId: this.config.defaultAgentId ?? undefined,
            },
            timestamp: msg.createdAt,
        };
    }
    /** Convert button interaction to ButtonClick */
    parseButtonClick(interaction) {
        if (!interaction.isButton())
            throw new Error('Not a button interaction');
        let data;
        try {
            data = JSON.parse(interaction.customId);
        }
        catch {
            data = { id: interaction.customId };
        }
        return {
            buttonId: interaction.customId,
            userId: interaction.user.id,
            userName: interaction.user.displayName || interaction.user.username,
            channelId: interaction.channelId,
            platform: 'discord',
            data,
            timestamp: interaction.createdAt,
        };
    }
    /** Convert OutgoingMessage to Discord and send */
    async sendToDiscord(msg) {
        const channel = this.client.channels.cache.get(msg.channelId);
        if (!channel)
            return;
        // Build embeds
        const embeds = msg.embeds?.map(e => {
            const embed = new EmbedBuilder();
            if (e.title)
                embed.setTitle(e.title);
            if (e.description)
                embed.setDescription(e.description);
            if (e.color)
                embed.setColor(parseInt(e.color.replace('#', ''), 16));
            if (e.fields)
                embed.addFields(e.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline })));
            if (e.footer)
                embed.setFooter({ text: e.footer });
            return embed;
        }) || [];
        // Build buttons
        const components = [];
        if (msg.buttons?.length) {
            const row = new ActionRowBuilder();
            for (const btn of msg.buttons) {
                row.addComponents(new ButtonBuilder()
                    .setCustomId(btn.data ? JSON.stringify(btn.data) : btn.id)
                    .setLabel(btn.label)
                    .setStyle(BUTTON_STYLE_MAP[btn.style] || ButtonStyle.Primary));
            }
            components.push(row);
        }
        // Build files
        const files = msg.files?.map(f => new AttachmentBuilder(typeof f.data === 'string' ? Buffer.from(f.data) : f.data, { name: f.name })) || [];
        // Split long messages
        const chunks = splitMessage(msg.content, MAX_MESSAGE_LENGTH);
        for (let i = 0; i < chunks.length; i++) {
            const isLast = i === chunks.length - 1;
            await channel.send({
                content: chunks[i],
                embeds: isLast ? embeds : [],
                components: isLast ? components : [],
                files: isLast ? files : [],
                reply: i === 0 && msg.replyTo ? { messageReference: msg.replyTo } : undefined,
            });
        }
    }
}
/** Split a message at 2000 char limit, trying to break at newlines */
function splitMessage(content, maxLength) {
    if (content.length <= maxLength)
        return [content];
    const chunks = [];
    let remaining = content;
    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }
        // Try to break at newline
        let splitAt = remaining.lastIndexOf('\n', maxLength);
        if (splitAt === -1 || splitAt < maxLength / 2) {
            // Try space
            splitAt = remaining.lastIndexOf(' ', maxLength);
        }
        if (splitAt === -1 || splitAt < maxLength / 2) {
            splitAt = maxLength;
        }
        chunks.push(remaining.substring(0, splitAt));
        remaining = remaining.substring(splitAt).trimStart();
    }
    return chunks;
}
//# sourceMappingURL=connector.js.map