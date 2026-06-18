// Typed HTTP errors that route handlers can throw and the `route()` wrapper
// turns into a consistent `{ error }` JSON envelope with the right status.

export class HttpError extends Error {
  status: number;
  headers?: Record<string, string>;
  constructor(status: number, message: string, headers?: Record<string, string>) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.headers = headers;
  }
}

export const badRequest   = (message = 'Bad request')  => new HttpError(400, message);
export const unauthorized = (message = 'Unauthorized') => new HttpError(401, message);
export const forbidden    = (message = 'Forbidden')    => new HttpError(403, message);
export const notFound     = (message = 'Not found')    => new HttpError(404, message);
export const tooManyRequests = (retryAfterSec = 60) =>
  new HttpError(429, 'Too many requests. Please slow down.', { 'Retry-After': String(retryAfterSec) });
