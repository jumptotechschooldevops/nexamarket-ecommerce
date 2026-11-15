import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler.js';
import { AppError } from '../../src/utils/AppError.js';

function mockRes() {
  const res: { statusCode?: number; body?: unknown; status: (c: number) => typeof res; json: (b: unknown) => typeof res } = {
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

describe('errorHandler middleware', () => {
  it('maps AppError to its declared status code and code', () => {
    const res = mockRes();
    const req = { requestId: 'req-1' } as never;
    errorHandler(AppError.notFound('Widget not found'), req, res as never, vi.fn());

    expect(res.statusCode).toBe(404);
    expect((res.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
  });

  it('maps ZodError to 400 VALIDATION_ERROR with field details', () => {
    const schema = z.object({ email: z.string().email() });
    const parseResult = schema.safeParse({ email: 'not-an-email' });
    expect(parseResult.success).toBe(false);

    const res = mockRes();
    const req = { requestId: 'req-2' } as never;
    if (!parseResult.success) {
      errorHandler(parseResult.error, req, res as never, vi.fn());
    }

    expect(res.statusCode).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('falls back to 500 for unrecognized errors without leaking internals', () => {
    const res = mockRes();
    const req = { requestId: 'req-3' } as never;
    errorHandler(new Error('db exploded'), req, res as never, vi.fn());

    expect(res.statusCode).toBe(500);
    expect((res.body as { error: { message: string } }).error.message).toBe('An unexpected error occurred');
  });

  it('notFoundHandler returns a 404 with the request path', () => {
    const res = mockRes();
    const req = { method: 'GET', originalUrl: '/api/does-not-exist', requestId: 'req-4' } as never;
    notFoundHandler(req, res as never);

    expect(res.statusCode).toBe(404);
    expect((res.body as { error: { message: string } }).error.message).toContain('/api/does-not-exist');
  });
});
