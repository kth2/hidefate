import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@hidefate/core-bazi': r('./packages/core-bazi/src/index.ts'),
      '@hidefate/core-fengshui': r('./packages/core-fengshui/src/index.ts'),
      '@hidefate/core-qimen': r('./packages/core-qimen/src/index.ts'),
      '@hidefate/core-synthesis': r('./packages/core-synthesis/src/index.ts'),
    },
  },
});
