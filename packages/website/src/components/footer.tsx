import Link from 'next/link';

const GITHUB_URL = 'https://github.com/Arvis-agent/arvis';

export function Footer() {
  return (
    <footer style={{ borderTop: '1px solid #1a1a1f', background: '#000000' }}>
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          padding: '48px 24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 40,
        }}
      >
        {/* Brand */}
        <div>
          <div style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
            <span style={{ color: '#8B5CF6' }}>&gt;_&lt;</span>{' '}
            <span style={{ color: '#e4e4e7' }}>arvis</span>
          </div>
          <p style={{ color: '#63636e', fontSize: 14, lineHeight: 1.65, maxWidth: 220 }}>
            Self-hosted AI agent platform. MIT licensed. No lock-in.
          </p>
        </div>

        {/* Product */}
        <div>
          <p style={{ color: '#e4e4e7', fontSize: 13, fontWeight: 600, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Product</p>
          <FooterLinks links={[
            { label: 'Features',    href: '/#features' },
            { label: 'How it works', href: '/#how-it-works' },
            { label: 'Docs',        href: '/docs' },
            { label: 'Changelog',   href: `${GITHUB_URL}/releases` },
          ]} />
        </div>

        {/* Developers */}
        <div>
          <p style={{ color: '#e4e4e7', fontSize: 13, fontWeight: 600, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Developers</p>
          <FooterLinks links={[
            { label: 'GitHub',       href: GITHUB_URL },
            { label: 'Contributing', href: `${GITHUB_URL}/blob/main/CONTRIBUTING.md` },
            { label: 'API Reference', href: '/docs/api' },
            { label: 'Deployment',   href: '/docs/deployment' },
          ]} />
        </div>

        {/* Community */}
        <div>
          <p style={{ color: '#e4e4e7', fontSize: 13, fontWeight: 600, marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Community</p>
          <FooterLinks links={[
            { label: 'GitHub Discussions', href: `${GITHUB_URL}/discussions` },
            { label: 'Issues',             href: `${GITHUB_URL}/issues` },
            { label: 'Sponsor',            href: 'https://github.com/sponsors/Arvis-agent' },
          ]} />
        </div>
      </div>

      {/* Bottom bar */}
      <div
        style={{
          borderTop: '1px solid #111115',
          padding: '20px 24px',
          maxWidth: 1200,
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <p style={{ color: '#63636e', fontSize: 13 }}>
          © {new Date().getFullYear()} Arvis Contributors — MIT License
        </p>
        <a
          href="https://github.com/sponsors/Arvis-agent"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#63636e', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, transition: 'color 0.15s' }}
          className="footer-link"
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="currentColor" style={{ color: '#f59e0b' }}>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          Support us on GitHub
        </a>
      </div>
    </footer>
  );
}

function FooterLinks({ links }: { links: { label: string; href: string }[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target={link.href.startsWith('http') ? '_blank' : undefined}
          rel={link.href.startsWith('http') ? 'noopener noreferrer' : undefined}
          className="footer-link"
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}
