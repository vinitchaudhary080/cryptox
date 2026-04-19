"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Calendar, Clock, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getBlogs, type BlogCategory } from "@/data/blogs";
import { Logo } from "@/components/ui/logo";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};
const stagger = { visible: { transition: { staggerChildren: 0.05 } } };

const CATEGORIES: Array<BlogCategory | "All"> = [
  "All",
  "Getting Started",
  "Broker Setup",
  "Strategies",
  "Backtesting",
  "Risk & Safety",
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function BlogListPage() {
  const allBlogs = getBlogs();
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]>("All");

  const filtered =
    activeCategory === "All"
      ? allBlogs
      : allBlogs.filter((b) => b.category === activeCategory);

  const [latest, ...rest] = filtered;

  return (
    <div className="min-h-screen">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
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

      {/* Hero */}
      <section className="border-b border-border/30 bg-muted/20 py-12 sm:py-16">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={stagger}
          className="mx-auto max-w-6xl px-4 sm:px-6"
        >
          <motion.div variants={fadeUp}>
            <Link
              href="/"
              className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back to home
            </Link>
          </motion.div>
          <motion.h1
            variants={fadeUp}
            className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl"
          >
            The AlgoPulse Blog
          </motion.h1>
          <motion.p
            variants={fadeUp}
            className="mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base"
          >
            Plain-English guides to connecting your broker, deploying strategies,
            reading backtest reports, and getting the most out of free algo
            trading on Indian exchanges.
          </motion.p>

          {/* Category filter */}
          <motion.div
            variants={fadeUp}
            className="mt-6 flex flex-wrap gap-1.5 overflow-x-auto pb-1"
          >
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                  activeCategory === cat
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 bg-card/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* Featured (latest) */}
      {latest && (
        <section className="border-b border-border/30 py-10">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
            className="mx-auto max-w-6xl px-4 sm:px-6"
          >
            <motion.p
              variants={fadeUp}
              className="mb-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Latest
            </motion.p>
            <motion.div variants={fadeUp}>
              <Link href={`/blog/${latest.slug}`}>
                <Card className="group overflow-hidden border-border/60 transition-all hover:border-primary/40 hover:shadow-lg">
                  <CardContent className="p-6 sm:p-8">
                    <div className="mb-3 flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className="border-primary/30 bg-primary/10 text-primary"
                      >
                        {latest.category}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" /> {formatDate(latest.publishedAt)}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" /> {latest.readTime}
                      </span>
                    </div>
                    <h2 className="text-xl font-bold leading-snug tracking-tight sm:text-2xl md:text-3xl">
                      {latest.title}
                    </h2>
                    <p className="mt-3 text-sm text-muted-foreground sm:text-base">
                      {latest.description}
                    </p>
                    <div className="mt-5 flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        By <span className="font-medium text-foreground">{latest.author}</span>
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-primary group-hover:gap-2"
                      >
                        Read article <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </motion.div>
          </motion.div>
        </section>
      )}

      {/* Grid */}
      <section className="py-12 pb-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <p className="mb-5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            All articles
          </p>
          {rest.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No articles in this category yet.
            </p>
          ) : (
            <motion.div
              initial="hidden"
              animate="visible"
              variants={stagger}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            >
              {rest.map((blog) => (
                <motion.div key={blog.slug} variants={fadeUp}>
                  <Link href={`/blog/${blog.slug}`} className="group block h-full">
                    <Card className="h-full border-border/60 transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md">
                      <CardContent className="flex h-full flex-col p-5">
                        <Badge
                          variant="secondary"
                          className="mb-3 w-fit text-[10px]"
                        >
                          {blog.category}
                        </Badge>
                        <h3 className="mb-2 line-clamp-2 text-base font-semibold leading-snug tracking-tight">
                          {blog.title}
                        </h3>
                        <p className="mb-4 line-clamp-3 flex-1 text-[13px] leading-relaxed text-muted-foreground">
                          {blog.description}
                        </p>
                        <div className="mt-auto flex items-center justify-between border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
                          <span>{formatDate(blog.publishedAt)}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {blog.readTime}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </section>
    </div>
  );
}
