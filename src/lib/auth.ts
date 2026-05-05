import { jwtVerify, SignJWT, type JWTPayload } from 'jose';

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // Log loudly so it shows in Vercel function logs, but don't crash.
    // Set JWT_SECRET in Vercel → Settings → Environment Variables.
    console.warn('[auth] WARNING: JWT_SECRET is not set. Using insecure fallback. Set it in your Vercel project settings.');
    return new TextEncoder().encode('fallback-insecure-set-JWT_SECRET-in-vercel');
  }
  return new TextEncoder().encode(secret);
}

export async function signToken(payload: JWTPayload) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload;
  } catch {
    return null;
  }
}
