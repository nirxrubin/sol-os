// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  server: { host: true },
  vite: {
    resolve: {
      alias: { '~': new URL('./src', import.meta.url).pathname },
    },
  },
});
