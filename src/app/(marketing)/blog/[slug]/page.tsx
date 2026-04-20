import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Calendar, Clock, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BlogRenderer } from "@/components/blog/blog-renderer";
import { getBlogBySlug, getBlogs } from "@/data/blogs";
import { Logo } from "@/components/ui/logo";

type Params = { slug: string };

export function generateStaticParams() {
  return getBlogs().map((b) => ({ slug: b.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const blog = getBlogBySlug(slug);
  if (!blog) return {};
  const url = `https://algopulse.in/blog/${blog.slug}`;
  const ogImage = `https://algopulse.in/og/${blog.slug}?v=3`;
  return {
    title: blog.title,
    description: blog.description,
    authors: [{ name: blog.author }],
    alternates: { canonical: url },
    keywords: blog.tags,
    openGraph: {
      type: "article",
      url,
      title: blog.title,
      description: blog.description,
      publishedTime: blog.publishedAt,
      authors: [blog.author],
      tags: blog.tags,
      images: [{ url: ogImage, width: 1200, height: 630, alt: blog.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: blog.title,
      description: blog.description,
      images: [ogImage],
    },
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const blog = getBlogBySlug(slug);
  if (!blog) return notFound();

  const all = getBlogs();
  const related = all
    .filter((b) => b.slug !== blog.slug && b.category === blog.category)
    .slice(0, 3);

  // BlogPosting structured data — rich results on Google for articles.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: blog.title,
    description: blog.description,
    datePublished: blog.publishedAt,
    dateModified: blog.publishedAt,
    author: { "@type": "Organization", name: blog.author, url: "https://algopulse.in" },
    publisher: {
      "@type": "Organization",
      name: "AlgoPulse",
      logo: { "@type": "ImageObject", url: "https://algopulse.in/logo.svg" },
    },
    mainEntityOfPage: `https://algopulse.in/blog/${blog.slug}`,
    keywords: blog.tags.join(", "),
  };

  return (
    <div className="min-h-screen">
      <script type="application/ld+json" suppressHydrationWarning>
        {JSON.stringify(jsonLd)}
      </script>

      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-7 w-auto" />
          </Link>
          <Link
            href="/signup"
            className="text-sm font-medium text-primary hover:underline"
          >
            Start free →
          </Link>
        </div>
      </header>

      {/* Article */}
      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        <Link
          href="/blog"
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> All articles
        </Link>

        {/* Hero image — same programmatic OG asset used in social shares */}
        <div className="mb-8 aspect-[1200/630] overflow-hidden rounded-2xl border border-border/50 bg-muted/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/og/${blog.slug}?v=3`}
            alt={blog.title}
            className="h-full w-full object-cover"
          />
        </div>

        <Badge
          variant="secondary"
          className="mb-4 border-primary/30 bg-primary/10 text-primary"
        >
          {blog.category}
        </Badge>

        <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl md:text-4xl">
          {blog.title}
        </h1>

        <p className="mt-3 text-base text-muted-foreground sm:text-lg">
          {blog.description}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-border/40 py-4 text-xs text-muted-foreground">
          <span>
            By <span className="font-medium text-foreground">{blog.author}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3 w-3" /> {formatDate(blog.publishedAt)}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3 w-3" /> {blog.readTime} read
          </span>
        </div>

        <div className="mt-8">
          <BlogRenderer blocks={blog.content} />
        </div>

        {/* Tags */}
        {blog.tags.length > 0 && (
          <div className="mt-10 flex flex-wrap gap-1.5 border-t border-border/40 pt-6">
            {blog.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-[11px]">
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        {/* CTA */}
        <div className="mt-10 rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center sm:p-8">
          <h3 className="text-lg font-bold tracking-tight sm:text-xl">
            Ready to try it yourself?
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            AlgoPulse is free — no credit card, no subscription. Connect your
            broker and deploy a strategy in 15 minutes.
          </p>
          <Link
            href="/signup"
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Get started free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </article>

      {/* Related */}
      {related.length > 0 && (
        <section className="border-t border-border/30 bg-muted/20 py-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="mb-6 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              More on {blog.category}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/blog/${r.slug}`}
                  className="group block h-full"
                >
                  <Card className="h-full overflow-hidden border-border/60 transition-all group-hover:border-primary/40">
                    <div className="aspect-[1200/630] overflow-hidden bg-muted/30">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/og/${r.slug}?v=3`}
                        alt={r.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    </div>
                    <CardContent className="p-5">
                      <h3 className="mb-2 line-clamp-2 text-base font-semibold leading-snug">
                        {r.title}
                      </h3>
                      <p className="mb-3 line-clamp-2 text-[13px] text-muted-foreground">
                        {r.description}
                      </p>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{formatDate(r.publishedAt)}</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {r.readTime}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
