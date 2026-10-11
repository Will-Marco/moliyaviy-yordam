import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// Runs the whole e2e suite against a local PGlite database instead of server PostgreSQL (M9a).
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup-env.pglite.ts'],
    fileParallelism: false,
  },
});
