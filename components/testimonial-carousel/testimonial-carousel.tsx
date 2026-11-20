"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

// Testimonial carousel. One quote at a time, set large, with a faint oversized
// quote mark behind it and the pager under it. Every quote sits in the same
// grid cell and only the visible one is painted; the others are faded out and
// inert.
//
// Two ways to size the frame. "snug" eases its real height to the quote on
// show, so a short quote sits close to the pager and the pager follows. The
// text never scales: the old quote is gone before the height moves, and the
// new one fades in once there is room. "tallest" holds the frame at the
// longest quote and anchors each one to its bottom, so the pager never moves.
//
// Swipe or drag sideways to step, or use the arrow keys once the pager has
// focus. While dragging, the quote leans a little with the pointer and springs
// back when let go.

export type Testimonial = {
  quote: string;
  name: string;
  role?: string;
  /** Photo URL. Without one, the initials stand in. */
  avatar?: string;
};

export type TestimonialCarouselProps = {
  testimonials?: Testimonial[];
  /** Advance on a timer, pausing while the pointer or focus is inside. */
  autoplay?: boolean;
  /** Seconds each quote stays, when autoplay is on. */
  interval?: number;
  /** "snug" eases the height to each quote; "tallest" holds it, so the pager never moves. */
  fit?: "snug" | "tallest";
  className?: string;
};

// Portraits from unsplash.com (Unsplash License), self-hosted: ZoSb5J3jU28,
// ARbIPXSI4dA, HVbaH3p9B8k, EZ4TYgXPNWk.
const TESTIMONIALS: Testimonial[] = [
  {
    quote: "We replaced three tools with this one. The team stopped asking where things live.",
    name: "Maya Chen",
    role: "Head of Product, Northwind",
    avatar: "https://uibrik.com/registry/testimonial-carousel/maya.webp",
  },
  {
    quote:
      "Setup took an afternoon. Six months later nobody has needed to think about it, which is exactly what we wanted from the infrastructure underneath our whole release process.",
    name: "Daniel Okafor",
    role: "Engineering Lead, Fieldnote",
    avatar: "https://uibrik.com/registry/testimonial-carousel/daniel.webp",
  },
  {
    quote: "Calm, fast and honest about what it does.",
    name: "Priya Raman",
    role: "Founder, Lumen",
    avatar: "https://uibrik.com/registry/testimonial-carousel/priya.webp",
  },
  {
    quote: "Our support load dropped by a third in the first quarter, and the people who stayed got better at their jobs.",
    name: "Lukas Meyer",
    role: "COO, Tidepool",
    avatar: "https://uibrik.com/registry/testimonial-carousel/lukas.webp",
  },
];

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const SWIPE = 40; // px of sideways travel that counts as a swipe

const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:focus-visible:outline-zinc-500";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function TestimonialCarousel({
  testimonials = TESTIMONIALS,
  autoplay = true,
  interval = 2,
  fit = "snug",
  className,
}: TestimonialCarouselProps) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = testimonials.length;
  const index = Math.min(active, count - 1);
  const snug = fit === "snug";

  useEffect(() => {
    if (!autoplay || paused || count < 2) return;
    const id = window.setTimeout(() => setActive((i) => (i + 1) % count), interval * 1000);
    return () => window.clearTimeout(id);
  }, [autoplay, paused, interval, count, active]);

  const step = (by: number) => setActive((i) => (Math.min(i, count - 1) + by + count) % count);

  // Snug: follow the height of the quote on show.
  const figures = useRef<(HTMLElement | null)[]>([]);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = figures.current[index];
    if (!snug || !el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [snug, index]);

  // Swiping: the quote leans with the pointer, then springs back.
  const lean = useMotionValue(0);
  const drag = useRef<{ x: number; y: number; id: number } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    // A mostly vertical move is a page scroll, not a swipe.
    if (Math.abs(e.clientY - d.y) > Math.abs(dx) && Math.abs(dx) < 10) return;
    if (!reduce) lean.set(dx * 0.25);
  };
  const endDrag = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) >= SWIPE && count > 1) step(dx < 0 ? 1 : -1);
    animate(lean, 0, { type: "spring", duration: 0.4, bounce: 0 });
  };

  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent) => {
    const by = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!by || count < 2) return;
    e.preventDefault();
    const next = (index + by + count) % count;
    setActive(next);
    tabs.current[next]?.focus();
  };

  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Testimonials"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn("relative w-full max-w-xl touch-pan-y select-none", className)}
    >
      {/* The oversized mark: shape for the block, no colour. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-16 -left-2 text-[160px] leading-none font-normal text-foreground/[0.05] sm:-left-11"
      >
        “
      </span>

      <motion.div
        // Clip only vertically, so the sideways lean isn't cut off.
        className={cn("relative", snug && "overflow-y-clip")}
        initial={false}
        animate={snug && height !== null ? { height } : { height: "auto" }}
        // Wait for the old quote to leave before the frame moves.
        transition={reduce ? { duration: 0 } : { duration: 0.35, delay: 0.1, ease: EASE_OUT }}
      >
        <motion.div className="grid" style={{ x: lean }} aria-live={autoplay ? "off" : "polite"}>
          {testimonials.map((t, i) => {
            const on = i === index;
            return (
              <motion.figure
                key={t.name}
                ref={(el) => {
                  figures.current[i] = el;
                }}
                inert={!on}
                aria-hidden={!on}
                initial={false}
                animate={{
                  opacity: on ? 1 : 0,
                  y: on ? 0 : reduce ? 0 : 10,
                  filter: on || reduce ? "blur(0px)" : "blur(4px)",
                }}
                // Out fast, then in, so two quotes are never legible at once.
                transition={
                  reduce
                    ? { duration: 0 }
                    : on
                      ? { duration: 0.35, delay: 0.15, ease: EASE_OUT }
                      : { duration: 0.15, ease: EASE_OUT }
                }
                className={cn(
                  "col-start-1 row-start-1 flex flex-col gap-8",
                  // Snug: each figure keeps its own height so it can be measured.
                  snug ? "self-start" : "justify-end",
                )}
              >
                <blockquote className="max-w-[34ch] text-pretty text-2xl leading-[1.25] font-normal tracking-[-0.02em] text-foreground sm:text-[28px]">
                  {t.quote}
                </blockquote>
                <figcaption className="flex items-center gap-3">
                  {t.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small self-hosted avatars
                    <img
                      src={t.avatar}
                      alt=""
                      width={40}
                      height={40}
                      decoding="async"
                      draggable={false}
                      className="edge-tile size-10 shrink-0 rounded-full bg-muted object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="edge-tile grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-medium text-foreground"
                    >
                      {initials(t.name)}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">{t.name}</span>
                    {t.role && <span className="truncate text-[13px] text-muted-foreground">{t.role}</span>}
                  </span>
                </figcaption>
              </motion.figure>
            );
          })}
        </motion.div>
      </motion.div>

      <div className="mt-8 flex items-center gap-1" role="tablist" aria-label="Choose a testimonial" onKeyDown={onKeyDown}>
        {testimonials.map((t, i) => {
          const on = i === index;
          return (
            <button
              key={t.name}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              aria-label={`${t.name}, ${i + 1} of ${count}`}
              onClick={() => setActive(i)}
              className={cn("grid h-6 place-items-center rounded-full px-0.5", FOCUS)}
            >
              <span
                className={cn(
                  "block h-1.5 rounded-full transition-[width,background-color] duration-300",
                  on ? "w-6 bg-foreground" : "w-1.5 bg-foreground/25 hover:bg-foreground/45",
                )}
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
