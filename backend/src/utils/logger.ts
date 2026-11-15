import pino from 'pino';
import { env } from '../config/env.js';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'passwordHash',
  'req.body.password',
  'req.body.cardNumber',
  'req.body.cvv',
  '*.password',
  '*.token',
  '*.secret',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  base: { service: 'nexamarket-backend' },
});
