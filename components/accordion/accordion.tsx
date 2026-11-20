"use client";

// Sections that open and close in place. The panel eases to its height while
// its content fades up a few pixels behind it, and the icon turns as it goes.
// One open at a time, or several. Headers are real buttons inside headings;
// Up/Down, Home and End move between them.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export type AccordionItem = { title: ReactNode; content: ReactNode };

export type AccordionProps = {
  items: readonly AccordionItem[];
  /** One section open at a time, or any number. */
  type?: "single" | "multiple";
  /** Indexes open at first. */
  defaultOpen?: readonly number[];
  /** Open indexes, controlled. Pair with `onOpenChange`. */
  open?: readonly number[];
  onOpenChange?: (open: number[]) => void;
  /** Hairlines between sections, or each section as its own card. */
  variant?: "divided" | "separated";
  /** Chevron that turns, or plus that becomes minus. */
  icon?: "chevron" | "plus";
  className?: string;
};

export function Accordion({
  items,
  type = "single",
  defaultOpen = [],
  open: openProp,
  onOpenChange,
  variant = "divided",
  icon = "chevron",
  className,
}: AccordionProps) {
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

  const separated = variant === "separated";

  return (
    <div className={cn("w-full", separated ? "flex flex-col gap-2" : "divide-y divide-border", className)}>
      {items.map((item, i) => {
        const isOpen = open.includes(i);
        const head = `${uid}-h${i}`;
        const panel = `${uid}-p${i}`;
        return (
          <div
            key={i}
            className={cn(separated && "rounded-2xl bg-background shadow-[inset_0_0_0_1px_var(--border)] transition-colors duration-200", separated && isOpen && "bg-muted/40")}
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
                className={cn(
                  "group flex w-full cursor-pointer items-center justify-between gap-4 text-left text-[15px] font-medium tracking-tight text-foreground outline-none",
                  "rounded-xl focus-visible:ring-2 focus-visible:ring-neutral-400",
                  separated ? "px-4 py-3.5" : "py-4",
                )}
              >
                {item.title}
                <Icon kind={icon} open={isOpen} />
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
                  transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.4, bounce: 0 }}
                  className="overflow-hidden"
                >
                  <motion.div
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(2px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    transition={{ duration: 0.3, ease: EASE_OUT, delay: reduce ? 0 : 0.05 }}
                    className={cn("text-sm leading-6 text-muted-foreground", separated ? "px-4 pb-4" : "pb-4 pr-8")}
                  >
                    {item.content}
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

function Icon({ kind, open }: { kind: "chevron" | "plus"; open: boolean }) {
  const t = { type: "spring", duration: 0.35, bounce: 0 } as const;
  return (
    <span className="grid size-5 shrink-0 place-items-center text-muted-foreground transition-colors duration-200 group-hover:text-foreground">
      <svg aria-hidden width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {kind === "chevron" ? (
          <motion.path d="M3.5 5.25 7 8.75l3.5-3.5" initial={false} animate={{ rotate: open ? 180 : 0 }} transition={t} style={{ transformOrigin: "7px 7px", transformBox: "view-box" }} />
        ) : (
          <>
            <path d="M3 7h8" />
            {/* The upright folds flat into the bar: plus becomes minus. */}
            <motion.path d="M7 3v8" initial={false} animate={{ scaleY: open ? 0 : 1, opacity: open ? 0 : 1 }} transition={t} style={{ transformOrigin: "7px 7px", transformBox: "view-box" }} />
          </>
        )}
      </svg>
    </span>
  );
}
