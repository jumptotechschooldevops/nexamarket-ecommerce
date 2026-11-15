import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, closeTestResources } from './helpers.js';

describe('health and readiness', () => {
  afterAll(async () => {
    await closeTestResources();
  });

  it('GET /health returns 200 and ok status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /ready returns 200 when database is reachable', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
  });

  it('GET /metrics exposes Prometheus-formatted metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('http_request_duration_seconds');
  });
});
