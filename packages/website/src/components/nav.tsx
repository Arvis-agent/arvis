'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const GITHUB_URL = 'https://github.com/Arvis-agent/arvis';

export function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 30);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-200"
      style={{
        background: scrolled ? 'rgba(0,0,0,0.9)' : 'transparent',
        backdropFilter: scrolled ? 'blur(16px)' : 'none',
        borderBottom: scrolled ? '1px solid #1a1a1f' : '1px solid transparent',
      }}
    >
      <div className="section-sm flex items-center justify-between py-0" style={{ padding: '0 24px', maxWidth: 1200, height: 64 }}>

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 no-underline">
          <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>
            <span style={{ color: '#8B5CF6' }}>&gt;_&lt;</span>{' '}
            <span style={{ color: '#e4e4e7' }}>arvis</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {[
            { label: 'Features', href: '#features' },
            { label: 'How it works', href: '#how-it-works' },
            { label: 'Docs', href: '/docs' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              style={{ color: '#63636e', textDecoration: 'none', fontSize: 14, transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#e4e4e7')}
              onMouseLeave={e => (e.currentTarget.style.color = '#63636e')}
            >
              {item.label}
            </a>
          ))}

          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2"
            style={{ color: '#63636e', textDecoration: 'none', fontSize: 14, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#e4e4e7')}
            onMouseLeave={e => (e.currentTarget.style.color = '#63636e')}
          >
            <GithubIcon size={16} />
            GitHub
          </a>

          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-sm no-underline transition-all duration-150"
            style={{
              background: '#8B5CF6',
              color: '#000000',
              padding: '8px 20px',
              borderRadius: 8,
              letterSpacing: '-0.01em',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#6D28D9')}
            onMouseLeave={e => (e.currentTarget.style.background = '#8B5CF6')}
          >
            Get started
          </a>
        </nav>

        {/* Mobile menu button */}
        <button
          className="md:hidden p-2 text-subtle border-0 bg-transparent cursor-pointer"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
          style={{ color: '#888896' }}
        >
          {open
            ? <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            : <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
          }
        </button>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div
          className="md:hidden"
          style={{ background: '#09090b', borderTop: '1px solid #1a1a1f', padding: '16px 24px 24px' }}
        >
          <div className="flex flex-col gap-4">
            {[
              { label: 'Features', href: '#features' },
              { label: 'How it works', href: '#how-it-works' },
              { label: 'Docs', href: '/docs' },
              { label: 'GitHub', href: GITHUB_URL },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                style={{ color: '#888896', textDecoration: 'none', fontSize: 16, padding: '4px 0' }}
              >
                {item.label}
              </a>
            ))}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: '#8B5CF6',
                color: '#000000',
                padding: '10px 20px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                textDecoration: 'none',
                textAlign: 'center',
                marginTop: 8,
              }}
            >
              Get started
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

function GithubIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
