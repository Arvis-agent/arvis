'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Send, Square, Check, CheckCheck, Wifi, WifiOff, Bot, AlertCircle, RotateCcw, Paperclip, X, FileIcon, ImageIcon } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useWebSocket } from '@/hooks/use-websocket';
import type { ChatAttachment } from '@/hooks/use-websocket';
import { cn } from '@/lib/utils';

interface AgentChatProps {
  agentId: number;
  agentName: string;
  compact?: boolean;
}

// ─── Typing Dots ───────────────────────────────────────────────────────────────
// rAF-driven sine wave — no CSS keyframes, no restart, perfectly smooth 60fps.
// Dots are always mounted; parent controls visibility via opacity/max-h.
function TypingDots() {
  const d0 = useRef<HTMLSpanElement>(null);
  const d1 = useRef<HTMLSpanElement>(null);
  const d2 = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const dots = [d0.current, d1.current, d2.current];
    const PERIOD = 2800; // ms per full cycle
    let raf: number;

    function tick(t: number) {
      dots.forEach((dot, i) => {
        if (!dot) return;
        // Phase-offset each dot by 1/3 of the cycle (120°)
        const phase = ((t / PERIOD + i / 3) % 1) * Math.PI * 2;
        // Sine range mapped to 0.25–0.9 opacity
        const opacity = 0.25 + 0.65 * (1 + Math.sin(phase - Math.PI / 2)) / 2;
        dot.style.opacity = opacity.toFixed(3);
      });
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-tl-sm bg-muted/30 border border-border/50">
      <span ref={d0} className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
      <span ref={d1} className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
      <span ref={d2} className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
    </div>
  );
}

// ─── Markdown renderer ─────────────────────────────────────────────────────────
function MdContent({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        code: ({ children, className }) => {
          const isBlock = className?.startsWith('language-');
          return isBlock
            ? <code className="block bg-black/40 rounded-md px-3 py-2 font-mono text-xs mt-1.5 mb-1.5 whitespace-pre-wrap">{children}</code>
            : <code className="bg-black/40 rounded px-1 py-0.5 font-mono text-xs">{children}</code>;
        },
        pre: ({ children }) => <>{children}</>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80">{children}</a>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>,
        h1: ({ children }) => <h1 className="text-base font-semibold mb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-semibold mb-1">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-medium mb-1">{children}</h3>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

// ─── Typewriter ────────────────────────────────────────────────────────────────
// rAF-driven character-by-character reveal. After animation completes, swaps
// to full markdown rendering.
const StreamText = memo(function StreamText({ text, animate }: { text: string; animate: boolean }) {
  const [done, setDone] = useState(!animate);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!animate) { setDone(true); return; }

    setDone(false);
    const el = ref.current;
    if (!el) return;

    el.textContent = '';
    el.classList.add('streaming-cursor');

    let i = 0;
    let rafId: number;
    let lastTime = 0;
    const MS_PER_CHAR = 12; // ~83 chars/sec

    function tick(t: number) {
      if (!lastTime) lastTime = t;
      const charsToAdd = Math.floor((t - lastTime) / MS_PER_CHAR);
      if (charsToAdd > 0) {
        i = Math.min(i + charsToAdd, text.length);
        el!.textContent = text.slice(0, i);
        lastTime = t;
      }
      if (i < text.length) {
        rafId = requestAnimationFrame(tick);
      } else {
        el!.classList.remove('streaming-cursor');
        setDone(true); // swap to markdown
      }
    }

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      if (el) { el.textContent = ''; el.classList.remove('streaming-cursor'); }
    };
  }, [text, animate]);

  if (done) return <MdContent text={text} />;
  return <span ref={ref} className="whitespace-pre-wrap" suppressHydrationWarning />;
});

