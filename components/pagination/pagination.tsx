"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { IconChevronLeft, IconChevronRight, IconDots } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// Pagination. The bar always shows the same number of slots, so it never
// changes width as you move. The current-page pill slides from slot to slot,
// and when the window of pages shifts, each slot's number rolls to its new
// value digit by digit like an odometer, up when you go forward and down
// when you go back, so you can see which way you moved.
//
// An ellipsis opens into a small field: type a page and press Enter to jump.
// In a narrow container the slots give way to a rolling "3 / 20".

export type PaginationProps = {
  /** Number of pages. */
  total: number;
  /** Current page, from 1 (controlled). Pair with `onPageChange`. */
  page?: number;
  /** Page on mount (uncontrolled). */
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  /** Pages shown either side of the current one. */
  siblings?: number;
  /** Pages always shown at each end. */
  boundaries?: number;
  /** An ellipsis opens a field to type a page into. */
  jump?: boolean;
  size?: "sm" | "md" | "lg";
  /** Seconds the pill and the numbers take to move. */
  duration?: number;
  /** Names the navigation for screen readers. */
  label?: string;
  className?: string;
};

type Slot = number | "start-gap" | "end-gap";

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

// Always the same length (once there are more pages than slots), with the
// ellipsis on one side only: a run of pages round the current one, then the
// gap, then the last pages; near the end it flips to the first pages, the gap,
// then the run. The run slides instead of growing and shrinking.
function slotsFor(page: number, total: number, siblings: number, boundaries: number): Slot[] {
  // The run is the current page and its siblings; one slot for the gap, then the end pages.
  const run = siblings * 2 + 1;
  if (run + 1 + boundaries >= total) return range(1, total);
  // Leading run: starts just before the current page, while there's still a page to hide before the end ones.
  const start = Math.max(1, page - siblings);
  if (start + run - 1 < total - boundaries) return [...range(start, start + run - 1), "end-gap", ...range(total - boundaries + 1, total)];
  // Near the end it flips: the first pages, the gap, then a run out to the last page.
  return [...range(1, boundaries), "start-gap", ...range(total - run + 1, total)];
}

const SIZES = {
  sm: { h: 32, text: "text-[13px]", radius: 8, icon: 16 },
  md: { h: 36, text: "text-sm", radius: 10, icon: 17 },
  lg: { h: 40, text: "text-[15px]", radius: 11, icon: 18 },
} as const;

type Box = { x: number; w: number };
function measureSlots(row: HTMLElement | null, set: (fn: (prev: Box[]) => Box[]) => void) {
  if (!row) return;
  const next = Array.from(row.querySelectorAll<HTMLElement>(":scope > [data-slot]"), (b) => ({ x: b.offsetLeft, w: b.offsetWidth }));
  set((prev) => (prev.length === next.length && prev.every((p, i) => p.x === next[i].x && p.w === next[i].w) ? prev : next));
}

