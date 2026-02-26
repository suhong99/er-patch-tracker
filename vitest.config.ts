import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['scripts/tests/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    environment: 'node',
  },
});
