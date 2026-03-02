import { Bot, InputFile } from 'grammy';
/** Transcribe audio via OpenAI Whisper. Returns null if key missing or fails. */
async function transcribeAudio(buf, filename) {
    const key = process.env.OPENAI_API_KEY;
    if (!key)
        return null;
    try {
        const form = new FormData();
        form.append('file', new Blob([buf]), filename);
        form.append('model', 'whisper-1');
        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
        });
        if (!res.ok)
            return null;
        const data = await res.json();
        return data.text?.trim() || null;
    }
    catch {
        return null;
    }
}
const MAX_MESSAGE_LENGTH = 4096;
/**
 * THIN adapter between Telegram Bot API (via grammy) and the Message Bus.
 * No business logic — just converts formats and relays events.
 */
export class TelegramConnector {
    bus;
    config;
    bot;
    constructor(bus, config) {
        this.bus = bus;
        this.config = config;
        this.bot = new Bot(config.token);
    }
    /** Start the Telegram connector */
    async start() {
        // Incoming text messages
        this.bot.on('message:text', (ctx) => {
            if (!ctx.message)
                return;
            this.bus.emit('message', this.parseMessage(ctx));
        });
        // Photos (with or without caption) — download and embed base64 for vision
        this.bot.on('message:photo', async (ctx) => {
            if (!ctx.message?.photo)
                return;
            const parsed = this.parseMessage(ctx);
            const photo = ctx.message.photo[ctx.message.photo.length - 1];
            const attachment = parsed.attachments?.[0];
            if (attachment) {
                try {
                    const fileInfo = await this.bot.api.getFile(photo.file_id);
                    if (fileInfo.file_path) {
                        const url = `https://api.telegram.org/file/bot${this.config.token}/${fileInfo.file_path}`;
                        const res = await fetch(url);
                        if (res.ok) {
                            const mimeType = res.headers.get('content-type') || 'image/jpeg';
                            attachment.data = Buffer.from(await res.arrayBuffer()).toString('base64');
                            attachment.contentType = mimeType;
                        }
                    }
                }
                catch { /* Use file_id placeholder */ }
            }
            if (!parsed.content)
                parsed.content = '[Image]';
            this.bus.emit('message', parsed);
        });
        // Captioned non-photo messages (documents, videos, etc.)
        this.bot.on('message:caption', (ctx) => {
            if (!ctx.message)
                return;
            if (ctx.message.photo)
                return; // handled by message:photo above
            this.bus.emit('message', this.parseMessage(ctx));
        });
        // Voice messages — download OGG and transcribe with Whisper if key available
        this.bot.on('message:voice', async (ctx) => {
            if (!ctx.message?.voice)
                return;
            const voice = ctx.message.voice;
            const chat = ctx.message.chat;
            const from = ctx.message.from;
            let content = '[Voice message]';
            try {
                const fileInfo = await this.bot.api.getFile(voice.file_id);
                if (fileInfo.file_path) {
                    const url = `https://api.telegram.org/file/bot${this.config.token}/${fileInfo.file_path}`;
                    const res = await fetch(url);
                    if (res.ok) {
                        const buf = Buffer.from(await res.arrayBuffer());
                        const transcript = await transcribeAudio(buf, 'voice.ogg');
                        if (transcript)
                            content = `[Voice]: "${transcript}"`;
                    }
                }
            }
            catch {
                // Transcription failed — use placeholder
            }
            const msg = {
                id: String(ctx.message.message_id),
                platform: 'telegram',
                channelId: String(chat.id),
                userId: String(from.id),
                userName: from.first_name + (from.last_name ? ' ' + from.last_name : ''),
                content,
                metadata: {
                    chatType: chat.type,
                    isDM: chat.type === 'private',
                    fromUsername: from.username,
                    assignedAgentId: this.config.defaultAgentId ?? undefined,
                },
                timestamp: new Date(ctx.message.date * 1000),
            };
            this.bus.emit('message', msg);
        });
        // Callback queries (inline keyboard button presses)
        this.bot.on('callback_query:data', (ctx) => {
            const query = ctx.callbackQuery;
            this.bus.emit('button_click', {
                buttonId: query.data,
                userId: String(query.from.id),
                userName: query.from.first_name + (query.from.last_name ? ' ' + query.from.last_name : ''),
                channelId: String(query.message?.chat.id || query.from.id),
                platform: 'telegram',
                data: this.tryParseJson(query.data),
                timestamp: new Date(),
            });
            ctx.answerCallbackQuery().catch(() => { });
        });
        // Outgoing messages
        this.bus.on('send', async (msg) => {
            if (msg.platform !== 'telegram')
                return;
            await this.sendToTelegram(msg);
        });
        // Typing indicator
        this.bus.on('typing', (data) => {
            if (data.platform !== 'telegram')
                return;
            this.bot.api.sendChatAction(data.channelId, 'typing').catch(() => { });
        });
        // Start polling
        this.bot.start();
    }
    /** Stop the connector */
    async stop() {
        this.bot.stop();
    }
    /** Convert a grammy Context to an IncomingMessage */
    parseMessage(ctx) {
        const msg = ctx.message;
        const chat = msg.chat;
        const from = msg.from;
        const attachments = [];
        // Photos (take largest)
        if (msg.photo && msg.photo.length > 0) {
            const largest = msg.photo[msg.photo.length - 1];
            attachments.push({
                id: largest.file_id,
                filename: 'photo.jpg',
                url: largest.file_id, // file_id used to fetch later
                size: largest.file_size,
            });
        }
        // Documents
        if (msg.document) {
            attachments.push({
                id: msg.document.file_id,
                filename: msg.document.file_name || 'document',
                url: msg.document.file_id,
                contentType: msg.document.mime_type,
                size: msg.document.file_size,
            });
        }
        // Audio
        if (msg.audio) {
            attachments.push({
                id: msg.audio.file_id,
                filename: msg.audio.file_name || 'audio',
                url: msg.audio.file_id,
                contentType: msg.audio.mime_type,
                size: msg.audio.file_size,
            });
        }
        // Voice
        if (msg.voice) {
            attachments.push({
                id: msg.voice.file_id,
                filename: 'voice.ogg',
                url: msg.voice.file_id,
                contentType: msg.voice.mime_type,
                size: msg.voice.file_size,
            });
        }
        // Video
        if (msg.video) {
            attachments.push({
                id: msg.video.file_id,
                filename: msg.video.file_name || 'video',
                url: msg.video.file_id,
                contentType: msg.video.mime_type,
                size: msg.video.file_size,
            });
        }
        const content = msg.text || msg.caption || '';
        const isPrivate = chat.type === 'private';
        return {
            id: String(msg.message_id),
            platform: 'telegram',
            channelId: String(chat.id),
            userId: String(from.id),
            userName: from.first_name + (from.last_name ? ' ' + from.last_name : ''),
            content,
            attachments: attachments.length > 0 ? attachments : undefined,
            replyTo: msg.reply_to_message ? String(msg.reply_to_message.message_id) : undefined,
            metadata: {
                chatType: chat.type,
                isDM: isPrivate,
                chatTitle: 'title' in chat ? chat.title : undefined,
                fromUsername: from.username,
                assignedAgentId: this.config.defaultAgentId ?? undefined,
            },
            timestamp: new Date(msg.date * 1000),
        };
    }
    /** Convert OutgoingMessage to Telegram and send */
    async sendToTelegram(msg) {
        const chatId = msg.channelId;
        // Build inline keyboard from buttons
        const inlineKeyboard = msg.buttons?.length
            ? {
                reply_markup: {
                    inline_keyboard: [
                        msg.buttons.map(btn => ({
                            text: btn.label,
                            callback_data: btn.data ? JSON.stringify(btn.data) : btn.id,
                        })),
                    ],
                },
            }
            : {};
        // Split long messages
        const chunks = splitMessage(msg.content, MAX_MESSAGE_LENGTH);
        for (let i = 0; i < chunks.length; i++) {
            const isLast = i === chunks.length - 1;
            const options = {
                parse_mode: 'Markdown',
                ...(isLast ? inlineKeyboard : {}),
            };
            if (i === 0 && msg.replyTo) {
                options.reply_to_message_id = parseInt(msg.replyTo, 10);
            }
            await this.bot.api.sendMessage(chatId, chunks[i], options);
        }
        // Send embeds as formatted messages
        if (msg.embeds?.length) {
            for (const embed of msg.embeds) {
                let text = '';
                if (embed.title)
                    text += `*${embed.title}*\n`;
                if (embed.description)
                    text += embed.description + '\n';
                if (embed.fields) {
                    for (const field of embed.fields) {
                        text += `\n*${field.name}:* ${field.value}`;
                    }
                }
                if (embed.footer)
                    text += `\n\n_${embed.footer}_`;
                if (text.trim()) {
                    await this.bot.api.sendMessage(chatId, text, { parse_mode: 'Markdown' });
                }
            }
        }
        // Send files
        if (msg.files?.length) {
            for (const file of msg.files) {
                const buffer = typeof file.data === 'string' ? Buffer.from(file.data) : file.data;
                await this.bot.api.sendDocument(chatId, new InputFile(buffer, file.name));
            }
        }
    }
    tryParseJson(str) {
        try {
            return JSON.parse(str);
        }
        catch {
            return { id: str };
        }
    }
}
/** Split a message at Telegram's 4096 char limit, trying to break at newlines */
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
        let splitAt = remaining.lastIndexOf('\n', maxLength);
        if (splitAt === -1 || splitAt < maxLength / 2) {
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