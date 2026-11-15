import bcrypt from 'bcryptjs';
import type { Pool } from 'pg';
import { AppError } from '../utils/AppError.js';
import { signToken } from '../utils/jwt.js';
import type { PublicUser, UserRole, UserRow } from '../types/domain.js';

function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    createdAt: row.created_at,
  };
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  role?: UserRole;
  storeName?: string;
}

export async function registerUser(pool: Pool, input: RegisterInput): Promise<{ user: PublicUser; token: string }> {
  const existing = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [input.email]);
  if (existing.rowCount && existing.rowCount > 0) {
    throw AppError.conflict('An account with this email already exists');
  }

  const role: UserRole = input.role === 'seller' ? 'seller' : 'customer';
  const passwordHash = await bcrypt.hash(input.password, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userResult = await client.query<UserRow>(
      `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.email, passwordHash, input.fullName, role],
    );
    const user = userResult.rows[0];

    if (role === 'seller') {
      const storeName = input.storeName?.trim() || `${input.fullName}'s Store`;
      const storeSlug = `${storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${user.id.slice(0, 8)}`;
      await client.query(
        `INSERT INTO sellers (user_id, store_name, store_slug) VALUES ($1, $2, $3)`,
        [user.id, storeName, storeSlug],
      );
    }

    await client.query('COMMIT');
    const token = signToken({ sub: user.id, email: user.email, role: user.role });
    return { user: toPublicUser(user), token };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function loginUser(
  pool: Pool,
  email: string,
  password: string,
): Promise<{ user: PublicUser; token: string }> {
  const result = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
  const user = result.rows[0];
  if (!user || !user.is_active) {
    throw AppError.unauthorized('Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);
  if (!passwordMatches) {
    throw AppError.unauthorized('Invalid email or password');
  }

  const token = signToken({ sub: user.id, email: user.email, role: user.role });
  return { user: toPublicUser(user), token };
}

export async function getUserById(pool: Pool, id: string): Promise<PublicUser> {
  const result = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  if (result.rowCount === 0) {
    throw AppError.notFound('User not found');
  }
  return toPublicUser(result.rows[0]);
}
