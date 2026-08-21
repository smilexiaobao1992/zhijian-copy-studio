import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: process.env.SITE_URL,
  integrations: [react()],
  output: 'static',
  devToolbar: {
    enabled: false,
  },
  build: {
    format: 'directory',
  },
});
