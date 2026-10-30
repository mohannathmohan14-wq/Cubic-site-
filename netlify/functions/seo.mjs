// Serves /sitemap.xml and /robots.txt using the address the site is actually opened on,
// so nothing needs editing when you move from *.netlify.app to your own domain.
// Optional: set env SITE_URL (e.g. https://yourdomain.com) to force one address.
const LASTMOD = "2026-10-30"; // update when the public page content changes

export default async (req) => {
  const url = new URL(req.url);
  const fwd = req.headers.get("x-forwarded-host") || req.headers.get("host") || url.host;
  let origin = (process.env.SITE_URL || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(origin)) origin = `https://${fwd.split(",")[0].trim()}`;
  const isSitemap = url.pathname.endsWith("sitemap.xml") || url.searchParams.get("f") === "sitemap";

  if (isSitemap) {
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${origin}/</loc>
    <lastmod>${LASTMOD}</lastmod>
  </url>
</urlset>
`;
    return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  }

  const body = `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${origin}/sitemap.xml
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
};
