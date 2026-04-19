/**
 * Renders a Block[] (from src/data/blogs.ts) as typography-friendly JSX.
 * Kept minimal on purpose — no markdown parser, no external deps.
 */

import type { Block } from "@/data/blogs";
import { Lightbulb, AlertTriangle, Info } from "lucide-react";

export function BlogRenderer({ blocks }: { blocks: Block[] }) {
  return (
    <article className="prose-sensible">
      {blocks.map((block, i) => renderBlock(block, i))}
    </article>
  );
}

function renderBlock(b: Block, i: number) {
  switch (b.type) {
    case "p":
      return (
        <p key={i} className="mb-5 text-[15px] leading-[1.75] text-foreground/85 sm:text-base">
          {b.text}
        </p>
      );
    case "h2":
      return (
        <h2
          key={i}
          className="mt-10 mb-4 text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
        >
          {b.text}
        </h2>
      );
    case "h3":
      return (
        <h3
          key={i}
          className="mt-6 mb-2 text-base font-semibold tracking-tight text-foreground sm:text-lg"
        >
          {b.text}
        </h3>
      );
    case "ul":
      return (
        <ul key={i} className="mb-5 space-y-2 pl-5">
          {b.items.map((item, j) => (
            <li
              key={j}
              className="relative list-none text-[15px] leading-[1.65] text-foreground/85 before:absolute before:-left-5 before:top-[0.6em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-primary/60 sm:text-base"
            >
              {item}
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol key={i} className="mb-5 list-decimal space-y-2 pl-5 marker:font-semibold marker:text-primary">
          {b.items.map((item, j) => (
            <li key={j} className="text-[15px] leading-[1.65] text-foreground/85 sm:text-base">
              {item}
            </li>
          ))}
        </ol>
      );
    case "callout": {
      const { icon: Icon, color } = calloutStyle(b.kind);
      return (
        <aside
          key={i}
          className={`my-6 flex gap-3 rounded-xl border p-4 ${color}`}
        >
          <Icon className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            {b.title && <p className="mb-1 text-sm font-semibold">{b.title}</p>}
            <p className="text-sm leading-relaxed">{b.text}</p>
          </div>
        </aside>
      );
    }
    case "code":
      return (
        <pre
          key={i}
          className="mb-5 overflow-x-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-[13px] leading-[1.6]"
        >
          <code className="font-mono text-foreground/90">{b.code}</code>
        </pre>
      );
    case "quote":
      return (
        <blockquote
          key={i}
          className="my-6 border-l-2 border-primary/50 bg-primary/5 px-5 py-3 text-[15px] italic leading-relaxed text-foreground/85 sm:text-base"
        >
          {b.text}
        </blockquote>
      );
  }
}

function calloutStyle(kind: "tip" | "warn" | "info") {
  if (kind === "tip") {
    return { icon: Lightbulb, color: "border-profit/30 bg-profit/5 text-profit" };
  }
  if (kind === "warn") {
    return { icon: AlertTriangle, color: "border-warning/30 bg-warning/5 text-warning" };
  }
  return { icon: Info, color: "border-primary/30 bg-primary/5 text-primary" };
}
