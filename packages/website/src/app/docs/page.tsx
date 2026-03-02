import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  RocketIcon, LayersIcon, RouteIcon, GitForkIcon, CpuIcon, RefreshIcon,
  ListChecksIcon, LockIcon, PuzzleIcon, PlugIcon, WrenchIcon, ShipIcon,
  ApiIcon, BookIcon, GithubIcon,
} from '@/components/icons';

export const metadata: Metadata = {
  title: 'Docs — arvis',
  description: 'Complete documentation for the Arvis AI agent platform.',
};

const GITHUB_DOCS = 'https://github.com/Arvis-agent/arvis/blob/main/docs';

const DOCS: {
  num: string;
  title: string;
  desc: string;
  href: string;
  icon: ReactNode;
  tag?: string;
  tagColor?: string;
}[] = [
  {
    num: '00',
    title: 'User guide',
    desc: 'Getting started, connecting platforms, creating agents.',
    href: `${GITHUB_DOCS}/00-user-guide.md`,
    icon: <RocketIcon size={20} />,
    tag: 'Start here',
    tagColor: '#8B5CF6',
  },
  {
    num: '01',
    title: 'Architecture',
    desc: 'System overview — every process, port, and module.',
    href: `${GITHUB_DOCS}/01-architecture.md`,
    icon: <LayersIcon size={20} />,
  },
  {
    num: '02',
    title: 'Message flow',
    desc: 'Complete step-by-step: user message → LLM → response.',
    href: `${GITHUB_DOCS}/02-message-flow.md`,
    icon: <RouteIcon size={20} />,
  },
  {
    num: '03',
    title: 'Routing',
    desc: 'How messages are assigned to the right agent.',
    href: `${GITHUB_DOCS}/03-routing.md`,
    icon: <GitForkIcon size={20} />,
  },
  {
    num: '04',
    title: 'LLM providers',
    desc: 'Accounts, failover, multiple providers, CLI vs API.',
    href: `${GITHUB_DOCS}/04-llm-providers.md`,
    icon: <CpuIcon size={20} />,
  },
  {
    num: '05',
    title: 'Context & memory',
    desc: 'How context is built, memory system, auto-compaction.',
    href: `${GITHUB_DOCS}/05-context-memory.md`,
    icon: <RefreshIcon size={20} />,
  },
  {
    num: '06',
    title: 'Queue & scheduler',
    desc: 'Job queue, priorities, retries, scheduled tasks.',
    href: `${GITHUB_DOCS}/06-queue-scheduler.md`,
    icon: <ListChecksIcon size={20} />,
  },
  {
    num: '07',
    title: 'Security',
    desc: 'Auth, VPS setup, API keys, Docker sandbox, credentials.',
    href: `${GITHUB_DOCS}/07-security.md`,
    icon: <LockIcon size={20} />,
  },
  {
    num: '08',
    title: 'Extensibility',
    desc: 'Custom tools, skills, connectors, plugins.',
    href: `${GITHUB_DOCS}/08-extensibility.md`,
    icon: <PuzzleIcon size={20} />,
  },
  {
    num: '09',
    title: 'Connectors',
    desc: 'Platform-specific docs: Discord, Telegram, Slack, WhatsApp, SMS, Email, Web.',
    href: `${GITHUB_DOCS}/09-connectors.md`,
    icon: <PlugIcon size={20} />,
  },
  {
    num: '10',
    title: 'Troubleshooting',
    desc: 'What to check when things break. SQL debug queries.',
    href: `${GITHUB_DOCS}/10-troubleshooting.md`,
    icon: <WrenchIcon size={20} />,
  },
  {
    num: '11',
    title: 'Deployment',
    desc: 'Docker, VPS bare metal, systemd, nginx, backups.',
    href: `${GITHUB_DOCS}/11-deployment.md`,
    icon: <ShipIcon size={20} />,
    tag: 'VPS guide',
    tagColor: '#f59e0b',
  },
  {
    num: '12',
    title: 'API reference',
    desc: 'Complete REST API reference — all endpoints, auth, responses.',
    href: `${GITHUB_DOCS}/12-api-reference.md`,
    icon: <ApiIcon size={20} />,
    tag: 'API',
    tagColor: '#22c55e',
  },
];