// ─── Component ─────────────────────────────────────────────────────────────────
export function AgentChat({ agentId, agentName, compact = false }: AgentChatProps) {
  const [input, setInput] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [stagedFiles, setStagedFiles] = useState<ChatAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { messages, sendMessage, stopGeneration, isConnected, isTyping, error, clearHistory } = useWebSocket({ agentId });

  /** Convert a File to ChatAttachment (base64) — chunked to avoid stack overflow */
  const fileToAttachment = useCallback(async (file: File): Promise<ChatAttachment> => {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // Chunked base64 encoding — avoids call stack overflow on large files
    const CHUNK = 0x8000; // 32KB chunks
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
    }
    const data = btoa(binary);
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
    return { filename: file.name, contentType: file.type || 'application/octet-stream', data, previewUrl };
  }, []);

  /** Stage files from input or drop */
  const stageFiles = useCallback(async (files: FileList | File[]) => {
    const newAttachments: ChatAttachment[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) continue; // 10MB limit
      newAttachments.push(await fileToAttachment(file));
    }
    setStagedFiles((prev) => [...prev, ...newAttachments]);
  }, [fileToAttachment]);

  function removeStagedFile(idx: number) {
    setStagedFiles((prev) => {
      const removed = prev[idx];
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }

  const scrollToBottom = () => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  };

  // Always scroll to bottom when a new message is added (sent or received).
  // Double-RAF ensures React has committed + painted before we measure scrollHeight.
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(scrollToBottom));
  }, [messages.length]);

  // Scroll to reveal typing dots when they appear
  useEffect(() => {
    if (isTyping) requestAnimationFrame(() => requestAnimationFrame(scrollToBottom));
  }, [isTyping]);

  // MutationObserver keeps view pinned during typewriter animation (character writes)
  // — only fires when already near the bottom so reading history isn't disrupted.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const mo = new MutationObserver(() => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
        el.scrollTop = el.scrollHeight;
      }
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => mo.disconnect();
  }, []);

  useEffect(() => { if (isConnected) textareaRef.current?.focus(); }, [isConnected]);

  function handleSend() {
    const trimmed = input.trim();
    if ((!trimmed && stagedFiles.length === 0) || !isConnected) return;
    const content = trimmed || (stagedFiles.length > 0 ? `[${stagedFiles.map(f => f.filename).join(', ')}]` : '');
    sendMessage(content, stagedFiles.length > 0 ? stagedFiles : undefined);
    setInput('');
    // Revoke blob URLs before clearing staged files
    stagedFiles.forEach((f) => { if (f.previewUrl) URL.revokeObjectURL(f.previewUrl); });
    setStagedFiles([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
  }

  function handleConfirmClear() {
    clearHistory();
    setConfirmClear(false);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between border-b border-border px-5 py-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-6 rounded-md border border-border flex items-center justify-center">
              <Bot className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <span className="text-sm font-medium">{agentName}</span>
          </div>
          <div className="flex items-center gap-3">
            {confirmClear ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Start fresh?</span>
                <button
                  onClick={handleConfirmClear}
                  className="font-medium text-red-400 hover:text-red-300 transition-colors"
                >
                  Clear history
                </button>
                <span className="text-border/60">·</span>
                <button
                  onClick={() => setConfirmClear(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Keep it
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmClear(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                New chat
              </button>
            )}
            <span className={cn('flex items-center gap-1.5 text-xs', isConnected ? 'text-emerald-500' : 'text-muted-foreground/50')}>
              {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {isConnected ? 'Connected' : 'Offline'}
            </span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/5 px-5 py-2 text-xs text-red-400 shrink-0">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        className={cn('flex-1 overflow-y-auto flex flex-col relative', isDragging && 'ring-2 ring-primary/50 ring-inset')}
        onDragOver={(e) => { e.preventDefault(); }}
        onDragEnter={(e) => { e.preventDefault(); dragCounter.current++; setIsDragging(true); }}
        onDragLeave={() => { dragCounter.current--; if (dragCounter.current === 0) setIsDragging(false); }}
        onDrop={async (e) => { e.preventDefault(); dragCounter.current = 0; setIsDragging(false); if (e.dataTransfer.files.length) await stageFiles(e.dataTransfer.files); }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
            <div className="h-10 w-10 rounded-xl border border-border flex items-center justify-center">
              <Bot className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Chat with {agentName}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {isConnected ? 'Send a message to get started' : 'Connecting to agent...'}
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-auto px-5 py-5 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn('flex flex-col', msg.role === 'user' ? 'items-end' : 'items-start')}
              >
                <div className={cn('flex gap-3 max-w-[75%]', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                  {msg.role === 'assistant' && (
                    <div className="h-6 w-6 rounded-md border border-border flex items-center justify-center shrink-0 mt-1">
                      <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'text-sm leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-2xl rounded-tr-sm'
                        : 'bg-muted/30 border border-border/50 text-foreground px-4 py-2.5 rounded-2xl rounded-tl-sm',
                    )}
                    style={msg.isNew ? { animation: 'msg-in 0.2s ease-out both' } : undefined}
                  >
                    {msg.role === 'assistant'
                      ? <StreamText text={msg.content} animate={!!msg.isNew} />
                      : <p className="whitespace-pre-wrap">{msg.content}</p>
                    }
                    {/* Attachment thumbnails */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {msg.attachments.map((att, i) => (
                          <div key={i} className="flex items-center gap-1.5 bg-black/20 rounded px-2 py-1">
                            {att.contentType.startsWith('image/') ? (
                              att.previewUrl ? (
                                <img src={att.previewUrl} alt={att.filename} className="h-8 w-8 rounded object-cover" />
                              ) : (
                                <ImageIcon className="h-3.5 w-3.5 opacity-60" />
                              )
                            ) : (
                              <FileIcon className="h-3.5 w-3.5 opacity-60" />
                            )}
                            <span className="text-[10px] opacity-70 max-w-[100px] truncate">{att.filename}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className={cn('mt-1.5 flex items-center gap-1', msg.role === 'assistant' && 'pl-9')}>
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground/40">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {msg.role === 'user' && msg.status === 'sent' && (
                    <Check className="h-3 w-3 text-muted-foreground/40" />
                  )}
                  {msg.role === 'user' && msg.status === 'delivered' && (
                    <CheckCheck className="h-3 w-3 text-muted-foreground/50" />
                  )}
                  {msg.role === 'user' && msg.status === 'read' && (
                    <CheckCheck className="h-3 w-3 text-primary" />
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator — always in DOM, rAF runs continuously, no restart on show/hide */}
            <div
              className={cn(
                'flex gap-3 items-center overflow-hidden transition-all duration-200',
                isTyping ? 'opacity-100 max-h-16' : 'opacity-0 max-h-0 pointer-events-none',
              )}
            >
              <div className="h-6 w-6 rounded-md border border-border flex items-center justify-center shrink-0">
                <Bot className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <TypingDots />
            </div>

          </div>
        )}
      </div>

      {/* Staged files */}
      {stagedFiles.length > 0 && (
        <div className="px-4 pt-2 shrink-0 flex flex-wrap gap-1.5 border-t border-border/50">
          {stagedFiles.map((file, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-muted/30 border border-border/50 rounded-md px-2 py-1 text-xs">
              {file.contentType.startsWith('image/') && file.previewUrl ? (
                <img src={file.previewUrl} alt={file.filename} className="h-5 w-5 rounded object-cover" />
              ) : file.contentType.startsWith('image/') ? (
                <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <FileIcon className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="max-w-[120px] truncate text-muted-foreground">{file.filename}</span>
              <button onClick={() => removeStagedFile(i)} className="text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className={cn('px-4 py-3 shrink-0 flex items-end gap-2', !compact && 'border-t border-border')}>
        {compact && (
          <span className={cn('mb-2.5 h-1.5 w-1.5 shrink-0 rounded-full', isConnected ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
        )}
        {/* Paperclip — file upload */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={async (e) => { if (e.target.files?.length) { await stageFiles(e.target.files); e.target.value = ''; } }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!isConnected}
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Attach files"
        >
          <Paperclip className="h-3.5 w-3.5" />
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={isConnected ? `Message ${agentName}...` : 'Connecting...'}
          disabled={!isConnected}
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-lg border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground bg-transparent focus:outline-none focus:border-primary/50 transition-colors min-h-[38px] max-h-[160px] disabled:opacity-40 disabled:cursor-not-allowed',
            isConnected ? 'border-border' : 'border-border/50',
          )}
        />
        {isTyping ? (
          <button
            onClick={stopGeneration}
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
            title="Stop generation"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!isConnected || (!input.trim() && stagedFiles.length === 0)}
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
