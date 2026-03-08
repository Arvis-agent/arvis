/**
 * POST /api/skills/import
 *
 * Import a skill from a URL (GitHub raw file, any .md URL, etc.)
 *
 * Body: { url: string }
 *
 * Fetches the .md content, parses frontmatter for slug/name,
 * saves to skills/ directory and registers in the DB.
 *
 * Example URLs:
 *   https://raw.githubusercontent.com/user/repo/main/skills/my-skill.md
 *   https://gist.githubusercontent.com/.../my-skill.md
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SKILLS_DIR = process.env.SKILLS_DIR || path.join(process.cwd(), 'skills');
const COMMUNITY_DIR = path.join(SKILLS_DIR, 'community');

// Only allow http/https URLs to prevent SSRF
const ALLOWED_PROTOCOLS = ['https:', 'http:'];

export async function POST(request: Request) {
  const authErr = await requireAuth(request);
  if (authErr) return authErr;

  const body = await request.json() as { url?: string };
  const rawUrl = body.url?.trim();
  if (!rawUrl) return NextResponse.json({ error: 'url required' }, { status: 400 });

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  if (!ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
    return NextResponse.json({ error: 'Only http/https URLs allowed' }, { status: 400 });
  }

  // Block internal/private IPs to prevent SSRF
  const hostname = parsedUrl.hostname;
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('172.') ||
    hostname === '169.254.169.254' ||
    hostname.endsWith('.local')
  ) {
    return NextResponse.json({ error: 'URLs pointing to internal/private networks are not allowed' }, { status: 400 });
  }

  // Fetch the skill content
  let content: string;
  try {
    const res = await fetch(rawUrl, {
      headers: { 'User-Agent': 'Arvis/3.0 (skill importer)', Accept: 'text/plain, text/markdown' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Fetch failed: HTTP ${res.status} from ${rawUrl}` }, { status: 502 });
    }
    // Limit response size to 1MB to prevent OOM
    const contentLength = res.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 1_048_576) {
      return NextResponse.json({ error: 'Content too large (max 1MB)' }, { status: 400 });
    }
    content = await res.text();
    if (content.length > 1_048_576) {
      return NextResponse.json({ error: 'Content too large (max 1MB)' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: `Fetch error: ${String(err)}` }, { status: 502 });
  }

  content = content.trim();
  if (!content) return NextResponse.json({ error: 'Fetched content is empty' }, { status: 400 });

  // Parse frontmatter
  const { slug, name, description, triggers, category, author } = parseFullFrontmatter(content);
  if (!slug) {
    return NextResponse.json(
      { error: 'Skill file must have "slug:" in YAML frontmatter' },
      { status: 400 },
    );
  }

  // Sanitize slug — prevent path traversal
  const safeSlug = slug.replace(/[^a-z0-9_-]/gi, '').replace(/^-+|-+$/g, '');
  if (!safeSlug || safeSlug !== slug) {
    return NextResponse.json({ error: 'Invalid slug in skill frontmatter — use only a-z, 0-9, hyphens, underscores' }, { status: 400 });
  }

  // Save to community skills dir
  if (!fs.existsSync(COMMUNITY_DIR)) fs.mkdirSync(COMMUNITY_DIR, { recursive: true });
  const filePath = path.join(COMMUNITY_DIR, `${safeSlug}.md`);

  // Double-check resolved path is inside community dir
  if (!path.resolve(filePath).startsWith(path.resolve(COMMUNITY_DIR))) {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }
  fs.writeFileSync(filePath, content, 'utf-8');

  // Upsert in DB
  const existing = db.get<{ id: number }>('SELECT id FROM skills WHERE slug = ?', slug);
  if (existing) {
    db.run(
      `UPDATE skills SET name = ?, description = ?, trigger_patterns = ?, category = ?, author = ?,
       file_path = ?, version = coalesce(version, '1.0.0') WHERE id = ?`,
      name || slug, description || null, triggers || null, category || null,
      author || null, filePath, existing.id,
    );
    return NextResponse.json({ id: existing.id, slug, updated: true });
  }

  const result = db.run(
    `INSERT INTO skills (slug, name, description, trigger_patterns, category, author, file_path, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    slug, name || slug, description || null, triggers || null,
    category || null, author || null, filePath, '1.0.0',
  );

  return NextResponse.json({ id: Number(result.lastInsertRowid), slug, created: true }, { status: 201 });
}

interface SkillFrontmatter {
  slug: string;
  name: string;
  description: string;
  triggers: string;
  category: string;
  author: string;
}

function parseFullFrontmatter(raw: string): SkillFrontmatter {
  const match = raw.match(/^---[\r\n]([\s\S]*?)[\r\n]---/);
  if (!match) return { slug: '', name: '', description: '', triggers: '', category: '', author: '' };
  const fm = match[1];

  const get = (key: string) => fm.match(new RegExp(`^${key}:\\s*(.+)`, 'm'))?.[1]?.trim() ?? '';

  // triggers can be an array: [solana, SOL, price] → join as comma-separated
  const triggersRaw = fm.match(/^triggers:\s*\[([^\]]+)\]/m)?.[1]
    ?? fm.match(/^triggers:\s*(.+)/m)?.[1]
    ?? '';
  const triggers = triggersRaw.replace(/['"]/g, '').trim();

  return {
    slug:        get('slug'),
    name:        get('name'),
    description: get('description'),
    triggers,
    category:    get('category'),
    author:      get('author'),
  };
}
