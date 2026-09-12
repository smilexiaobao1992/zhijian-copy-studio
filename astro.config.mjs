import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

const siteUrl = process.env.SITE_URL?.trim() || 'https://zhijian.yaoyiqian.com';
const site = new URL(siteUrl);
if (!['http:', 'https:'].includes(site.protocol) || site.pathname !== '/' || site.search || site.hash || site.username || site.password) {
  throw new Error('SITE_URL 必须是无路径、查询参数和认证信息的 http(s) 站点根地址');
}

export default defineConfig({
  site: siteUrl,
  integrations: [react()],
  output: 'static',
  devToolbar: {
    enabled: false,
  },
  build: {
    format: 'directory',
  },
});
