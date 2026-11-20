"use client";

// The small "New · ..." link that sits above a hero heading. A thin band of
// light runs once along its border when it appears and again on hover, and
// the arrow grows a stem as it steps forward, so the pill reads as a link
// without shouting.

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export type AnnouncementPillProps = {
  /** Short tag on the left, e.g. "New". Empty hides it. */
  tag?: string;
  children?: ReactNode;
  /** Renders a link when set, a button otherwise. */
  href?: string;
  onClick?: () => void;
  /** Muted tag, or filled with the foreground colour. */
  tagStyle?: "soft" | "solid";
  /** When the light runs along the border. */
  shimmer?: "once" | "hover" | "off";
  className?: string;
};

export function AnnouncementPill({
  tag = "New",
  children = "Introducing the v2 components",
  href,
  onClick,
  tagStyle = "soft",
  shimmer = "once",
  className,
}: AnnouncementPillProps) {
  const reduce = useReducedMotion();
  // Each bump replays the sweep; one in flight blocks the next.
  const [sweep, setSweep] = useState(0);
  const running = useRef(false);

  const run = () => {
    if (reduce || shimmer === "off" || running.current) return;
    running.current = true;
    setSweep((n) => n + 1);
  };

  useEffect(() => {
    if (shimmer !== "once") return;
    const t = setTimeout(run, 500);
    return () => clearTimeout(t);
    // Only on mount, or when switched to "once".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shimmer]);

  const Tag = href ? "a" : "button";

  return (
    <Tag
      {...(href ? { href } : { type: "button" as const })}
      onClick={onClick}
      onPointerEnter={run}
      className={cn(
        "group relative inline-flex h-8 cursor-pointer items-center gap-2 rounded-full bg-background pr-3 text-[13px] text-foreground outline-none",
        "shadow-[inset_0_0_0_1px_var(--border),0_1px_2px_rgb(0_0_0/0.04)] transition-colors duration-200 hover:bg-muted/60",
        "focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        tag ? "pl-1" : "pl-3",
        className,
      )}
    >
      {tag && (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            tagStyle === "solid" ? "bg-foreground text-background" : "bg-muted text-foreground",
          )}
        >
          {tag}
        </span>
      )}
      <span className="whitespace-nowrap">{children}</span>
      <Arrow />

      {/* The border, cut out with a mask, holds the travelling light. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-full p-px"
        style={{
          mask: "linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)",
          WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          WebkitMaskComposite: "xor",
        }}
      >
        {sweep > 0 && (
          <motion.span
            key={sweep}
            className="absolute inset-y-0 left-0 w-1/3"
            style={{ background: "linear-gradient(90deg, transparent, var(--foreground), transparent)" }}
            initial={{ x: "-100%", opacity: 0 }}
            animate={{ x: "300%", opacity: [0, 0.7, 0.7, 0] }}
            transition={{ duration: 0.9, ease: EASE_OUT }}
            onAnimationComplete={() => {
              running.current = false;
            }}
          />
        )}
      </span>
    </Tag>
  );
}

// A chevron that steps right on hover while a stem draws in behind it.
function Arrow() {
  return (
    <svg
      aria-hidden
      width={12}
      height={12}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="-ml-0.5 shrink-0 text-muted-foreground transition-colors duration-200 group-hover:text-foreground"
    >
      <path
        d="M1.5 6h7"
        className="origin-right scale-x-0 opacity-0 transition-[transform,opacity] duration-200 ease-[var(--ease-out-strong,cubic-bezier(0.23,1,0.32,1))] group-hover:scale-x-100 group-hover:opacity-100"
        style={{ transformBox: "fill-box" }}
      />
      <path
        d="M4.5 2.5 8 6 4.5 9.5"
        className="transition-transform duration-200 ease-[var(--ease-out-strong,cubic-bezier(0.23,1,0.32,1))] group-hover:translate-x-[1.5px]"
      />
    </svg>
  );
}
