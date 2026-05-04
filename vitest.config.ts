import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000,
    include: ['tests/**/*.test.ts', 'src/**/*.test.{ts,tsx}'],
    exclude: ['tests/compile-quality.test.ts', 'node_modules'],
    setupFiles: ['./src/test-utils/setup.ts'],
  },
})
