import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    directory: 'src/__tests__',
    include: ['**/*.test.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
    },
  },
});
