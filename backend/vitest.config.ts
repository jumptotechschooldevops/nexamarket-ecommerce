import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 15000,
    hookTimeout: 15000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://nexamarket:nexamarket@localhost:5432/nexamarket_unit_test_unused',
      JWT_SECRET: 'unit-test-only-secret-not-for-production',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/db/migrate.ts', 'src/db/seed/**'],
    },
  },
});
