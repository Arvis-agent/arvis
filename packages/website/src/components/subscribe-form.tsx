'use client';

import { useState } from 'react';

export function SubscribeForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setErrorMsg('Enter a valid email address.');
      setState('error');
      return;
    }
    setState('loading');
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Something went wrong');
      }
      setState('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
      setState('error');
    }
  };

  if (state === 'success') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          justifyContent: 'center',
          padding: '12px 20px',
          background: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: 10,
          color: '#22c55e',
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        <span>✓</span>
        <span>You&apos;re on the list! We&apos;ll notify you of new releases.</span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 460, flexWrap: 'wrap', justifyContent: 'center' }}>
        <input
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setState('idle'); }}
          placeholder="your@email.com"
          required
          style={{
            flex: 1,
            minWidth: 200,
            padding: '11px 16px',
            background: '#000000',
            border: '1px solid #1a1a1f',
            borderRadius: 8,
            color: '#e4e4e7',
            fontSize: 14,
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = '#8B5CF6')}
          onBlur={e => (e.currentTarget.style.borderColor = '#1a1a1f')}
        />
        <button
          type="submit"
          disabled={state === 'loading'}
          style={{
            padding: '11px 22px',
            background: state === 'loading' ? '#6D28D9' : '#8B5CF6',
            color: '#000000',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: state === 'loading' ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { if (state !== 'loading') e.currentTarget.style.background = '#6D28D9'; }}
          onMouseLeave={e => { if (state !== 'loading') e.currentTarget.style.background = '#8B5CF6'; }}
        >
          {state === 'loading' ? 'Subscribing...' : 'Notify me'}
        </button>
      </div>

      {state === 'error' && (
        <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{errorMsg}</p>
      )}

      <p style={{ color: '#63636e', fontSize: 12, margin: 0 }}>
        No spam. Just release announcements. Unsubscribe anytime.
      </p>
    </form>
  );
}