export default function DocsPage() {
  return (
    <main style={{ paddingTop: 80 }}>
      {/* Header */}
      <div
        style={{
          padding: '72px 24px 64px',
          borderBottom: '1px solid #1a1a1f',
          textAlign: 'center',
          background: 'linear-gradient(180deg, rgba(139,92,246,0.04) 0%, transparent 100%)',
        }}
      >
        <p style={{ fontSize: 12, fontWeight: 700, color: '#8B5CF6', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>
          Documentation
        </p>
        <h1
          style={{
            fontSize: 'clamp(30px, 5vw, 52px)',
            fontWeight: 900,
            letterSpacing: '-0.04em',
            lineHeight: 1.1,
            marginBottom: 16,
            background: 'linear-gradient(135deg, #ffffff 30%, #a78bfa 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Everything you need to build.
        </h1>
        <p style={{ color: '#63636e', fontSize: 18, maxWidth: 480, margin: '0 auto 32px' }}>
          Start with the user guide. Deep-dive into any module. All docs are in the GitHub repo.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a
            href="https://github.com/Arvis-agent/arvis"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#8B5CF6',
              color: '#000',
              padding: '10px 22px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <GithubIcon size={16} />
            View on GitHub
          </a>
          <a
            href={`${GITHUB_DOCS}/00-user-guide.md`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'transparent',
              color: '#e4e4e7',
              padding: '10px 22px',
              borderRadius: 8,
              border: '1px solid #1a1a1f',
              fontSize: 14,
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Quick start →
          </a>
        </div>
      </div>

      {/* Grid */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '64px 24px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
          }}
        >
          {DOCS.map((doc) => (
            <a
              key={doc.num}
              href={doc.href}
              target="_blank"
              rel="noopener noreferrer"
              className="card-hover"
              style={{
                display: 'block',
                background: '#09090b',
                border: '1px solid #1a1a1f',
                borderRadius: 12,
                padding: '24px',
                textDecoration: 'none',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ color: '#8B5CF6', display: 'inline-flex', flexShrink: 0 }}>{doc.icon}</span>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 11,
                      color: '#3f3f46',
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                    }}
                  >
                    {doc.num}
                  </span>
                </div>
                {doc.tag && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: doc.tagColor,
                      background: `${doc.tagColor}15`,
                      border: `1px solid ${doc.tagColor}30`,
                      borderRadius: 999,
                      padding: '2px 10px',
                    }}
                  >
                    {doc.tag}
                  </span>
                )}
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#e4e4e7', marginBottom: 6 }}>{doc.title}</h3>
              <p style={{ fontSize: 13, color: '#63636e', lineHeight: 1.6 }}>{doc.desc}</p>
            </a>
          ))}
        </div>

        {/* Repo hint */}
        <div
          style={{
            marginTop: 48,
            background: 'rgba(139,92,246,0.04)',
            border: '1px solid rgba(139,92,246,0.15)',
            borderRadius: 12,
            padding: '24px 28px',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: '#8B5CF6', display: 'inline-flex', flexShrink: 0 }}>
            <BookIcon size={28} />
          </span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ fontWeight: 700, color: '#e4e4e7', marginBottom: 4 }}>All docs live in the repo</p>
            <p style={{ color: '#63636e', fontSize: 14 }}>
              Every doc is a Markdown file in{' '}
              <a
                href="https://github.com/Arvis-agent/arvis/tree/main/docs"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#8B5CF6', textDecoration: 'none' }}
              >
                /docs
              </a>
              {' '} on GitHub. Edit them, fork them, contribute back.
            </p>
          </div>
          <a
            href="https://github.com/Arvis-agent/arvis/tree/main/docs"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: '#8B5CF6',
              color: '#000',
              padding: '10px 20px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Browse on GitHub →
          </a>
        </div>
      </div>
    </main>
  );
}
