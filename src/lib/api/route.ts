import { NextResponse } from 'next/server';
import { HttpError } from './errors';

type Handler<Args extends unknown[]> = (...args: Args) => Promise<Response> | Response;

// Wraps a route handler so every thrown error becomes a consistent JSON
// response: known HttpErrors keep their status + message, anything unexpected
// is logged and returned as a 500 (instead of an opaque, unlogged crash).
export function route<Args extends unknown[]>(handler: Handler<Args>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error('[api] Unhandled route error:', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
