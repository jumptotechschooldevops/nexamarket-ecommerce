import { Router } from 'express';
import { checkDbConnection } from '../config/db.js';
import { metricsRegistry } from '../middleware/metrics.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

healthRouter.get('/ready', async (_req, res) => {
  const dbReady = await checkDbConnection();
  if (!dbReady) {
    res.status(503).json({ status: 'not_ready', database: 'unreachable' });
    return;
  }
  res.status(200).json({ status: 'ready', database: 'connected' });
});

healthRouter.get('/metrics', async (_req, res) => {
  res.setHeader('Content-Type', metricsRegistry.contentType);
  res.send(await metricsRegistry.metrics());
});
