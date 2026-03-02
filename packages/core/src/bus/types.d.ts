export interface Attachment {
    id: string;
    filename: string;
    url: string;
    contentType?: string;
    size?: number;
}
export interface FileAttachment {
    name: string;
    data: Buffer | string;
    contentType?: string;
}
export interface Embed {
    title?: string;
    description?: string;
    color?: string;
    fields?: {
        name: string;
        value: string;
        inline?: boolean;
    }[];
    footer?: string;
}
export interface Button {
    id: string;
    label: string;
    style: 'primary' | 'secondary' | 'success' | 'danger';
    data?: Record<string, unknown>;
}
export interface IncomingMessage {
    id: string;
    platform: 'discord' | 'telegram' | 'slack' | 'whatsapp' | 'matrix' | 'web' | 'system';
    channelId: string;
    userId: string;
    userName: string;
    content: string;
    attachments?: Attachment[];
    replyTo?: string;
    metadata?: Record<string, unknown>;
    timestamp: Date;
}
export interface OutgoingMessage {
    channelId: string;
    platform: string;
    content: string;
    embeds?: Embed[];
    files?: FileAttachment[];
    buttons?: Button[];
    replyTo?: string;
    ephemeral?: boolean;
}
export interface ButtonClick {
    buttonId: string;
    userId: string;
    userName: string;
    channelId: string;
    platform: string;
    data?: Record<string, unknown>;
    timestamp: Date;
}
export interface TypingEvent {
    channelId: string;
    platform: string;
}
export interface MessageBusEvents {
    message: IncomingMessage;
    send: OutgoingMessage;
    button_click: ButtonClick;
    typing: TypingEvent;
    error: Error;
}
//# sourceMappingURL=types.d.ts.map