// Public read-only endpoint that surfaces published candidates for the
// Talent showcase at romega-solutions.com/talent.
//
// Gating: same shared bearer token as /api/public/applications.
// Privacy: returns ONLY fields safe for public display. Email, phone,
// raw resume_url, internal status, rating, notes, and the recruiter's
// assigned_to are deliberately omitted. The marketing site further
// anonymizes the name to "First L." before rendering.

import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PublicTalent = {
  id: number;
  applicationCode: string | null;
  fullName: string;
  position: string | null;
  location: string | null;
  summary: string | null;
  skills: string[];
  linkedinUrl: string | null;
  experience: Array<{ company?: string | null; title?: string | null }> | null;
  experienceYears: number | null;
  publishedAt: string;
};

type Row = {
  id: number;
  application_code: string | null;
  full_name: string;
  position: string | null;
  location: string | null;
  summary: string | null;
  skills: unknown;
  linkedin_url: string | null;
  experience: unknown;
  updated_at: string | null;
  created_at: string;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function asExperience(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value
    .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null)
    .map((v) => ({
      company: typeof v.company === 'string' ? v.company : null,
      title: typeof v.title === 'string' ? v.title : null,
    }));
}

function estimateYears(experience: unknown): number | null {
  if (!Array.isArray(experience)) return null;
  let totalMonths = 0;
  for (const item of experience) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as Record<string, unknown>;
    const start = typeof row.start_date === 'string' ? row.start_date : '';
    const endRaw = typeof row.end_date === 'string' ? row.end_date : '';
    const startYear = Number.parseInt(start.slice(0, 4), 10);
    if (!Number.isFinite(startYear)) continue;
    const startMonth = Number.parseInt(start.slice(5, 7), 10) || 1;
    const isPresent = !endRaw || /present|current/i.test(endRaw);
    const endYear = isPresent ? new Date().getUTCFullYear() : Number.parseInt(endRaw.slice(0, 4), 10);
    if (!Number.isFinite(endYear)) continue;
    const endMonth = isPresent ? new Date().getUTCMonth() + 1 : Number.parseInt(endRaw.slice(5, 7), 10) || 12;
    const months = (endYear - startYear) * 12 + (endMonth - startMonth);
    if (months > 0) totalMonths += months;
  }
  if (totalMonths === 0) return null;
  return Math.round((totalMonths / 12) * 10) / 10;
}

export async function GET(req: NextRequest) {
  const expected = process.env.PUBLIC_APPLICATIONS_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, code: 'NOT_CONFIGURED', error: 'Public talents endpoint not configured' },
      { status: 503 },
    );
  }
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length).trim() : '';
  if (token !== expected) {
    return NextResponse.json(
      { ok: false, code: 'UNAUTHORIZED', error: 'Invalid or missing token' },
      { status: 401 },
    );
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('candidates')
    .select(
      'id, application_code, full_name, position, location, summary, skills, linkedin_url, experience, updated_at, created_at',
    )
    .eq('is_public_talent', true)
    .eq('consent_status', 'agreed') // defense-in-depth: never surface un-consented profiles
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) {
    const msg = error.message?.toLowerCase() ?? '';
    if (msg.includes('does not exist') || msg.includes('is_public_talent')) {
      // Column hasn't been added yet — treat as empty, not an error.
      return NextResponse.json(
        { ok: true, talents: [], updatedAt: new Date().toISOString() },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return NextResponse.json(
      { ok: false, code: 'DB_ERROR', error: error.message },
      { status: 500 },
    );
  }

  const talents: PublicTalent[] = ((data as Row[] | null) ?? []).map((row) => ({
    id: row.id,
    applicationCode: row.application_code,
    fullName: row.full_name,
    position: row.position,
    location: row.location,
    summary: row.summary,
    skills: asStringArray(row.skills),
    linkedinUrl: row.linkedin_url,
    experience: asExperience(row.experience),
    experienceYears: estimateYears(row.experience),
    publishedAt: row.updated_at ?? row.created_at,
  }));

  return NextResponse.json(
    { ok: true, talents, updatedAt: new Date().toISOString() },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    },
  );
}
