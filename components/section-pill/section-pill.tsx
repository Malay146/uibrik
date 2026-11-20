"use client";

import { IconChevronUp } from "@tabler/icons-react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

export type PillSection = { id: string; title: string };

export type SectionPillProps = {
  /** Sections in page order. Each id is the id of an element on the page. */
  sections: PillSection[];
  /** Scrolling element to follow. Defaults to the window. */
  container?: RefObject<HTMLElement | null>;
  /** Distance from the top of the scroller where a section counts as current. */
  offset?: number;
  /** Which edge the pill sits on. The list opens away from it. */
  side?: "bottom" | "top";
  /** Width of the open list in px. Narrow screens get less. */
  panelWidth?: number;
  /** Rows shown before the list scrolls. */
  maxRows?: number;
  /** Accessible name for the pill and the list. */
  label?: string;
  className?: string;
};

const PILL = 44;
const ROW = 36;
const PAD = 6;
// Where the label starts inside the pill (padding, ring, gap) and inside a row.
const PILL_TEXT = 12 + 20 + 10;
// Everything in the pill besides its label: padding, ring, gaps, chevron.
const PILL_CHROME = PILL_TEXT + 10 + 16 + 14;
const ROW_TEXT = PAD + 12;
const SPRING = { type: "spring", duration: 0.45, bounce: 0.1 } as const;
// Title roll: one line height of travel on a smooth ease-out.
const LINE = 20;
const ROLL = { duration: 0.28, ease: [0.25, 1, 0.5, 1] } as const;
// Shortest gap between two title rolls, in ms: one full roll, so a new title
// never starts while the last is mid-way and the pair stay one line apart.
const ROLL_STEP = 290;
const now = () => performance.now();

