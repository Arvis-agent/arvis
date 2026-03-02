import type { ReactNode } from 'react';
import { SubscribeForm } from '@/components/subscribe-form';
import {
  ZapIcon, RefreshIcon, LayersIcon, TrendingUpIcon, ListChecksIcon, GitForkIcon,
  GithubIcon, DiscordIcon, TelegramIcon, SlackIcon, WhatsAppIcon, MatrixIcon,
  GlobeIcon, MessageIcon, MailIcon, RocketIcon,
} from '@/components/icons';

const GITHUB_URL = 'https://github.com/Arvis-agent/arvis';

export default function Home() {
  return (
    <main>
      <HeroSection />
      <TrustBar />
      <SubscriptionSpotlight />
      <FeaturesSection />
      <WhyArvisSection />
      <HowItWorks />
      <ProvidersSection />
      <QuickStartSection />
      <CTASection />
    </main>
  );
}

/* ─────────────────────────────────────────────
   HERO
───────────────────────────────────────────── */
function HeroSection() {
  return (
    <section
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '120px 24px 80px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Glow orb */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '20%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 700,
          height: 400,
          background: 'radial-gradient(ellipse, rgba(139,92,246,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ maxWidth: 1100, width: '100%', margin: '0 auto', textAlign: 'center', position: 'relative' }}>
        {/* Badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(139,92,246,0.1)',
            border: '1px solid rgba(139,92,246,0.3)',
            borderRadius: 999,
            padding: '6px 16px',
            marginBottom: 32,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8B5CF6', display: 'inline-block' }} />
          <span style={{ color: '#a78bfa', fontSize: 13, fontWeight: 500 }}>Open source · MIT licensed · v3</span>
        </div>

        {/* Headline */}
        <h1
          style={{
            fontSize: 'clamp(38px, 6vw, 72px)',
            fontWeight: 900,
            letterSpacing: '-0.04em',
            lineHeight: 1.05,
            marginBottom: 24,
          }}
        >
          <span className="text-gradient">Route every message</span>
          <br />
          <span style={{ color: '#e4e4e7' }}>to the right AI agent.</span>
        </h1>

        {/* Sub */}
        <p
          style={{
            fontSize: 'clamp(16px, 2.5vw, 20px)',
            color: '#63636e',
            maxWidth: 580,
            margin: '0 auto 40px',
            lineHeight: 1.6,
          }}
        >
          Self-hosted platform connecting Discord, Telegram, Slack, WhatsApp —
          and any messaging app — to teams of specialized AI agents.
          Silent failover. Automatic memory. Full cost tracking.
        </p>

        {/* CTAs */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 64 }}>
          <PrimaryButton href={GITHUB_URL} external>
            <GithubIcon size={16} />
            Star on GitHub
          </PrimaryButton>
          <SecondaryButton href="/docs">
            Read the docs →
          </SecondaryButton>
        </div>

        {/* Terminal mockup */}
        <TerminalWindow />
      </div>
    </section>
  );
}

