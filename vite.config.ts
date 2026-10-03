import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
    sourcemap: false,
  },
  test: {
    exclude: ['node_modules/**', 'dist/**', '.runtime/**', '.stryker-tmp/**'],
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      reporter: ['text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}', 'electron/**/*.cjs'],
      exclude: ['src/env.d.ts', 'src/main.tsx'],
    },
  },
});
