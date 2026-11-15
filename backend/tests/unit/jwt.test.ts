import { describe, expect, it } from 'vitest';
import { signToken, verifyToken } from '../../src/utils/jwt.js';

describe('jwt sign/verify', () => {
  it('round-trips a payload through sign and verify', () => {
    const payload = { sub: 'user-123', email: 'test@nexamarket.test', role: 'customer' as const };
    const token = signToken(payload);
    const decoded = verifyToken(token);

    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.role).toBe(payload.role);
  });

  it('throws when verifying a tampered token', () => {
    const token = signToken({ sub: 'user-123', email: 'a@b.com', role: 'admin' });
    const tampered = `${token}tampered`;
    expect(() => verifyToken(tampered)).toThrow();
  });
});
