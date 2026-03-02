import { describe, it, expect, vi } from 'vitest';
import { MessageBus } from '../../src/bus/message-bus.js';
import type { IncomingMessage, OutgoingMessage, ButtonClick } from '../../src/bus/types.js';

function makeIncomingMessage(overrides?: Partial<IncomingMessage>): IncomingMessage {
  return {
    id: 'msg-1',
    platform: 'discord',
    channelId: 'chan-1',
    userId: 'user-1',
    userName: 'TestUser',
    content: 'hello',
    timestamp: new Date(),
    ...overrides,
  };
}

describe('MessageBus', () => {
  it('emits and receives message events', () => {
    const bus = new MessageBus();
    const handler = vi.fn();
    const msg = makeIncomingMessage();

    bus.on('message', handler);
    bus.emit('message', msg);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(msg);
  });

  it('emits and receives send events', () => {
    const bus = new MessageBus();
    const handler = vi.fn();
    const outgoing: OutgoingMessage = {
      channelId: 'chan-1',
      platform: 'discord',
      content: 'response',
    };

    bus.on('send', handler);
    bus.emit('send', outgoing);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(outgoing);
  });

  it('emits and receives button_click events', () => {
    const bus = new MessageBus();
    const handler = vi.fn();
    const click: ButtonClick = {
      buttonId: 'btn-1',
      userId: 'user-1',
      userName: 'TestUser',
      channelId: 'chan-1',
      platform: 'discord',
      timestamp: new Date(),
    };

    bus.on('button_click', handler);
    bus.emit('button_click', click);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(click);
  });

  it('emits and receives typing events', () => {
    const bus = new MessageBus();
    const handler = vi.fn();

    bus.on('typing', handler);
    bus.sendTyping('chan-1', 'discord');

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ channelId: 'chan-1', platform: 'discord' });
  });

  it('multiple listeners receive the same event', () => {
    const bus = new MessageBus();
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    const handler3 = vi.fn();
    const msg = makeIncomingMessage();

    bus.on('message', handler1);
    bus.on('message', handler2);
    bus.on('message', handler3);
    bus.emit('message', msg);

    expect(handler1).toHaveBeenCalledOnce();
    expect(handler2).toHaveBeenCalledOnce();
    expect(handler3).toHaveBeenCalledOnce();
  });

  it('once listener fires only once', () => {
    const bus = new MessageBus();
    const handler = vi.fn();
    const msg = makeIncomingMessage();

    bus.once('message', handler);
    bus.emit('message', msg);
    bus.emit('message', msg);

    expect(handler).toHaveBeenCalledOnce();
  });

  it('off removes listener', () => {
    const bus = new MessageBus();
    const handler = vi.fn();
    const msg = makeIncomingMessage();

    bus.on('message', handler);
    bus.off('message', handler);
    bus.emit('message', msg);

    expect(handler).not.toHaveBeenCalled();
  });

  it('reply sets correct channelId, platform, and replyTo', () => {
    const bus = new MessageBus();
    const handler = vi.fn();
    const original = makeIncomingMessage({ id: 'orig-1', channelId: 'chan-5', platform: 'telegram' });

    bus.on('send', handler);
    bus.reply(original, 'reply content');

    expect(handler).toHaveBeenCalledOnce();
    const sent: OutgoingMessage = handler.mock.calls[0][0];
    expect(sent.channelId).toBe('chan-5');
    expect(sent.platform).toBe('telegram');
    expect(sent.content).toBe('reply content');
    expect(sent.replyTo).toBe('orig-1');
  });

  it('reply merges options', () => {
    const bus = new MessageBus();
    const handler = vi.fn();
    const original = makeIncomingMessage();

    bus.on('send', handler);
    bus.reply(original, 'reply', {
      embeds: [{ title: 'Test' }],
      ephemeral: true,
    });

    const sent: OutgoingMessage = handler.mock.calls[0][0];
    expect(sent.embeds).toEqual([{ title: 'Test' }]);
    expect(sent.ephemeral).toBe(true);
  });

  it('error events are emitted via emitError', () => {
    const bus = new MessageBus();
    const handler = vi.fn();
    const error = new Error('test error');

    bus.on('error', handler);
    bus.emitError(error);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(error);
  });
});
