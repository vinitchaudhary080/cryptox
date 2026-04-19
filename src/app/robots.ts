import type { MetadataRoute } from "next";

const SITE_URL = "https://algopulse.in";

/**
 * Tells crawlers what to index and where the sitemap lives.
 * Authenticated routes under /dashboard, /brokers, etc. are blocked
 * because they only render behind the AuthGuard anyway — Google would
 * just hit the login redirect and waste crawl budget.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/dashboard/",
          "/brokers",
          "/brokers/",
          "/deployed",
          "/deployed/",
          "/backtest",
          "/backtest/",
          "/reports",
          "/reports/",
          "/settings",
          "/settings/",
          "/billing",
          "/billing/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