/** A number whose changed digits roll to their new value. */
function Rolling({ value, dir, duration }: { value: number; dir: number; duration: number }) {
  const digits = String(value).split("");
  return (
    <span className="relative inline-flex overflow-hidden tabular-nums" style={{ height: "1.25em", lineHeight: "1.25em" }}>
      {digits.map((d, i) => (
        // Keyed by place from the right, so 19 → 20 rolls both digits and 11 → 12 only the last.
        <span key={digits.length - i} className="relative inline-block">
          <AnimatePresence mode="popLayout" initial={false} custom={dir}>
            <motion.span
              key={d}
              className="inline-block"
              custom={dir}
              variants={{
                in: (dr: number) => ({ y: dr >= 0 ? "100%" : "-100%", opacity: 0 }),
                at: { y: "0%", opacity: 1 },
                out: (dr: number) => ({ y: dr >= 0 ? "-100%" : "100%", opacity: 0 }),
              }}
              initial="in"
              animate="at"
              exit="out"
              transition={{ type: "spring", duration, bounce: 0 }}
            >
              {d}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

export function Pagination({
  total,
  page,
  defaultPage = 1,
  onPageChange,
  siblings = 1,
  boundaries = 1,
  jump = true,
  size = "md",
  duration = 0.35,
  label = "Pagination",
  className,
}: PaginationProps) {
  const pages = Math.max(1, Math.floor(total));
  const [inner, setInner] = useState(defaultPage);
  const current = Math.min(pages, Math.max(1, page ?? inner));
  const [dir, setDir] = useState(1);
  const [editing, setEditing] = useState<Slot | null>(null);
  const [draft, setDraft] = useState("");
  const s = SIZES[size];
  const spring = { type: "spring", duration, bounce: 0 } as const;

  const slots = slotsFor(current, pages, Math.max(0, siblings), Math.max(1, boundaries));
  const activeSlot = slots.indexOf(current);

  const row = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<{ x: number; w: number }[]>([]);
  // Slots can change kind (a page becomes an ellipsis) or width (9 → 10), so
  // they're re-read after every render as well as when the row resizes.
  useLayoutEffect(() => measureSlots(row.current, setBoxes), [current, pages, siblings, boundaries, size, editing]);
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measureSlots(el, setBoxes));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const go = (p: number) => {
    const to = Math.min(pages, Math.max(1, Math.round(p)));
    if (to === current) return;
    setDir(to > current ? 1 : -1);
    if (page === undefined) setInner(to);
    onPageChange?.(to);
  };

  const submitJump = () => {
    const n = parseInt(draft, 10);
    if (!Number.isNaN(n)) go(n);
    setEditing(null);
    setDraft("");
  };

  const onJumpKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submitJump();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditing(null);
      setDraft("");
    }
  };

  const arrow = cn(
    "grid shrink-0 cursor-pointer place-items-center text-muted-foreground outline-none transition-[color,background-color,scale] duration-150 ease-out",
    "hover:bg-black/[0.05] hover:text-foreground active:scale-[0.94] dark:hover:bg-white/[0.07]",
    "focus-visible:ring-2 focus-visible:ring-neutral-400",
    "disabled:pointer-events-none disabled:opacity-35",
  );
  const box = boxes[activeSlot];

  return (
    <MotionConfig reducedMotion="user">
      <nav aria-label={label} className={cn("@container flex w-full justify-center", s.text, className)}>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous page" disabled={current <= 1} onClick={() => go(current - 1)} className={arrow} style={{ width: s.h, height: s.h, borderRadius: s.radius }}>
            <IconChevronLeft size={s.icon} stroke={1.75} />
          </button>

          {/* Narrow containers: a rolling "3 / 20". */}
          <div className="hidden items-center gap-1.5 px-2 font-medium tabular-nums @max-[22rem]:flex" aria-live="polite">
            <span className="sr-only">Page </span>
            <span className="text-foreground">
              <Rolling value={current} dir={dir} duration={duration} />
            </span>
            <span className="text-muted-foreground">/</span>
            <span className="text-muted-foreground">{pages}</span>
          </div>

          <div ref={row} className="relative isolate flex items-center gap-1 @max-[22rem]:hidden">
            {box && (
              <motion.span
                aria-hidden
                className="absolute left-0 top-0 -z-10 bg-neutral-900 dark:bg-white"
                style={{ height: s.h, borderRadius: s.radius }}
                initial={false}
                animate={{ x: box.x, width: box.w }}
                transition={spring}
              />
            )}
            {slots.map((slot, i) => {
              if (typeof slot !== "number") {
                const open = editing === slot;
                return (
                  <motion.div
                    key={`slot-${i}`}
                    data-slot
                    className="relative shrink-0"
                    initial={false}
                    animate={{ width: open ? s.h * 1.75 : s.h }}
                    transition={spring}
                    style={{ height: s.h }}
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      {open ? (
                        <motion.input
                          key="field"
                          autoFocus
                          inputMode="numeric"
                          aria-label={`Go to page, 1 to ${pages}`}
                          placeholder="#"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, String(pages).length))}
                          onKeyDown={onJumpKey}
                          onBlur={submitJump}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="absolute inset-0 w-full border border-black/15 bg-white text-center font-medium tabular-nums text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-black/30 dark:border-white/15 dark:bg-white/[0.06] dark:focus:border-white/30"
                          style={{ borderRadius: s.radius }}
                        />
                      ) : (
                        <motion.button
                          key="gap"
                          type="button"
                          disabled={!jump}
                          aria-label={jump ? "Jump to a page" : undefined}
                          onClick={() => setEditing(slot)}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className={cn(arrow, "absolute inset-0 disabled:opacity-100")}
                          style={{ borderRadius: s.radius }}
                        >
                          <IconDots aria-hidden size={s.icon - 1} stroke={1.75} />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              }
              const on = slot === current;
              return (
                <button
                  key={`slot-${i}`}
                  data-slot
                  type="button"
                  aria-label={`Page ${slot}`}
                  aria-current={on ? "page" : undefined}
                  onClick={() => go(slot)}
                  className={cn(
                    "grid shrink-0 cursor-pointer place-items-center px-1.5 font-medium outline-none transition-[color,background-color] duration-200",
                    "focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                    on ? "text-white dark:text-neutral-900" : "text-muted-foreground hover:bg-black/[0.05] hover:text-foreground dark:hover:bg-white/[0.07]",
                    // The pill isn't measured until the first layout pass; the current slot fills itself until then.
                    on && !box && "bg-neutral-900 dark:bg-white",
                  )}
                  style={{ minWidth: s.h, height: s.h, borderRadius: s.radius }}
                >
                  <Rolling value={slot} dir={dir} duration={duration} />
                </button>
              );
            })}
          </div>

          <button type="button" aria-label="Next page" disabled={current >= pages} onClick={() => go(current + 1)} className={arrow} style={{ width: s.h, height: s.h, borderRadius: s.radius }}>
            <IconChevronRight size={s.icon} stroke={1.75} />
          </button>
        </div>
      </nav>
    </MotionConfig>
  );
}
