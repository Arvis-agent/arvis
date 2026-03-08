import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/api-auth';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SKILLS_DIR = process.env.SKILLS_DIR || path.join(process.cwd(), 'skills');
const COMMUNITY_DIR = path.join(SKILLS_DIR, 'community');

interface SkillRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  file_path: string;
  trigger_patterns: string | null;
  required_tools: string | null;
  category: string | null;
  enabled: number;
  version: string;
  author: string | null;
  install_count: number;
  created_at: string;
}

export async function GET(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;
  const url = new URL(request.url);
  const withContent = url.searchParams.get('content') === 'true';
  const idParam = url.searchParams.get('id');

  try {
    if (idParam) {
      const skill = db.get<SkillRow>('SELECT * FROM skills WHERE id = ?', Number(idParam));
      if (!skill) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      let content: string | null = null;
      if (skill.file_path) {
        try { content = fs.readFileSync(skill.file_path, 'utf-8'); } catch { /* file missing */ }
      }
      return NextResponse.json({ ...skill, content });
    }

    const skills = db.all<SkillRow>('SELECT * FROM skills ORDER BY category, name');

    if (withContent) {
      return NextResponse.json(skills.map(s => {
        let content: string | null = null;
        try { if (s.file_path) content = fs.readFileSync(s.file_path, 'utf-8'); } catch { /* skip */ }
        return { ...s, content };
      }));
    }

    return NextResponse.json(skills);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;

  const body = await request.json() as Record<string, unknown>;
  const { id, enabled, trigger_patterns, name, description } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const skill = db.get<{ id: number }>('SELECT id FROM skills WHERE id = ?', Number(id));
  if (!skill) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const updates: string[] = [];
  const values: unknown[] = [];
  if (enabled !== undefined)          { updates.push('enabled = ?');           values.push(enabled ? 1 : 0); }
  if (trigger_patterns !== undefined) { updates.push('trigger_patterns = ?');  values.push(trigger_patterns); }
  if (name !== undefined)             { updates.push('name = ?');              values.push(name); }
  if (description !== undefined)      { updates.push('description = ?');       values.push(description); }

  if (updates.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  values.push(id);
  db.run(`UPDATE skills SET ${updates.join(', ')} WHERE id = ?`, ...values);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const skill = db.get<{ id: number; file_path: string }>(
    'SELECT id, file_path FROM skills WHERE id = ?', Number(id),
  );
  if (!skill) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only delete files that live inside SKILLS_DIR (dashboard-imported skills)
  if (skill.file_path && skill.file_path.startsWith(SKILLS_DIR)) {
    try { fs.unlinkSync(skill.file_path); } catch { /* ignore */ }
  }

  db.run('DELETE FROM skills WHERE id = ?', Number(id));
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const authErr = await requireAuth(request); if (authErr) return authErr;

  const body = await request.json() as { content?: string };
  const content = body.content?.trim();
  if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 });

  const { slug, name } = parseBasicFrontmatter(content);
  if (!slug) return NextResponse.json({ error: 'Skill must have slug: in frontmatter' }, { status: 400 });

  // Sanitize slug — prevent path traversal
  const safeSlug = slug.replace(/[^a-z0-9_-]/gi, '').replace(/^-+|-+$/g, '');
  if (!safeSlug || safeSlug !== slug) return NextResponse.json({ error: 'Invalid slug — use only a-z, 0-9, hyphens, underscores' }, { status: 400 });

  if (!fs.existsSync(COMMUNITY_DIR)) fs.mkdirSync(COMMUNITY_DIR, { recursive: true });
  const filePath = path.join(COMMUNITY_DIR, `${safeSlug}.md`);

  // Double-check resolved path is inside community dir
  if (!path.resolve(filePath).startsWith(path.resolve(COMMUNITY_DIR))) {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }
  fs.writeFileSync(filePath, content, 'utf-8');

  const existing = db.get<{ id: number }>('SELECT id FROM skills WHERE slug = ?', slug);
  if (existing) {
    db.run('UPDATE skills SET file_path = ?, name = ? WHERE id = ?', filePath, name || slug, existing.id);
    return NextResponse.json({ id: existing.id, slug });
  }

  const result = db.run(
    'INSERT INTO skills (slug, name, file_path, version) VALUES (?, ?, ?, ?)',
    slug, name || slug, filePath, '1.0.0',
  );
  return NextResponse.json({ id: Number(result.lastInsertRowid), slug }, { status: 201 });
}

function parseBasicFrontmatter(raw: string): { slug: string; name: string } {
  const match = raw.match(/^---[\r\n]([\s\S]*?)[\r\n]---/);
  if (!match) return { slug: '', name: '' };
  const slug = match[1].match(/slug:\s*(.+)/)?.[1]?.trim() ?? '';
  const name = match[1].match(/name:\s*(.+)/)?.[1]?.trim() ?? '';
  return { slug, name };
}