function TerminalWindow() {
  const lines: { label: string; value?: string; valueColor?: string }[] = [
    { label: 'Core started' },
    { label: 'Discord connector', value: 'online', valueColor: '#63636e' },
    { label: 'Telegram connector', value: 'online', valueColor: '#63636e' },
    { label: '4 agents loaded', value: 'support · analyst · coder · conductor', valueColor: '#8B5CF6' },
    { label: 'Dashboard ready', value: 'http://localhost:5100', valueColor: '#a78bfa' },
  ];

  return (
    <div
      className="glow-purple"
      style={{
        maxWidth: 640,
        margin: '0 auto',
        background: '#09090b',
        border: '1px solid #1a1a1f',
        borderRadius: 14,
        overflow: 'hidden',
        textAlign: 'left',
      }}
    >
      {/* Title bar */}
      <div
        style={{
          background: '#111115',
          borderBottom: '1px solid #1a1a1f',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
        <span style={{ color: '#63636e', fontSize: 12, marginLeft: 10, fontFamily: 'var(--font-geist-mono), monospace' }}>
          npx arvis
        </span>
      </div>

      {/* Content */}
      <div
        style={{
          padding: '22px 26px 26px',
          fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
          fontSize: 13,
          lineHeight: 1.8,
        }}
      >
        {/* Logo line */}
        <div style={{ marginBottom: 18, display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ color: '#8B5CF6', fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em' }}>&gt;_&lt;</span>
          <span style={{ color: '#e4e4e7', fontWeight: 600 }}>arvis</span>
          <span style={{ color: '#1a1a1f', fontSize: 12, fontWeight: 700, WebkitTextStroke: '1px #3f3f46' }}>v3</span>
          <span style={{ color: '#63636e', fontSize: 12 }}>self-hosted AI agent platform</span>
        </div>

        {/* Status lines */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {lines.map((line, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <span style={{ color: '#22c55e', marginRight: 10, flexShrink: 0 }}>✓</span>
              <span style={{ color: '#e4e4e7', marginRight: line.value ? 8 : 0 }}>{line.label}</span>
              {line.value && (
                <span style={{ color: line.valueColor ?? '#63636e' }}>{line.value}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   TRUST BAR
───────────────────────────────────────────── */
function TrustBar() {
  const items = [
    { value: '8', label: 'Platforms' },
    { value: '7', label: 'LLM providers' },
    { value: 'MIT', label: 'Licensed' },
    { value: '100%', label: 'Self-hosted' },
    { value: 'TS', label: 'TypeScript' },
    { value: '0', label: 'Lock-in' },
  ];

  return (
    <div style={{ borderTop: '1px solid #1a1a1f', borderBottom: '1px solid #1a1a1f', background: 'rgba(9,9,11,0.6)' }}>
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 0,
        }}
      >
        {items.map((item, i) => (
          <div
            key={item.label}
            style={{
              padding: '20px 32px',
              textAlign: 'center',
              borderRight: i < items.length - 1 ? '1px solid #1a1a1f' : 'none',
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 800, color: '#8B5CF6', letterSpacing: '-0.02em', fontFamily: 'monospace' }}>
              {item.value}
            </div>
            <div style={{ fontSize: 12, color: '#63636e', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SUBSCRIPTION SPOTLIGHT
───────────────────────────────────────────── */
function SubscriptionSpotlight() {
  return (
    <section
      style={{
        padding: '80px 24px',
        background: 'linear-gradient(135deg, rgba(217,119,6,0.06) 0%, rgba(139,92,246,0.06) 50%, rgba(0,0,0,0) 100%)',
        borderTop: '1px solid rgba(217,119,6,0.15)',
        borderBottom: '1px solid rgba(217,119,6,0.15)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background glow */}
      <div aria-hidden style={{
        position: 'absolute', top: '50%', left: '30%',
        transform: 'translate(-50%, -50%)',
        width: 600, height: 300,
        background: 'radial-gradient(ellipse, rgba(217,119,6,0.07) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ maxWidth: 1200, margin: '0 auto', position: 'relative' }}>

        {/* Label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(217,119,6,0.12)', border: '1px solid rgba(217,119,6,0.3)',
            borderRadius: 999, padding: '4px 12px',
            color: '#f59e0b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            <span>★</span> Unique feature
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
          {/* Left — Copy */}
          <div>
            <h2 style={{
              fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900,
              letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 20,
            }}>
              <span style={{ color: '#f59e0b' }}>No API bills.</span>
              <br />
              <span style={{ color: '#e4e4e7' }}>Run on your Claude subscription.</span>
            </h2>
            <p style={{ fontSize: 16, color: '#71717a', lineHeight: 1.7, marginBottom: 32, maxWidth: 480 }}>
              Arvis runs agents through the <strong style={{ color: '#a1a1aa' }}>Claude CLI</strong> — meaning
              your <strong style={{ color: '#a1a1aa' }}>Claude Pro ($20/mo)</strong> or <strong style={{ color: '#a1a1aa' }}>Max ($100/mo)</strong> subscription
              covers your entire agent fleet. No per-token costs. No surprise bills.
              Stack multiple accounts for even more throughput.
            </p>

            {/* Comparison */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>
              <div style={{
                background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)',
                borderRadius: 10, padding: '20px',
              }}>
                <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                  API Keys
                </div>
                {['$0.015 per 1K tokens', 'Bills spike with usage', 'Budget surprises', 'Rate limits hit hard'].map((item) => (
                  <div key={item} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 13, color: '#71717a' }}>
                    <span style={{ color: '#ef4444', flexShrink: 0 }}>✗</span>{item}
                  </div>
                ))}
              </div>
              <div style={{
                background: 'rgba(217,119,6,0.05)', border: '1px solid rgba(217,119,6,0.25)',
                borderRadius: 10, padding: '20px',
              }}>
                <div style={{ color: '#f59e0b', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                  Subscription
                </div>
                {['Flat $20–$100/mo', 'Zero per-token cost', 'Predictable spend', 'Stack accounts freely'].map((item) => (
                  <div key={item} style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 13, color: '#a1a1aa' }}>
                    <span style={{ color: '#22c55e', flexShrink: 0 }}>✓</span>{item}
                  </div>
                ))}
              </div>
            </div>

            <p style={{ fontSize: 13, color: '#52525b', lineHeight: 1.6 }}>
              Works alongside API keys — Arvis silently rotates between subscription
              accounts and API keys based on priority and rate limits.
            </p>
          </div>

          {/* Right — Terminal */}
          <div>
            <div style={{
              background: '#09090b', border: '1px solid rgba(217,119,6,0.2)',
              borderRadius: 12, overflow: 'hidden',
              boxShadow: '0 0 40px rgba(217,119,6,0.08)',
            }}>
              <div style={{
                background: '#111115', borderBottom: '1px solid #1a1a1f',
                padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
                <span style={{ color: '#52525b', fontSize: 12, marginLeft: 8, fontFamily: 'monospace' }}>.env</span>
              </div>
              <pre style={{
                margin: 0, padding: '24px',
                fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
                fontSize: 13, lineHeight: 2, overflowX: 'auto',
              }}>
                {[
                  ['# Account 1 — Claude Pro', '#52525b'],
                  ['CLAUDE_CLI_HOME=/home/arvis/acc1', '#e4e4e7'],
                  ['', ''],
                  ['# Account 2 — Claude Max', '#52525b'],
                  ['CLAUDE_CLI_HOME_1=/home/arvis/acc2', '#e4e4e7'],
                  ['', ''],
                  ['# Account 3 — API key fallback', '#52525b'],
                  ['ANTHROPIC_API_KEY=sk-ant-...', '#e4e4e7'],
                  ['', ''],
                  ['# Model to use for CLI accounts', '#52525b'],
                  ['CLAUDE_CLI_MODEL=claude-sonnet-4-6', '#f59e0b'],
                ].map(([line, color], i) => (
                  <span key={i} style={{ display: 'block', color: color as string }}>{line || '\u200b'}</span>
                ))}
              </pre>
              <div style={{
                borderTop: '1px solid #1a1a1f', padding: '12px 24px',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
                <span style={{ fontSize: 12, color: '#52525b', fontFamily: 'monospace' }}>
                  3 accounts loaded — 2 subscription, 1 API key
                </span>
              </div>
            </div>

            <div style={{ marginTop: 16, padding: '14px 20px', background: 'rgba(217,119,6,0.05)', border: '1px solid rgba(217,119,6,0.15)', borderRadius: 8 }}>
              <p style={{ fontSize: 13, color: '#a1a1aa', lineHeight: 1.6, margin: 0 }}>
                <strong style={{ color: '#f59e0b' }}>One-time setup:</strong> Run{' '}
                <code style={{ fontFamily: 'monospace', color: '#e4e4e7', background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4 }}>
                  HOME=/home/arvis/acc1 claude login
                </code>{' '}
                for each account. Arvis handles rotation automatically.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   FEATURES
───────────────────────────────────────────── */
const FEATURES: { icon: ReactNode; title: string; desc: string }[] = [
  {
    icon: <ZapIcon size={22} />,
    title: 'Multi-platform routing',
    desc: 'Discord, Telegram, Slack, WhatsApp, Matrix, Web, SMS, Email — every message lands at the right agent automatically.',
  },
  {
    icon: <RefreshIcon size={22} />,
    title: 'Silent failover',
    desc: 'Rate limit hit on Anthropic? Arvis silently switches to your next account. Users never see an error. Ever.',
  },
  {
    icon: <LayersIcon size={22} />,
    title: 'Conversation memory',
    desc: 'Sticky facts persist across sessions. Context is auto-compacted when it grows large. Every agent remembers what matters.',
  },
  {
    icon: <TrendingUpIcon size={22} />,
    title: 'Cost tracking',
    desc: 'Per-agent, per-provider, per-model cost breakdown. Know exactly what each conversation costs across all your LLM accounts.',
  },
  {
    icon: <ListChecksIcon size={22} />,
    title: 'Job queue + scheduler',
    desc: 'Priority queue with automatic retries. Cron and heartbeat workflows. Stuck job recovery. Everything visible in the dashboard.',
  },
  {
    icon: <GitForkIcon size={22} />,
    title: 'Agent delegation',
    desc: 'Agents spawn sub-agents for parallel work using simple DELEGATE markers. Build pipelines without writing orchestration code.',
  },
];

function FeaturesSection() {
  return (
    <section id="features" style={{ padding: '96px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionLabel>Features</SectionLabel>
        <h2 className="section-title text-gradient" style={{ maxWidth: 480 }}>
          Everything an agent platform needs.
        </h2>
        <p className="section-sub">
          Arvis handles the hard parts — routing, memory, failover, cost, queuing — so you just define agents and connect platforms.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 16,
            marginTop: 56,
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="card-hover"
              style={{
                background: '#09090b',
                border: '1px solid #1a1a1f',
                borderRadius: 12,
                padding: '28px',
              }}
            >
              <div style={{ color: '#8B5CF6', marginBottom: 14 }}>{f.icon}</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#e4e4e7', marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 14, color: '#63636e', lineHeight: 1.65 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   WHY ARVIS
───────────────────────────────────────────── */
function WhyArvisSection() {
  const problems = [
    'Rate limit hits → users see 500 errors',
    'Bot crashes → conversation history wiped',
    'N bots → N dashboards to manage',
    'No idea what your agents are doing',
    'Context limits hit → quality drops silently',
    'New provider = rewrite your whole stack',
  ];
  const solutions = [
    'Rate limit → silently switch account',
    'Job queue → retry with full history',
    'All bots → one dashboard',
    'Real-time queue monitor + logs',
    'Auto-compaction keeps context fresh',
    'Add provider = one new config entry',
  ];

  return (
    <section
      style={{
        padding: '96px 24px',
        background: 'linear-gradient(180deg, rgba(139,92,246,0.03) 0%, transparent 100%)',
        borderTop: '1px solid #1a1a1f',
        borderBottom: '1px solid #1a1a1f',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionLabel>Why Arvis</SectionLabel>
        <h2 className="section-title" style={{ marginBottom: 56 }}>
          <span style={{ color: '#e4e4e7' }}>Stop fighting your bots.</span>
          <br />
          <span className="text-gradient-purple">Start shipping agents.</span>
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Without */}
          <div
            style={{
              background: '#09090b',
              border: '1px solid #1a1a1f',
              borderRadius: 12,
              padding: '32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <span style={{ color: '#ef4444', display: 'inline-flex' }}>
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m15 9-6 6M9 9l6 6" />
                </svg>
              </span>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#63636e' }}>Without Arvis</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {problems.map((p) => (
                <div key={p} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, fontSize: 14, color: '#63636e' }}>
                  <span style={{ color: '#ef4444', flexShrink: 0, marginTop: 1 }}>✗</span>
                  <span>{p}</span>
                </div>
              ))}
            </div>
          </div>

          {/* With */}
          <div
            style={{
              background: 'rgba(139,92,246,0.04)',
              border: '1px solid rgba(139,92,246,0.2)',
              borderRadius: 12,
              padding: '32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <span style={{ color: '#8B5CF6', display: 'inline-flex' }}>
                <RocketIcon size={20} />
              </span>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#a78bfa' }}>With Arvis</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {solutions.map((s) => (
                <div key={s} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, fontSize: 14, color: '#a78bfa' }}>
                  <span style={{ color: '#22c55e', flexShrink: 0, marginTop: 1 }}>✓</span>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   HOW IT WORKS
───────────────────────────────────────────── */
const STEPS = [
  {
    step: '01',
    title: 'Connect your platforms',
    desc: 'Add Discord, Telegram, Slack, or WhatsApp tokens in .env. Connectors start automatically.',
  },
  {
    step: '02',
    title: 'Define your agents',
    desc: 'Create specialist agents — support, analyst, coder, creative. Each with their own system prompt, model, and tools.',
  },
  {
    step: '03',
    title: 'Messages route automatically',
    desc: 'Arvis reads each message and picks the right agent based on platform, channel, keyword, or agent rules.',
  },
  {
    step: '04',
    title: 'Monitor everything',
    desc: 'Real-time dashboard shows every job, conversation, cost, and log. No black boxes.',
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" style={{ padding: '96px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionLabel>How it works</SectionLabel>
        <h2 className="section-title text-gradient" style={{ maxWidth: 480, marginBottom: 56 }}>
          Up and running in 4 steps.
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, position: 'relative' }}>
          {STEPS.map((s) => (
            <div
              key={s.step}
              className="card-hover"
              style={{
                background: '#09090b',
                border: '1px solid #1a1a1f',
                borderRadius: 12,
                padding: '28px',
              }}
            >
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 28,
                  fontWeight: 900,
                  color: '#1a1a1f',
                  marginBottom: 16,
                  WebkitTextStroke: '1px rgba(139,92,246,0.4)',
                }}
              >
                {s.step}
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e4e4e7', marginBottom: 10 }}>{s.title}</h3>
              <p style={{ fontSize: 14, color: '#63636e', lineHeight: 1.65 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   PROVIDERS + CONNECTORS
───────────────────────────────────────────── */
function ProvidersSection() {
  const providers: { name: string; sub: string; color: string; badge?: string; featured?: boolean }[] = [
    { name: 'Claude CLI',  sub: 'Pro & Max subscription — no API cost', color: '#f59e0b', badge: '★ No API cost', featured: true },
    { name: 'Anthropic',   sub: 'claude-haiku/sonnet/opus',              color: '#d4a853' },
    { name: 'OpenAI',      sub: 'gpt-4.1, gpt-4.1-mini, o4',            color: '#10a37f' },
    { name: 'Google',      sub: 'gemini-2.5 pro + flash',                color: '#4285f4' },
    { name: 'Ollama',      sub: 'any local model, zero cost',            color: '#a78bfa' },
    { name: 'OpenRouter',  sub: '100+ models, one key',                  color: '#f97316' },
    { name: 'Custom API',  sub: 'any OpenAI-compatible URL',             color: '#63636e' },
  ];

  const platforms: { name: string; icon: ReactNode }[] = [
    { name: 'Discord',  icon: <DiscordIcon size={18} /> },
    { name: 'Telegram', icon: <TelegramIcon size={18} /> },
    { name: 'Slack',    icon: <SlackIcon size={18} /> },
    { name: 'WhatsApp', icon: <WhatsAppIcon size={18} /> },
    { name: 'Matrix',   icon: <MatrixIcon size={18} /> },
    { name: 'Web',      icon: <GlobeIcon size={18} /> },
    { name: 'SMS',      icon: <MessageIcon size={18} /> },
    { name: 'Email',    icon: <MailIcon size={18} /> },
  ];

  return (
    <section
      style={{
        padding: '96px 24px',
        borderTop: '1px solid #1a1a1f',
        background: 'rgba(9,9,11,0.5)',
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* LLM Providers */}
        <div style={{ marginBottom: 72 }}>
          <SectionLabel>LLM Providers</SectionLabel>
          <h2 className="section-title" style={{ marginBottom: 8 }}>
            <span style={{ color: '#e4e4e7' }}>Every major provider.</span>
          </h2>
          <p className="section-sub" style={{ marginBottom: 40 }}>
            Use your <strong style={{ color: '#f59e0b' }}>Claude subscription</strong> (zero per-token cost) or any API key.
            Multiple accounts per provider — Arvis rotates silently on rate limits.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {providers.map((p) => (
              <div
                key={p.name}
                className="card-hover"
                style={{
                  background: p.featured ? 'rgba(217,119,6,0.05)' : '#09090b',
                  border: p.featured ? '1px solid rgba(217,119,6,0.3)' : '1px solid #1a1a1f',
                  borderRadius: 10,
                  padding: '16px 20px',
                  minWidth: 160,
                  position: 'relative',
                }}
              >
                {p.badge && (
                  <div style={{
                    position: 'absolute', top: -10, right: 10,
                    background: '#f59e0b', color: '#000',
                    fontSize: 10, fontWeight: 800, padding: '2px 8px',
                    borderRadius: 999, letterSpacing: '0.04em',
                  }}>
                    {p.badge}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: p.featured ? '#fbbf24' : '#e4e4e7' }}>{p.name}</span>
                </div>
                <p style={{ fontSize: 12, color: p.featured ? '#92400e' : '#63636e', marginLeft: 16,
                  ...(p.featured ? { color: '#a16207' } : {}) }}>{p.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Platforms */}
        <div>
          <SectionLabel>Platforms</SectionLabel>
          <h2 className="section-title" style={{ marginBottom: 8 }}>
            <span style={{ color: '#e4e4e7' }}>Every messaging platform.</span>
          </h2>
          <p className="section-sub" style={{ marginBottom: 40 }}>
            One agent stack, every platform. Add connectors by setting env vars — no code required.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {platforms.map((p) => (
              <div
                key={p.name}
                className="card-hover"
                style={{
                  background: '#09090b',
                  border: '1px solid #1a1a1f',
                  borderRadius: 10,
                  padding: '14px 22px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span style={{ color: '#8B5CF6', display: 'inline-flex' }}>{p.icon}</span>
                <span style={{ fontWeight: 600, fontSize: 14, color: '#e4e4e7' }}>{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   QUICK START
───────────────────────────────────────────── */
function QuickStartSection() {
  const steps = [
    {
      title: '1. Clone and install',
      code: `git clone https://github.com/Arvis-agent/arvis\ncd arvis && npm install`,
    },
    {
      title: '2. Configure (pick one)',
      code: `cp .env.example .env\n\n# Option A — Claude subscription (no API cost):\nHOME=/opt/arvis/acc1 claude login\nCLAUDE_CLI_HOME=/opt/arvis/acc1\n\n# Option B — API key:\nANTHROPIC_API_KEY=sk-ant-...`,
    },
    {
      title: '3. Start',
      code: `npm start\n# Dashboard → http://localhost:5100`,
    },
    {
      title: '4. Or Docker (easiest for VPS)',
      code: `docker-compose up -d\n# Core + dashboard start together`,
    },
  ];

  return (
    <section style={{ padding: '96px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <SectionLabel>Quick start</SectionLabel>
        <h2 className="section-title text-gradient" style={{ maxWidth: 460, marginBottom: 16 }}>
          Running in under 5 minutes.
        </h2>
        <p className="section-sub" style={{ marginBottom: 52 }}>
          Node 20+, one API key <em>or</em> a Claude subscription. Done.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {steps.map((s) => (
            <div
              key={s.title}
              style={{
                background: '#09090b',
                border: '1px solid #1a1a1f',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  background: '#111115',
                  borderBottom: '1px solid #1a1a1f',
                  padding: '10px 16px',
                  fontSize: 12,
                  color: '#63636e',
                  fontWeight: 600,
                }}
              >
                {s.title}
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: '20px',
                  fontSize: 13,
                  fontFamily: 'var(--font-geist-mono), monospace',
                  lineHeight: 1.75,
                  color: '#a78bfa',
                  overflowX: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {s.code.split('\n').map((line, i) => (
                  <span key={i}>
                    {line.startsWith('#')
                      ? <span style={{ color: '#63636e' }}>{line}</span>
                      : <span style={{ color: '#e4e4e7' }}>{line}</span>
                    }
                    {'\n'}
                  </span>
                ))}
              </pre>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 32, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <SecondaryButton href="/docs">Read full setup guide →</SecondaryButton>
          <SecondaryButton href="/docs">Deployment guide →</SecondaryButton>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   CTA + SUBSCRIBE
───────────────────────────────────────────── */
function CTASection() {
  return (
    <section
      style={{
        padding: '96px 24px',
        borderTop: '1px solid #1a1a1f',
        background: 'linear-gradient(180deg, rgba(139,92,246,0.04) 0%, #000000 100%)',
      }}
    >
      <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
        {/* Star badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(139,92,246,0.08)',
            border: '1px solid rgba(139,92,246,0.2)',
            borderRadius: 999,
            padding: '6px 16px',
            marginBottom: 32,
          }}
        >
          <span style={{ color: '#f59e0b' }}>★</span>
          <span style={{ color: '#a78bfa', fontSize: 13 }}>Open source on GitHub — MIT licensed</span>
        </div>

        <h2
          style={{
            fontSize: 'clamp(30px, 5vw, 52px)',
            fontWeight: 900,
            letterSpacing: '-0.04em',
            lineHeight: 1.1,
            marginBottom: 20,
          }}
        >
          <span className="text-gradient">Self-hosted.</span>
          <br />
          <span style={{ color: '#e4e4e7' }}>No lock-in. Runs anywhere.</span>
        </h2>

        <p style={{ color: '#63636e', fontSize: 18, marginBottom: 40, lineHeight: 1.6 }}>
          Your agents, your servers, your data.
          No subscription required.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 64 }}>
          <PrimaryButton href={GITHUB_URL} external>
            <GithubIcon size={16} />
            Star on GitHub
          </PrimaryButton>
          <SecondaryButton href="/docs">
            Get started →
          </SecondaryButton>
        </div>

        {/* Subscribe */}
        <div
          style={{
            background: '#09090b',
            border: '1px solid #1a1a1f',
            borderRadius: 14,
            padding: '36px',
          }}
        >
          <h3 style={{ fontWeight: 700, fontSize: 18, color: '#e4e4e7', marginBottom: 8 }}>
            Get release notifications
          </h3>
          <p style={{ color: '#63636e', fontSize: 14, marginBottom: 24 }}>
            New versions, features, and important updates straight to your inbox.
          </p>
          <SubscribeForm />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   SHARED COMPONENTS
───────────────────────────────────────────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 12,
        fontWeight: 700,
        color: '#8B5CF6',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom: 12,
      }}
    >
      {children}
    </p>
  );
}

function PrimaryButton({
  href,
  children,
  external,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="btn-primary"
    >
      {children}
    </a>
  );
}

function SecondaryButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="btn-secondary">
      {children}
    </a>
  );
}
