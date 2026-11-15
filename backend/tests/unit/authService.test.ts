import { describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import type { Pool, PoolClient } from 'pg';
import { loginUser, registerUser } from '../../src/services/authService.js';

function mockPoolWithClient(
  poolQueryImpl: (sql: string, params?: unknown[]) => unknown,
  clientQueryImpl: (sql: string, params?: unknown[]) => unknown,
) {
  const client = { query: vi.fn(clientQueryImpl), release: vi.fn() } as unknown as PoolClient;
  return {
    query: vi.fn(poolQueryImpl),
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool;
}

describe('authService.registerUser', () => {
  it('rejects registration with an existing email as a 409 conflict', async () => {
    const pool = mockPoolWithClient(
      () => ({ rows: [{ id: 'existing-user' }], rowCount: 1 }),
      () => ({}),
    );

    await expect(
      registerUser(pool, { email: 'taken@nexamarket.test', password: 'Password123!', fullName: 'Taken User' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });

  it('stores a bcrypt hash, never the plaintext password', async () => {
    let insertedHash = '';
    const pool = mockPoolWithClient(
      () => ({ rows: [], rowCount: 0 }), // no existing user with this email
      (sql: string, params?: unknown[]) => {
        if (sql.includes('BEGIN') || sql.includes('COMMIT') || sql.includes('ROLLBACK')) return {};
        if (sql.includes('INSERT INTO users')) {
          insertedHash = params![1] as string;
          return {
            rows: [{ id: 'new-user', email: 'alex@nexamarket.test', password_hash: insertedHash, full_name: 'Alex', role: 'customer', created_at: 'x' }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      },
    );

    const { user } = await registerUser(pool, { email: 'alex@nexamarket.test', password: 'Sup3rSecret!', fullName: 'Alex' });

    expect(insertedHash).not.toBe('Sup3rSecret!');
    expect(await bcrypt.compare('Sup3rSecret!', insertedHash)).toBe(true);
    expect(user).not.toHaveProperty('password_hash');
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('creates an associated seller profile when registering with role "seller"', async () => {
    const insertedTables: string[] = [];
    const pool = mockPoolWithClient(
      () => ({ rows: [], rowCount: 0 }),
      (sql: string) => {
        if (sql.includes('INSERT INTO users')) {
          insertedTables.push('users');
          return {
            rows: [{ id: 'seller-user', email: 's@nexamarket.test', password_hash: 'hash', full_name: 'S', role: 'seller', created_at: 'x' }],
            rowCount: 1,
          };
        }
        if (sql.includes('INSERT INTO sellers')) {
          insertedTables.push('sellers');
          return { rowCount: 1 };
        }
        return {};
      },
    );

    await registerUser(pool, { email: 's@nexamarket.test', password: 'Password123!', fullName: 'S', role: 'seller', storeName: 'S Store' });

    expect(insertedTables).toEqual(['users', 'sellers']);
  });
});

describe('authService.loginUser', () => {
  it('rejects an unknown email with a 401, without revealing whether the account exists', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) } as unknown as Pool;
    await expect(loginUser(pool, 'nobody@nexamarket.test', 'whatever')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a deactivated account even with the correct password', async () => {
    const hash = await bcrypt.hash('CorrectPass1!', 10);
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'u1', email: 'x@nexamarket.test', password_hash: hash, full_name: 'X', role: 'customer', is_active: false, created_at: 'x' }],
        rowCount: 1,
      }),
    } as unknown as Pool;

    await expect(loginUser(pool, 'x@nexamarket.test', 'CorrectPass1!')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects an incorrect password with a 401', async () => {
    const hash = await bcrypt.hash('CorrectPass1!', 10);
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'u1', email: 'x@nexamarket.test', password_hash: hash, full_name: 'X', role: 'customer', is_active: true, created_at: 'x' }],
        rowCount: 1,
      }),
    } as unknown as Pool;

    await expect(loginUser(pool, 'x@nexamarket.test', 'WrongPassword!')).rejects.toMatchObject({ statusCode: 401 });
  });

  it('returns a user and token on correct credentials for an active account', async () => {
    const hash = await bcrypt.hash('CorrectPass1!', 10);
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [{ id: 'u1', email: 'x@nexamarket.test', password_hash: hash, full_name: 'X', role: 'admin', is_active: true, created_at: 'x' }],
        rowCount: 1,
      }),
    } as unknown as Pool;

    const { user, token } = await loginUser(pool, 'x@nexamarket.test', 'CorrectPass1!');
    expect(user.role).toBe('admin');
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // header.payload.signature
  });
});
