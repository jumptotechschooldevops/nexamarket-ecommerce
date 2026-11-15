import compression from 'compression';
import cors from 'cors';
import express, { type Express, type RequestHandler } from 'express';
import helmet from 'helmet';
import pinoHttpFactory, { type Options as PinoHttpOptions } from 'pino-http';

// pino-http ships a CJS default export that TypeScript's NodeNext resolution
// does not recognize as callable; the factory function itself is correct at runtime.
const pinoHttp = pinoHttpFactory as unknown as (opts: PinoHttpOptions) => RequestHandler;
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { logger } from './utils/logger.js';
import { authRouter } from './routes/auth.js';
import { cartRouter } from './routes/cart.js';
import { categoriesRouter } from './routes/categories.js';
import { dashboardRouter } from './routes/dashboard.js';
import { healthRouter } from './routes/health.js';
import { inventoryRouter } from './routes/inventory.js';
import { ordersRouter } from './routes/orders.js';
import { productsRouter } from './routes/products.js';
import { sellersRouter } from './routes/sellers.js';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',') }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(requestIdMiddleware);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as { requestId?: string }).requestId ?? 'unknown',
      customLogLevel: (_req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
      },
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password'],
        censor: '[REDACTED]',
      },
    }),
  );
  app.use(metricsMiddleware);

  // Health, readiness and metrics are mounted at the root, not under /api,
  // so platform probes (k8s liveness/readiness) can reach them directly.
  app.use(healthRouter);

  app.use('/api/auth', authRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/inventory', inventoryRouter);
  app.use('/api/cart', cartRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/sellers', sellersRouter);
  app.use('/api/dashboard', dashboardRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
