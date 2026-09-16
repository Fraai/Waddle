import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  // Sidebar links prefetch on hover, so switching views lands instantly.
  prefetch: { defaultStrategy: 'hover' },
  vite: {
    plugins: [tailwindcss()],
  },
});
