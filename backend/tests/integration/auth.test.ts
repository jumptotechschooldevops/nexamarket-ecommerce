import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, uniqueEmail } from './helpers.js';

describe('auth flows', () => {
  it('registers a new customer and returns a token', async () => {
    const email = uniqueEmail('customer');
    const res = await request(app).post('/api/auth/register').send({
      email,
      password: 'Sup3rSecret!',
      fullName: 'Test Customer',
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.role).toBe('customer');
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects duplicate registration with 409', async () => {
    const email = uniqueEmail('dupe');
    await request(app).post('/api/auth/register').send({ email, password: 'Sup3rSecret!', fullName: 'Dupe' });
    const res = await request(app).post('/api/auth/register').send({ email, password: 'Sup3rSecret!', fullName: 'Dupe' });
    expect(res.status).toBe(409);
  });

  it('logs in with correct credentials and rejects wrong password', async () => {
    const email = uniqueEmail('login');
    await request(app).post('/api/auth/register').send({ email, password: 'Correct123!', fullName: 'Login User' });

    const good = await request(app).post('/api/auth/login').send({ email, password: 'Correct123!' });
    expect(good.status).toBe(200);
    expect(good.body.token).toBeTypeOf('string');

    const bad = await request(app).post('/api/auth/login').send({ email, password: 'WrongPassword!' });
    expect(bad.status).toBe(401);
  });

  it('GET /api/auth/me requires a bearer token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/me returns the authenticated user', async () => {
    const email = uniqueEmail('me');
    const register = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Correct123!', fullName: 'Me User' });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${register.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(email);
  });

  it('rejects invalid registration payloads with 400', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'not-an-email', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