export function SectionPill({
  sections,
  container,
  offset = 96,
  side = "bottom",
  panelWidth = 280,
  maxRows = 7,
  label = "Sections",
  className,
}: SectionPillProps) {
  const reduce = useReducedMotion();
  const [current, setCurrent] = useState(0);
  const [dir, setDir] = useState(1);
  // The title on screen trails the current section by at most one roll step.
  // A fast scroll passes several sections a second; rolling each one would
  // stack half-finished titles, so in-between ones are skipped and the pill
  // steps to the latest at a steady pace.
  const [shown, setShown] = useState(0);
  const lastRoll = useRef(0);
  useEffect(() => {
    if (shown === current) return;
    const wait = Math.max(0, lastRoll.current + ROLL_STEP - now());
    const id = window.setTimeout(() => {
      lastRoll.current = now();
      setDir(current > shown ? 1 : -1);
      setShown(current);
    }, wait);
    return () => window.clearTimeout(id);
  }, [current, shown]);
  const [open, setOpen] = useState(false);
  // Closed and at rest: the pill shows its own label and the list is hidden.
  // Between "docked" and fully open the list is what you see, carrying the
  // current row from the pill's label to its place in the list.
  const [docked, setDocked] = useState(true);
  // Fully open; long titles only get their ellipsis once the box stops growing.
  const [settled, setSettled] = useState(false);
  // A jump scrolls past other sections; the label holds the destination
  // instead of rolling through each of them.
  const locked = useRef<number | null>(null);
  const progress = useMotionValue(0);

  const wrap = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  // The pill is its label plus fixed chrome. The label is measured off-screen,
  // so the box can spring to the new width while everything inside rides its
  // edges instead of snapping to the new size.
  const [labelRef, labelBounds] = useMeasure();
  const [wrapRef, wrapBounds] = useMeasure();
  // The open list is as wide as its longest title needs, up to panelWidth.
  const [titles, titleBounds] = useMeasure();
  const [scrollTop, setScrollTop] = useState(0);

  // ── Scroll tracking ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = container?.current ?? null;
    const target: HTMLElement | Window = el ?? window;
    let raf = 0;
    const read = () => {
      raf = 0;
      const top = el ? el.getBoundingClientRect().top : 0;
      const scrolled = el ? el.scrollTop : window.scrollY;
      const max = el ? el.scrollHeight - el.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, scrolled / max)) : 0;
      progress.set(p);
      let index = 0;
      sections.forEach((s, i) => {
        const node = document.getElementById(s.id);
        if (node && node.getBoundingClientRect().top - top <= offset) index = i;
      });
      // The last section may be too short to reach the line; the end of the
      // page counts as reaching it.
      if (p > 0.995) index = sections.length - 1;
      if (locked.current !== null) {
        if (index !== locked.current) return;
        locked.current = null;
      }
      setCurrent((prev) => {
        if (prev !== index) setDir(index > prev ? 1 : -1);
        return index;
      });
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    read();
    target.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      target.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [container, sections, offset, progress]);

  const jump = (index: number) => {
    const node = document.getElementById(sections[index].id);
    const el = container?.current ?? null;
    if (!node) return;
    const top = el ? el.getBoundingClientRect().top : 0;
    const by = node.getBoundingClientRect().top - top - offset + 1;
    locked.current = index;
    setDir(index > current ? 1 : -1);
    setCurrent(index);
    // A jump lands straight on its title, so the docking row and the pill agree.
    lastRoll.current = now();
    setShown(index);
    const behavior = reduce ? "instant" : "smooth";
    if (el) el.scrollBy({ top: by, behavior });
    else window.scrollBy({ top: by, behavior });
    // If the page can't scroll that far, release the hold anyway.
    window.setTimeout(() => (locked.current = null), 1200);
  };

  // ── Geometry ───────────────────────────────────────────────────────────────
  const n = sections.length;
  const rows = Math.min(n, maxRows);
  const room = (wrapBounds.width || panelWidth + 16) - 16;
  const pillWidth = labelBounds.width ? Math.ceil(labelBounds.width) + PILL_CHROME : 160;
  const fit = titleBounds.width ? titleBounds.width + ROW_TEXT * 2 + 8 : panelWidth;
  const width = Math.round(Math.min(room, panelWidth, Math.max(fit, pillWidth, 200)));
  const height = rows * ROW + PAD * 2;

  // Opening scrolls the list so the current row sits mid-way when it can.
  // While docked the list already sits there, so opening starts from it.
  const openScroll = Math.max(0, Math.min((current - (rows - 1) / 2) * ROW, (n - rows) * ROW));
  useLayoutEffect(() => {
    if (docked && list.current) {
      list.current.scrollTop = openScroll;
      setScrollTop(openScroll);
    }
  }, [docked, openScroll]);

  // Where the list sits so the current row lies exactly on the pill's label:
  // shifted along by the ring's width, and across so the row's centre meets
  // the pill's. Opening slides it from there to rest while the box grows
  // around it; closing slides it back.
  const rowCentre = PAD + current * ROW - (docked ? openScroll : scrollTop) + ROW / 2;
  const dockX = PILL_TEXT - ROW_TEXT;
  const dockY = side === "bottom" ? height - rowCentre - PILL / 2 : PILL / 2 - rowCentre;
  const labelY = side === "bottom" ? -(PILL / 2 - 10) : PILL / 2 - 10;

  const show = () => {
    setDocked(false);
    setOpen(true);
  };
  const close = (refocus = true) => {
    setSettled(false);
    setOpen(false);
    if (refocus) requestAnimationFrame(() => button.current?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (!open) return;
    // Focus lands on the current row, already scrolled into view above.
    list.current?.querySelector<HTMLElement>("[tabindex='0']")?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => items[(i + items.length) % items.length]?.focus();
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Escape") close();
    else if (e.key === "Tab") return close(false);
    else return;
    e.preventDefault();
  };

  const t = reduce ? { duration: 0 } : SPRING;
  const fade = (on: boolean, delay = 0) => ({ opacity: on ? 1 : 0, transition: { duration: reduce ? 0 : 0.14, delay: reduce ? 0 : delay } });
  const anchor = side === "bottom" ? "bottom-0" : "top-0";

  return (
    <div
      ref={(el) => {
        wrap.current = el;
        wrapRef(el);
      }}
      className={cn("pointer-events-none relative h-11 w-full", className)}
    >
      <motion.div
        initial={false}
        animate={{
          width: open ? width : pillWidth,
          height: open ? height : PILL,
          borderRadius: open ? 20 : PILL / 2,
        }}
        // At rest the box only changes width for a new title: no bounce, timed to
        // land with the incoming text.
        transition={reduce ? { duration: 0 } : docked ? { type: "spring", duration: 0.42, bounce: 0 } : SPRING}
        onAnimationComplete={() => (open ? setSettled(true) : setDocked(true))}
        className={cn(
          "pointer-events-auto absolute left-1/2 -translate-x-1/2 overflow-hidden bg-[#141416] text-white shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)] dark:bg-[#26262a] dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]",
          anchor,
        )}
      >
        {/* Closed: the pill. A hidden copy of the label sets its width. */}
        <motion.button
          ref={button}
          type="button"
          aria-label={`${label}: ${sections[current]?.title ?? ""}. Show all`}
          aria-expanded={open}
          tabIndex={open ? -1 : 0}
          onClick={show}
          initial={false}
          animate={fade(!open, open ? 0 : 0.16)}
          // Fills the box, so the ring rides its left edge and the chevron its
          // right edge as the width springs between titles.
          className={cn(
            "absolute inset-x-0 flex h-11 cursor-pointer items-center justify-between rounded-full pl-3 pr-3.5 outline-none focus-visible:ring-2 focus-visible:ring-white/40",
            anchor,
            open && "pointer-events-none",
          )}
        >
          <Ring progress={progress} />
          <IconChevronUp size={16} stroke={2} className={cn("shrink-0 text-white/50", side === "top" && "rotate-180")} />
        </motion.button>

        <span ref={labelRef} aria-hidden className="invisible absolute left-0 top-0 w-max whitespace-nowrap text-sm font-medium">
          {sections[shown]?.title}
        </span>
        <span ref={titles} aria-hidden className="invisible absolute left-0 top-0 flex w-max flex-col text-sm font-medium">
          {sections.map((s) => (
            <span key={s.id} className="whitespace-nowrap">
              {s.title}
            </span>
          ))}
        </span>

        {/* Open: the list, uncovered as the box grows around it. */}
        <motion.div
          ref={list}
          role="menu"
          aria-label={label}
          aria-hidden={!open}
          onKeyDown={onListKey}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          initial={false}
          // Rows are as wide as the box at every frame of its growth, so their
          // fills meet its edges; the list is fixed in height and anchored to the
          // pill's edge, so rows are uncovered from there as the box grows.
          animate={{
            x: open ? 0 : dockX,
            y: open ? 0 : dockY,
            // The swap with the pill's own label is instant: same text, same place.
            opacity: docked ? 0 : 1,
            transition: { ...t, opacity: { duration: 0 } },
          }}
          style={{ height, padding: PAD }}
          className={cn("absolute inset-x-0 overflow-y-auto overscroll-contain [scrollbar-width:none]", anchor, !open && "pointer-events-none")}
        >
          {sections.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="menuitem"
              tabIndex={open && i === current ? 0 : -1}
              onClick={() => {
                jump(i);
                close();
              }}
              style={{ height: ROW }}
              className={cn(
                // Closing, every row but the current one fades, so only it docks into the pill.
                "relative flex w-full cursor-pointer items-center rounded-[14px] px-3 text-left text-sm font-medium outline-none transition-[color,background-color,opacity] duration-150 focus-visible:bg-white/10",
                !open && i !== current && "opacity-0",
                i === current ? "text-white" : i < current ? "text-white/80 hover:bg-white/5" : "text-white/50 hover:bg-white/5 hover:text-white/80",
              )}
            >
              {i === current && (
                <motion.span
                  aria-hidden
                  initial={false}
                  animate={{ opacity: open ? 1 : 0 }}
                  transition={{ duration: reduce ? 0 : open ? 0.2 : 0.12 }}
                  className="absolute inset-0 rounded-[14px] bg-white/10"
                />
              )}
              <span className={cn("relative min-w-0 overflow-hidden whitespace-nowrap", settled && "text-ellipsis")}>
                {s.title}
              </span>
            </button>
          ))}
        </motion.div>

        {/* The pill's label, rolling as sections change. The list's row takes
            its place the moment the pill opens. */}
        <motion.span
          aria-hidden
          initial={false}
          animate={{ y: labelY, opacity: docked ? 1 : 0 }}
          transition={{ ...t, opacity: { duration: 0 } }}
          // Clipped top and bottom only, so a longer outgoing title rolls out
          // whole instead of being cut to the incoming one's width.
          style={{ left: PILL_TEXT, clipPath: "inset(0 -100vw)" }}
          className={cn("pointer-events-none absolute block h-5 whitespace-nowrap text-sm font-medium leading-5", anchor)}
        >
          <AnimatePresence initial={false} mode="popLayout" custom={dir}>
            <motion.span
              key={shown}
              custom={dir}
              variants={{
                // A drum roll: both titles travel one full line in lockstep on
                // the same curve, so the incoming one always sits right behind
                // the outgoing one and they never share a pixel. The 20px line
                // clips them; the fade only softens the edges.
                enter: (d: number) => ({ y: reduce ? 0 : d * LINE, opacity: 0 }),
                show: { y: 0, opacity: 1, transition: reduce ? { duration: 0 } : ROLL },
                leave: (d: number) => ({ y: reduce ? 0 : d * -LINE, opacity: 0, transition: reduce ? { duration: 0 } : ROLL }),
              }}
              initial="enter"
              animate="show"
              exit="leave"
              className="block"
            >
              {sections[shown]?.title}
            </motion.span>
          </AnimatePresence>
        </motion.span>
      </motion.div>
    </div>
  );
}

function Ring({ progress }: { progress: MotionValue<number> }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  const dash = useTransform(progress, (p) => c * (1 - p));
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" aria-hidden className="-rotate-90 shrink-0">
      <circle cx={10} cy={10} r={r} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={2} />
      <motion.circle
        cx={10}
        cy={10}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={c}
        style={{ strokeDashoffset: dash }}
      />
    </svg>
  );
}
