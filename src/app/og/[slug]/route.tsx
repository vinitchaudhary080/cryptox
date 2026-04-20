/**
 * Per-blog OG / thumbnail image.
 *   GET /og/{slug}  →  image/png 1200×630
 *
 * Built with Next.js ImageResponse (satori under the hood). Zero deps,
 * regenerates on-demand at request time, gets cached by Vercel's CDN.
 * Used by <img> tags on the blog list/detail pages and by OG meta tags
 * for WhatsApp/Twitter/LinkedIn previews.
 */

import { ImageResponse } from "next/og";
import { getBlogBySlug, type BlogCategory } from "@/data/blogs";

export const runtime = "edge";
export const contentType = "image/png";
export const size = { width: 1200, height: 630 };

/* ─── Palette — tuned to the brand logo (#0089FF accent on light bg) ─── */
const INK = "#0A2540"; // deep navy for title text, readable on light bg
const INK_SOFT = "#5B7A99"; // muted blue-gray for meta text
const BRAND = "#0089FF"; // primary brand blue (matches lightlogo.svg 'P')
const BRAND_DEEP = "#006BC7"; // slightly darker shade for gradient depth
const BRAND_LIGHT = "#4DB2FF"; // lighter shade for coin highlights
const PILL_BG = "#E0F0FF"; // very light brand-tinted blue for category pill
const BG_FROM = "#FFFFFF"; // pure white top-left
const BG_TO = "#D9ECFF"; // soft brand-tinted blue bottom-right

/* ─── Per-category hero visual + halo tint — picks the decorative
       element on the right of the image so each category looks distinct
       at a glance in search/WhatsApp previews. Halo now uses the brand
       accent so nothing feels muddy or dark. ─── */
function heroForCategory(category: BlogCategory) {
  switch (category) {
    case "Getting Started":
      return { emoji: "🚀", halo: "#D0E9FF" };
    case "Broker Setup":
      return { emoji: "🔌", halo: "#CFE8FF" };
    case "Strategies":
      return { emoji: "⚡", halo: "#D6EBFF" };
    case "Backtesting":
      return { emoji: "📊", halo: "#CFE6FF" };
    case "Risk & Safety":
      return { emoji: "🛡️", halo: "#D8ECFF" };
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const blog = getBlogBySlug(slug);

  if (!blog) {
    return new Response("Not found", { status: 404 });
  }

  const hero = heroForCategory(blog.category);

  // Fetch the real brand logo at runtime so the thumbnail uses the exact
  // same SVG the rest of the site ships. Edge runtime supports fetch on
  // the same origin; result is inlined as a data URL so satori renders it
  // as an image.
  let logoDataUrl: string | null = null;
  try {
    const origin = new URL(req.url).origin;
    const res = await fetch(`${origin}/lightlogo.svg`);
    if (res.ok) {
      const svg = await res.text();
      logoDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    }
  } catch {
    // Fall back to the lettermark below if the fetch fails for any reason.
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          padding: "64px 72px",
          position: "relative",
          background: `linear-gradient(135deg, ${BG_FROM} 0%, ${BG_TO} 100%)`,
          fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
        }}
      >
        {/* Subtle grid pattern — adds texture without being loud */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(0, 137, 255, 0.08) 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />

        {/* ── LEFT: brand + title + meta ────────────────────────────── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
            maxWidth: "720px",
            zIndex: 1,
          }}
        >
          {/* Brand logo */}
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoDataUrl}
              alt="AlgoPulse"
              width={220}
              height={64}
              style={{ display: "flex", objectFit: "contain" }}
            />
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                fontSize: 30,
                fontWeight: 700,
                color: INK,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: `linear-gradient(135deg, ${BRAND_LIGHT}, ${BRAND})`,
                  color: "white",
                  fontSize: 28,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                A
              </div>
              AlgoPulse
            </div>
          )}

          {/* Title + category */}
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                padding: "8px 18px",
                borderRadius: 999,
                background: PILL_BG,
                color: BRAND_DEEP,
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: "-0.01em",
              }}
            >
              {blog.category}
            </div>

            <div
              style={{
                fontSize: blog.title.length > 60 ? 54 : 62,
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: "-0.03em",
                color: INK,
                display: "flex",
              }}
            >
              {blog.title}
            </div>
          </div>

          {/* Meta row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "20px",
              fontSize: 22,
              color: INK_SOFT,
              fontWeight: 500,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: BRAND,
                }}
              />
              <div style={{ display: "flex" }}>{blog.author}</div>
            </div>
            <div style={{ color: "#CBD5E1", display: "flex" }}>·</div>
            <div style={{ display: "flex" }}>{blog.readTime} read</div>
          </div>
        </div>

        {/* ── RIGHT: decorative "coin stack" illustration ────────────── */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 360,
            position: "relative",
            zIndex: 1,
          }}
        >
          {/* Soft brand-tinted halo behind the main coin — no more dark tint */}
          <div
            style={{
              position: "absolute",
              width: 340,
              height: 340,
              borderRadius: 999,
              background: `radial-gradient(circle, ${hero.halo} 0%, transparent 70%)`,
            }}
          />

          {/* Satellite coins — decorative only, no symbols so we avoid
              satori missing-glyph tofu boxes for Ξ / ◎ / ✕ etc. All
              gradients pulled from the brand blue family. */}
          <div
            style={{
              position: "absolute",
              top: 24,
              right: 4,
              width: 72,
              height: 72,
              borderRadius: 999,
              background: `linear-gradient(135deg, ${BRAND_LIGHT}, ${BRAND})`,
              boxShadow:
                "0 8px 20px rgba(0, 137, 255, 0.25), inset 0 2px 0 rgba(255,255,255,0.35)",
              display: "flex",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 40,
              right: 28,
              width: 60,
              height: 60,
              borderRadius: 999,
              background: `linear-gradient(135deg, #7FC4FF, ${BRAND})`,
              boxShadow:
                "0 8px 20px rgba(0, 137, 255, 0.22), inset 0 2px 0 rgba(255,255,255,0.3)",
              display: "flex",
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 92,
              left: 16,
              width: 52,
              height: 52,
              borderRadius: 999,
              background: `linear-gradient(135deg, #A5D6FF, ${BRAND_LIGHT})`,
              boxShadow:
                "0 8px 20px rgba(0, 137, 255, 0.18), inset 0 2px 0 rgba(255,255,255,0.3)",
              display: "flex",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 24,
              left: 44,
              width: 42,
              height: 42,
              borderRadius: 999,
              background: `linear-gradient(135deg, #B8DEFF, ${BRAND_LIGHT})`,
              boxShadow:
                "0 6px 16px rgba(0, 137, 255, 0.18), inset 0 2px 0 rgba(255,255,255,0.3)",
              display: "flex",
            }}
          />

          {/* Main hero coin — category emoji front-and-center, brand blue */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 200,
              height: 200,
              borderRadius: 999,
              background: `linear-gradient(135deg, ${BRAND_LIGHT} 0%, ${BRAND} 50%, ${BRAND_DEEP} 100%)`,
              boxShadow:
                "0 20px 48px rgba(0, 137, 255, 0.32), inset 0 2px 0 rgba(255,255,255,0.25)",
              position: "relative",
            }}
          >
            <div
              style={{
                fontSize: 92,
                lineHeight: 1,
                filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.15))",
                display: "flex",
              }}
            >
              {hero.emoji}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      headers: {
        "Cache-Control": "public, immutable, no-transform, max-age=31536000",
      },
    },
  );
}
