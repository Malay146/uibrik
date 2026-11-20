"use client";

import { motion, useMotionValue, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Space around the large title, in px.
const PAD_X = 16;
const PAD_TOP = 4;
const PAD_BOTTOM = 12;
const LINE = 1.2;

export type LargeTitleHeaderProps = {
  title: string;
  /** Content for the start of the bar, such as a back button. */
  leading?: ReactNode;
  /** Content for the end of the bar, such as actions. */
  trailing?: ReactNode;
  /** The scrolling content under the title. */
  children?: ReactNode;
  /** Where the title docks in the bar. */
  align?: "center" | "leading";
  /** Font size of the large title in px. */
  largeSize?: number;
  /** Font size of the docked title in px. */
  smallSize?: number;
  /** Height of the bar in px. */
  barHeight?: number;
  /** When scrolling stops halfway, settle on fully open or fully docked. */
  snap?: boolean;
  /** Classes for the scroller. Give it a height. */
  className?: string;
};

export function LargeTitleHeader({
  title,
  leading,
  trailing,
  children,
  align = "center",
  largeSize = 32,
  smallSize = 17,
  barHeight = 52,
  snap = true,
  className,
}: LargeTitleHeaderProps) {
  const reduce = useReducedMotion();
  const scroller = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const leadRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll({ container: scroller });

  // Widths of the scroller, the title and the leading slot, read on resize so
  // the scroll handler never touches layout.
  const geo = useMotionValue({ width: 0, title: 0, lead: 0 });

  const height = largeSize * LINE;
  const ratio = smallSize / largeSize;
  const fromY = barHeight + PAD_TOP;
  const toY = (barHeight - height * ratio) / 2;
  // The title rides up with the content until it reaches the bar, so it never
  // drifts against the list beneath it.
  const travel = fromY - toY;
  const spacer = PAD_TOP + height + PAD_BOTTOM;

  const k = useTransform(scrollY, (s) => Math.min(Math.max(s / travel, 0), 1));
  const y = useTransform(k, (t) => fromY - t * travel);
  const scale = useTransform(k, (t) => 1 + t * (ratio - 1));
  const x = useTransform(() => {
    const t = k.get();
    const g = geo.get();
    const to = align === "center" ? (g.width - g.title * ratio) / 2 : g.lead ? g.lead + 4 : PAD_X;
    return PAD_X + t * (to - PAD_X);
  });
  // The bar fills in once the content starts passing under it.
  const fill = useTransform(scrollY, [travel, spacer], [0, 1]);

  useLayoutEffect(() => {
    const el = scroller.current;
    const t = titleRef.current;
    if (!el || !t) return;
    const read = () => {
      const lead = leadRef.current;
      geo.set({
        width: el.clientWidth,
        title: t.offsetWidth,
        lead: lead?.offsetWidth ? lead.getBoundingClientRect().right - el.getBoundingClientRect().left : 0,
      });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    ro.observe(t);
    if (leadRef.current) ro.observe(leadRef.current);
    return () => ro.disconnect();
  }, [geo, title, leading]);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !snap) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      const s = el.scrollTop;
      if (s <= 0 || s >= spacer) return;
      el.scrollTo({ top: s < spacer / 2 ? 0 : spacer, behavior: reduce ? "auto" : "smooth" });
    };
    // Safari before 26 has no scrollend; a short quiet period stands in for it.
    const native = "onscrollend" in window;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(settle, 140);
    };
    if (native) el.addEventListener("scrollend", settle);
    else el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      el.removeEventListener("scrollend", settle);
      el.removeEventListener("scroll", onScroll);
    };
  }, [snap, spacer, reduce]);

  return (
    <div ref={scroller} className={cn("relative h-full overflow-y-auto overscroll-contain bg-background", className)}>
      <div className="sticky top-0 z-20" style={{ height: barHeight }}>
        <motion.div
          aria-hidden
          style={{ opacity: fill }}
          className="absolute inset-0 bg-background/80 shadow-[inset_0_-1px_0_var(--border)] backdrop-blur-md"
        />
        <div className="relative flex h-full items-center justify-between gap-2 px-2">
          <div ref={leadRef} className="flex min-w-0 items-center">
            {leading}
          </div>
          <div className="flex items-center">{trailing}</div>
        </div>
        {/* One heading from start to end: it moves and scales as a whole, so the
            words keep their proportions and never swap for a second copy. */}
        <motion.h1
          ref={titleRef}
          style={{ x, y, scale, fontSize: largeSize, lineHeight: LINE, maxWidth: `calc(100% - ${PAD_X * 2}px)` }}
          className="pointer-events-none absolute left-0 top-0 origin-top-left truncate font-semibold tracking-tight text-foreground"
        >
          {title}
        </motion.h1>
      </div>
      <div aria-hidden style={{ height: spacer }} />
      {children}
    </div>
  );
}
