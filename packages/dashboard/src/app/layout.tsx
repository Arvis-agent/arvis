import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { GeistPixelSquare } from 'geist/font/pixel';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Arvis', template: '%s — Arvis' },
  description: 'AI agent orchestration platform',
  icons: { icon: '/icon.svg', shortcut: '/icon.svg' },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`dark ${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable}`}
    >
      {/* GeistPixelSquare.className applies font-family + font-weight:500 directly */}
      <body className={`${GeistPixelSquare.className} antialiased`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
