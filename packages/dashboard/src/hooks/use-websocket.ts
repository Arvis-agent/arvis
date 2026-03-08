'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface ChatAttachment {
  filename: string;
  contentType: string;
  /** base64-encoded data */
  data: string;
  /** Preview URL for images (blob URL) */
  previewUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  /** True only for messages received live this session (drives typewriter) */
  isNew?: boolean;
  /** Delivery status for user messages */
  status?: 'sent' | 'delivered' | 'read';
  /** File attachments */
  attachments?: ChatAttachment[];
}

interface UseWebSocketOptions {
  agentId: number;
  channelId?: string;
  userName?: string;
}

interface UseWebSocketReturn {
  messages: ChatMessage[];
  sendMessage: (content: string, attachments?: ChatAttachment[]) => void;
  stopGeneration: () => void;
  isConnected: boolean;
  isTyping: boolean;
  error: string | null;
  clearHistory: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 1000;

function detachHandlers(ws: WebSocket) {
  ws.onopen = null;
  ws.onmessage = null;
  ws.onclose = null;
  ws.onerror = null;
}

export function useWebSocket({
  agentId,
  channelId,
  userName = 'Dashboard User',
}: UseWebSocketOptions): UseWebSocketReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const historyLoaded = useRef(false);
  const userCleared = useRef(false);   // user explicitly hit "Start fresh"
  const effectiveChannel = channelId || `dashboard-agent-${agentId}`;

  // Load history from DB — eagerly on mount, skip if user already cleared
  const loadHistory = useCallback(async () => {
    if (historyLoaded.current || userCleared.current) return;
    try {
      const res = await fetch(`/api/agents/${agentId}/history`);
      if (!res.ok) return;
      const data = await res.json() as { messages: ChatMessage[] };
      historyLoaded.current = true;
      if (data.messages?.length) {
        setMessages(data.messages.map((m) => ({ ...m, isNew: false })));
      }
    } catch {
      // Silently ignore — chat still works without history
      // Don't set historyLoaded so it can retry on reconnect
    }
  }, [agentId]);

  const connect = useCallback(() => {
    if (wsRef.current) {
      detachHandlers(wsRef.current);
      wsRef.current.close();
      wsRef.current = null;
    }

    const port = process.env.NEXT_PUBLIC_CONNECTOR_WEB_PORT || '5070';
    const host = process.env.NEXT_PUBLIC_CONNECTOR_WEB_HOST || 'localhost';

    try {
      const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${protocol}://${host}:${port}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws) return;
        reconnectAttempts.current = 0;
        setError(null);
        ws.send(JSON.stringify({
          type: 'auth',
          userId: `dashboard-${agentId}`,
          userName,
          channelId: effectiveChannel,
        }));
        // Keepalive ping every 30s to prevent silent connection death behind proxies
        if (pingTimer.current) clearInterval(pingTimer.current);
        pingTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30_000);
      };

      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'auth_ok') {
            setIsConnected(true);
            return;
          }

          if (data.type === 'ack') {
            // Server acknowledged receipt — upgrade message status
            setMessages((prev) => {
              const updated = [...prev];
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].role === 'user' && updated[i].status === 'sent') {
                  updated[i] = { ...updated[i], status: 'delivered' };
                  break;
                }
              }
              return updated;
            });
            return;
          }

          if (data.type === 'typing') {
            if (typingTimer.current) clearTimeout(typingTimer.current);
            setIsTyping(true);
            // Safety fallback: hide dots after 3 minutes if no response arrives
            typingTimer.current = setTimeout(() => setIsTyping(false), 180_000);
            return;
          }

          if (data.type === 'message') {
            if (typingTimer.current) { clearTimeout(typingTimer.current); typingTimer.current = null; }
            setIsTyping(false);
            setMessages((prev) => {
              // Mark the last user message as 'read' when bot responds
              const updated = [...prev];
              for (let i = updated.length - 1; i >= 0; i--) {
                if (updated[i].role === 'user' && updated[i].status !== undefined) {
                  updated[i] = { ...updated[i], status: 'read' };
                  break;
                }
              }
              return [
                ...updated,
                {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: data.content,
                  timestamp: data.timestamp || new Date().toISOString(),
                  isNew: true,
                },
              ];
            });
            return;
          }

          if (data.type === 'error') {
            setError(data.error || 'Unknown error');
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = (event) => {
        if (wsRef.current !== ws) return;
        setIsConnected(false);
        wsRef.current = null;

        if (!event.wasClean && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts.current);
          reconnectAttempts.current++;
          reconnectTimeout.current = setTimeout(connect, delay);
        } else if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
          setError('Connection lost. Refresh the page to reconnect.');
        }
      };

      ws.onerror = () => {
        if (wsRef.current !== ws) return;
        setIsConnected(false);
      };
    } catch {
      setError('Failed to connect to chat server');
    }
  }, [agentId, effectiveChannel, userName]);

  useEffect(() => {
    // Load history eagerly (before WS connects) to avoid empty-state flash
    loadHistory();
    connect();

    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      if (pingTimer.current) clearInterval(pingTimer.current);
      if (wsRef.current) {
        detachHandlers(wsRef.current);
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, loadHistory]);

  const sendMessage = useCallback((content: string, attachments?: ChatAttachment[]) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
        isNew: true,
        status: 'sent',
        attachments,
      },
    ]);

    const payload: Record<string, unknown> = { type: 'message', content };
    if (attachments?.length) {
      payload.attachments = attachments.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        data: a.data,
      }));
    }
    wsRef.current.send(JSON.stringify(payload));
  }, []);

  const stopGeneration = useCallback(() => {
    if (typingTimer.current) { clearTimeout(typingTimer.current); typingTimer.current = null; }
    setIsTyping(false);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'stop' }));
    }
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([]);
    userCleared.current = true;   // Prevent re-fetch from DB
    historyLoaded.current = true; // Mark loaded so connect() won't re-fetch either
  }, []);

  return { messages, sendMessage, stopGeneration, isConnected, isTyping, error, clearHistory };
}
