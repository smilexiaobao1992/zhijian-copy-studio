import type { APIRoute } from 'astro';

const publicRoutes = ['/', '/studio/', '/privacy/', '/terms/'];

export const GET: APIRoute = ({ site }) => {
  if (!site) {
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" />\n',
      { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
    );
  }

  const urls = publicRoutes
    .map((route) => `  <url><loc>${new URL(route, site).href}</loc></url>`)
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
