import type { ZodType } from 'zod';
import { badRequest } from './errors';

function validate<T>(raw: unknown, schema: ZodType<T>): T {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path?.join('.');
    const message = first
      ? path ? `${path}: ${first.message}` : first.message
      : 'Invalid request body';
    throw badRequest(message);
  }
  return result.data;
}

// Read + validate a JSON request body against a zod schema. Throws a 400
// HttpError with a human-readable message on malformed JSON or schema failure,
// so callers never touch unvalidated, wrongly-typed input.
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest('Invalid JSON body');
  }

  return validate(raw, schema);
}

// Some legacy routes intentionally treat a missing or malformed optional body
// as `{}` while still validating any successfully parsed JSON payload.
export async function parseOptionalBody<T>(
  req: Request,
  schema: ZodType<T>,
  fallback: unknown = {},
): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = fallback;
  }

  return validate(raw, schema);
}
