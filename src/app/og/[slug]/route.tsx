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

/* ─── Palette — hex so satori renders consistently across environments ─── */
const INK = "#1e3a8a"; // deep royal blue for title text (algopulse brand)
const INK_SOFT = "#334e7e"; // muted blue for meta
const ACCENT = "#3b82f6"; // primary accent blue
const PILL_BG = "#dbeafe"; // soft blue fill for category pill
const BG_FROM = "#f8faff"; // near-white top-left
const BG_TO = "#e0e7ff"; // pale blue bottom-right
const COIN_SHADOW = "#1d4ed8";
const COIN_HIGHLIGHT = "#60a5fa";

/* ─── Per-category hero visual + badge colour — picks the decorative
       element on the right of the image so each category looks distinct
       at a glance in search/WhatsApp previews. ─── */
function heroForCategory(category: BlogCategory) {
  switch (category) {
    case "Getting Started":
      return { emoji: "🚀", tint: "#eef2ff" };
    case "Broker Setup":
      return { emoji: "🔌", tint: "#f0fdf4" };
    case "Strategies":
      return { emoji: "⚡", tint: "#fef3c7" };
    case "Backtesting":
      return { emoji: "📊", tint: "#fae8ff" };
    case "Risk & Safety":
      return { emoji: "🛡️", tint: "#fee2e2" };
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const blog = getBlogBySlug(slug);

  if (!blog) {
    return new Response("Not found", { status: 404 });
  }

  const hero = heroForCategory(blog.category);

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
              "radial-gradient(circle at 1px 1px, rgba(59, 130, 246, 0.08) 1px, transparent 0)",
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
          {/* Brand row */}
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {/* Logo mark — inline SVG to avoid external fetch */}
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: `linear-gradient(135deg, ${ACCENT} 0%, ${COIN_SHADOW} 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: 28,
                fontWeight: 800,
                letterSpacing: "-0.03em",
                boxShadow: "0 4px 12px rgba(30, 58, 138, 0.2)",
              }}
            >
              A
            </div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: INK,
                letterSpacing: "-0.02em",
              }}
            >
              AlgoPulse
            </div>
          </div>

          {/* Title + category */}
          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            {/* Category pill */}
            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                padding: "8px 18px",
                borderRadius: 999,
                background: PILL_BG,
                color: ACCENT,
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: "-0.01em",
              }}
            >
              {blog.category}
            </div>

            {/* The actual headline */}
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
                  background: ACCENT,
                }}
              />
              <div style={{ display: "flex" }}>{blog.author}</div>
            </div>
            <div style={{ color: "#94a3b8", display: "flex" }}>·</div>
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
          {/* Outer glow halo */}
          <div
            style={{
              position: "absolute",
              width: 340,
              height: 340,
              borderRadius: 999,
              background: `radial-gradient(circle, ${hero.tint} 0%, transparent 70%)`,
            }}
          />

          {/* Satellite coins — decorative only, no symbols so we avoid
              satori missing-glyph tofu boxes for Ξ / ◎ / ✕ etc. */}
          <div
            style={{
              position: "absolute",
              top: 24,
              right: 4,
              width: 72,
              height: 72,
              borderRadius: 999,
              background: `linear-gradient(135deg, ${COIN_HIGHLIGHT}, ${ACCENT})`,
              boxShadow:
                "0 8px 20px rgba(30, 58, 138, 0.2), inset 0 2px 0 rgba(255,255,255,0.35)",
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
              background: `linear-gradient(135deg, #93c5fd, #6366f1)`,
              boxShadow:
                "0 8px 20px rgba(30, 58, 138, 0.18), inset 0 2px 0 rgba(255,255,255,0.3)",
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
              background: `linear-gradient(135deg, #c4b5fd, #818cf8)`,
              boxShadow:
                "0 8px 20px rgba(30, 58, 138, 0.15), inset 0 2px 0 rgba(255,255,255,0.3)",
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
              background: `linear-gradient(135deg, #a5b4fc, #6366f1)`,
              boxShadow:
                "0 6px 16px rgba(30, 58, 138, 0.15), inset 0 2px 0 rgba(255,255,255,0.3)",
              display: "flex",
            }}
          />

          {/* Main hero coin — category emoji front-and-center */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 200,
              height: 200,
              borderRadius: 999,
              background: `linear-gradient(135deg, ${ACCENT} 0%, ${COIN_SHADOW} 100%)`,
              boxShadow:
                "0 20px 48px rgba(30, 58, 138, 0.28), inset 0 2px 0 rgba(255,255,255,0.25)",
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
