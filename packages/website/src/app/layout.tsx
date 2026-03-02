import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { GeistPixelSquare } from 'geist/font/pixel';
import './globals.css';
import { Nav } from '@/components/nav';
import { Footer } from '@/components/footer';

export const viewport: Viewport = {
  themeColor: '#000000',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://arvisagent.com'),
  title: {
    default: '>_< arvis — Self-hosted AI agent platform',
    template: '%s | arvis',
  },
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
  },
  description:
    'Route messages from Discord, Telegram, Slack, and WhatsApp to teams of specialized AI agents. Self-hosted, open source, MIT licensed.',
  keywords: [
    'AI agent platform',
    'self-hosted',
    'multi-agent',
    'Discord bot',
    'Telegram bot',
    'LLM orchestration',
    'open source',
    'TypeScript',
  ],
  authors: [{ name: 'Arvis Contributors' }],
  openGraph: {
    type: 'website',
    url: 'https://arvisagent.com',
    title: '>_< arvis — Self-hosted AI agent platform',
    description:
      'Route messages from Discord, Telegram, Slack to teams of AI agents. Self-hosted, open source.',
    siteName: 'arvis',
  },
  twitter: {
    card: 'summary_large_image',
    title: '>_< arvis',
    description: 'Self-hosted AI agent platform. Open source. MIT licensed.',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable}`}>
      <body className={`${GeistPixelSquare.className} antialiased grain`}>
        <Nav />
        {children}
        <Footer />
      </body>
    </html>
  );
}
