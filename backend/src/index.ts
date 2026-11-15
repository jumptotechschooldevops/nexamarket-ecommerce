import { createApp } from './app.js';
import { env } from './config/env.js';
import { pool } from './config/db.js';
import { logger } from './utils/logger.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'NexaMarket backend listening');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down gracefully');
  server.close(() => {
    pool
      .end()
      .then(() => {
        logger.info('Database pool closed');
        process.exit(0);
      })
      .catch((err) => {
        logger.error({ err }, 'Error closing database pool');
        process.exit(1);
      });
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
