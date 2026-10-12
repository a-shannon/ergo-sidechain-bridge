import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Preserve the source inventory after TypeScript emits compiled tests.
    exclude: [...configDefaults.exclude, '**/dist/**'],
    setupFiles: ['./src/test-node-env.ts'],
  },
});
