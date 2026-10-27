import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['server/test/**/*.test.ts', 'shared/**/*.test.ts'],
    testTimeout: 10000,
    // The installer runs these tests on the sanctuary PC next to the real Eos: never touch its ports.
    setupFiles: ['server/test/setup/eos-port-guard.ts'],
  },
});
