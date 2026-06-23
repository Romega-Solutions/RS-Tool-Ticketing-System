import { createHash, timingSafeEqual as nodeTimingSafeEqual } from 'crypto';
import { getSession, type SessionUser } from '@/lib/session';
import { canAccessAdmin, canAccessReports, hasToolAccess, type GateableToolKey } from '@/lib/rbac';
import { HttpError, unauthorized, forbidden } from './errors';

// Constant-time string compare. Both inputs are hashed to a fixed 32-byte
// digest first so the comparison stays constant-time even when the inputs
// differ in length — Node's timingSafeEqual throws on a length mismatch, and
// that throw would itself leak the secret's length.
export function timingSafeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return nodeTimingSafeEqual(ha, hb);
}

// Validate an `Authorization: Bearer <token>` header against a shared secret.
// Throws 500 if the secret is unset (misconfiguration), 401 otherwise.
export function verifyBearer(authHeader: string | null | undefined, secret: string | undefined): void {
  if (!secret) throw new HttpError(500, 'Server auth secret is not configured');
  const header = authHeader ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token || !timingSafeEqual(token, secret)) throw unauthorized();
}

// ── Pure session/role assertions (no I/O — easy to unit test) ──────────────
export function assertSession(session: SessionUser | null): SessionUser {
  if (!session) throw unauthorized();
  return session;
}

export function assertAdmin(session: SessionUser | null): SessionUser {
  const s = assertSession(session);
  if (!canAccessAdmin(s.role)) throw forbidden();
  return s;
}

export function assertReports(session: SessionUser | null): SessionUser {
  const s = assertSession(session);
  if (!canAccessReports(s.role)) throw forbidden();
  return s;
}

// Per-user tool gate for API routes (mirrors the page/action hasToolAccess check).
export function assertToolAccess(tool: GateableToolKey, session: SessionUser | null): SessionUser {
  const s = assertSession(session);
  if (!hasToolAccess(tool, s.role, s.toolAccess)) throw forbidden();
  return s;
}

// ── Async guards that fetch the live session ───────────────────────────────
export async function requireSession(): Promise<SessionUser> {
  return assertSession(await getSession());
}

export async function optionalSession(): Promise<SessionUser | null> {
  return getSession();
}

export async function requireAdmin(): Promise<SessionUser> {
  return assertAdmin(await getSession());
}

export async function requireReports(): Promise<SessionUser> {
  return assertReports(await getSession());
}

export async function requireTool(tool: GateableToolKey): Promise<SessionUser> {
  return assertToolAccess(tool, await getSession());
}

export function requireBearer(req: Request, secret: string | undefined): void {
  verifyBearer(req.headers.get('authorization'), secret);
}
