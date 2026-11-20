"use client";

// Sections that sit together as one block. Opening a section splits it away
// from its neighbours: its margin-block eases out to a gap and the corners on
// either side of the split round off, while the answer fades up below its
// question. Closing it merges the block back together. The list is plain block flow, so
// the margins of two open neighbours collapse into a single gap instead of
// doubling. Headers are real buttons inside headings; Up/Down, Home and End
// move between them.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
// Padding between a section and the header row inside it.
const INSET = 6;

export type SplitAccordionItem = { title: ReactNode; content: ReactNode };

export type SplitAccordionProps = {
  items: readonly SplitAccordionItem[];
  /** One section open at a time, or any number. */
  type?: "single" | "multiple";
  /** Indexes open at first. */
  defaultOpen?: readonly number[];
  /** Open indexes, controlled. Pair with `onOpenChange`. */
  open?: readonly number[];
  onOpenChange?: (open: number[]) => void;
  /** Space an open section pulls away from its neighbours, in px. */
  gap?: number;
  /** Corner radius of the block and of each split piece, in px. */
  radius?: number;
  className?: string;
};

export function SplitAccordion({
  items,
  type = "single",
  defaultOpen = [],
  open: openProp,
  onOpenChange,
  gap = 12,
  radius = 20,
  className,
}: SplitAccordionProps) {
  const reduce = useReducedMotion();
  const uid = useId();
  const [own, setOwn] = useState<number[]>([...defaultOpen]);
  const open = openProp ?? own;
  const headers = useRef<(HTMLButtonElement | null)[]>([]);

  const toggle = (i: number) => {
    const isOpen = open.includes(i);
    const next = type === "single" ? (isOpen ? [] : [i]) : isOpen ? open.filter((n) => n !== i) : [...open, i];
    if (openProp === undefined) setOwn(next);
    onOpenChange?.(next);
  };

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const n = items.length;
    const to = e.key === "ArrowDown" ? (i + 1) % n : e.key === "ArrowUp" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : null;
    if (to === null) return;
    e.preventDefault();
    headers.current[to]?.focus();
  };

  const spring = reduce ? { duration: 0 } : ({ type: "spring", duration: 0.4, bounce: 0 } as const);
  const last = items.length - 1;
  // Concentric corners: the hover row is rounded by the section's radius less
  // the padding between them.
  const inner = Math.max(radius - INSET, 0);

  return (
    // Block flow, not flex: adjacent vertical margins collapse.
    <div className={cn("w-full", className)}>
      {items.map((item, i) => {
        const isOpen = open.includes(i);
        // A section is joined to a neighbour only while neither is open.
        const joinedAbove = i > 0 && !isOpen && !open.includes(i - 1);
        const joinedBelow = i < last && !isOpen && !open.includes(i + 1);
        const top = joinedAbove ? 0 : radius;
        const bottom = joinedBelow ? 0 : radius;
        const head = `${uid}-h${i}`;
        const panel = `${uid}-p${i}`;
        return (
          <motion.div
            key={i}
            initial={false}
            animate={{
              marginTop: isOpen && i > 0 ? gap : 0,
              marginBottom: isOpen && i < last ? gap : 0,
              borderTopLeftRadius: top,
              borderTopRightRadius: top,
              borderBottomLeftRadius: bottom,
              borderBottomRightRadius: bottom,
            }}
            transition={spring}
            style={{ padding: INSET }}
            className="bg-muted dark:bg-muted/60"
          >
            <h3 className="m-0">
              <button
                ref={(el) => {
                  headers.current[i] = el;
                }}
                id={head}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panel}
                onClick={() => toggle(i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                style={{ borderRadius: inner }}
                className={cn(
                  "group flex min-h-12 w-full cursor-pointer items-center justify-between gap-4 py-3 pl-4 pr-2 text-left text-base font-medium tracking-tight text-foreground outline-none",
                  "transition-colors duration-150 hover:bg-black/[0.035] dark:hover:bg-white/[0.04]",
                  "focus-visible:ring-2 focus-visible:ring-neutral-400",
                )}
              >
                {item.title}
                <Icon open={isOpen} />
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={panel}
                  role="region"
                  aria-labelledby={head}
                  initial={{ height: 0 }}
                  animate={{ height: "auto" }}
                  exit={{ height: 0 }}
                  transition={spring}
                  className="overflow-hidden"
                >
                  <motion.div
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(2px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.3, ease: EASE_OUT, delay: reduce ? 0 : 0.05 }}
                    className="pb-3.5 pl-4 pr-12 text-[15px] leading-7 text-muted-foreground"
                  >
                    {item.content}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

function Icon({ open }: { open: boolean }) {
  const t = { type: "spring", duration: 0.35, bounce: 0 } as const;
  return (
    <span
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors duration-200 group-hover:text-foreground",
        open && "bg-background text-foreground",
      )}
    >
      <svg aria-hidden width={17} height={17} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
        <path d="M3 7h8" />
        {/* The upright folds flat into the bar: plus becomes minus. */}
        <motion.path d="M7 3v8" initial={false} animate={{ scaleY: open ? 0 : 1, opacity: open ? 0 : 1 }} transition={t} style={{ transformOrigin: "7px 7px", transformBox: "view-box" }} />
      </svg>
    </span>
  );
}
