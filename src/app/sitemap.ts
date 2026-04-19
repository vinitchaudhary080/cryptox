import type { MetadataRoute } from "next";

const SITE_URL = "https://algopulse.in";

/**
 * Lists every public route so search engines crawl the whole marketing
 * footprint in one sweep. Authenticated app routes are excluded — they're
 * blocked in robots.ts anyway.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  const routes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}`,          lastModified, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${SITE_URL}/about`,    lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/contact`,  lastModified, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/privacy`,  lastModified, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${SITE_URL}/terms`,    lastModified, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${SITE_URL}/login`,    lastModified, changeFrequency: "yearly",  priority: 0.5 },
    { url: `${SITE_URL}/signup`,   lastModified, changeFrequency: "yearly",  priority: 0.7 },
  ];

  return routes;
}
