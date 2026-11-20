"use client";

// A small label for icon buttons and toolbars. The first tooltip waits a
// moment before it shows; once one is open, moving to a neighbour inside the
// same <TooltipGroup> swaps instantly with no animation, so scanning a
// toolbar feels immediate. It flips to the other side when there's no room
// and stays inside the viewport.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const MARGIN = 8;

type Side = "top" | "bottom" | "left" | "right";

// ─── Group ────────────────────────────────────────────────────────────────────

type Warmth = {
  /** True while a tooltip in the group is open, or closed less than `skipDelay` ago. */
  warm: () => boolean;
  opened: () => void;
  /** `vanish` hides this one's fade-out at once if a neighbour opens meanwhile. */
  closed: (vanish: () => void) => void;
};

function createWarmth(skipDelay: number): Warmth {
  let open = 0;
  let lastClosed = -Infinity;
  let fading: (() => void) | null = null;
  return {
    warm: () => open > 0 || performance.now() - lastClosed < skipDelay,
    opened: () => {
      open++;
      // Never two at once: the one still fading out goes now.
      fading?.();
      fading = null;
    },
    closed: (vanish) => {
      open = Math.max(0, open - 1);
      lastClosed = performance.now();
      fading = vanish;
    },
  };
}

const GroupContext = createContext<(Warmth & { delay: number }) | null>(null);

export type TooltipGroupProps = {
  children: ReactNode;
  /** Milliseconds of hover before the first tooltip shows. */
  delay?: number;
  /** After one closes, others open instantly for this many milliseconds. */
  skipDelay?: number;
};

/** Tooltips inside share a warm-up: after the first, neighbours open instantly. */
export function TooltipGroup({ children, delay = 250, skipDelay = 300 }: TooltipGroupProps) {
  const warmth = useMemo(() => createWarmth(skipDelay), [skipDelay]);
  const value = useMemo(() => ({ ...warmth, delay }), [warmth, delay]);
  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

export type TooltipProps = {
  /** The trigger, usually a button. */
  children: ReactNode;
  content: ReactNode;
  /** A keyboard shortcut shown after the content, e.g. "⌘B". */
  shortcut?: string;
  /** Preferred side. Flips when there isn't room. */
  side?: Side;
  /** Gap between trigger and tooltip in px. */
  offset?: number;
  /** Hover delay in ms when not inside a TooltipGroup. */
  delay?: number;
  className?: string;
};

export function Tooltip({ children, content, shortcut, side = "top", offset = 8, delay = 250, className }: TooltipProps) {
  const reduce = useReducedMotion();
  const id = useId();
  const contextGroup = useContext(GroupContext);
  // A lone tooltip is a group of one.
  const [ownWarmth] = useState(() => createWarmth(0));
  const group = contextGroup ?? ownWarmth;
  const wait = contextGroup?.delay ?? delay;

  const trigger = useRef<HTMLSpanElement>(null);
  const floating = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [open, setOpen] = useState(false);
  // Opened straight from a neighbour: appear without animating.
  const [instant, setInstant] = useState(false);
  const [placed, setPlaced] = useState<Side>(side);

  const show = (immediate = false) => {
    clearTimeout(timer.current);
    if (open) return;
    const warm = group.warm();
    const go = () => {
      setInstant(warm);
      setOpen(true);
      group.opened();
    };
    if (immediate || warm) go();
    else timer.current = setTimeout(go, wait);
  };

  const hide = () => {
    clearTimeout(timer.current);
    if (!open) return;
    setOpen(false);
    group.closed(() => {
      if (floating.current) floating.current.style.visibility = "hidden";
    });
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  // Place before paint, and again on scroll or resize while open.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = trigger.current?.firstElementChild?.getBoundingClientRect();
      const f = floating.current;
      if (!t || !f) return;
      f.style.visibility = "";
      const w = f.offsetWidth;
      const h = f.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const fits: Record<Side, boolean> = {
        top: t.top - offset - h >= MARGIN,
        bottom: t.bottom + offset + h <= vh - MARGIN,
        left: t.left - offset - w >= MARGIN,
        right: t.right + offset + w <= vw - MARGIN,
      };
      const opposite: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
      const s = fits[side] || !fits[opposite[side]] ? side : opposite[side];
      let x = s === "left" ? t.left - offset - w : s === "right" ? t.right + offset : t.left + t.width / 2 - w / 2;
      let y = s === "top" ? t.top - offset - h : s === "bottom" ? t.bottom + offset : t.top + t.height / 2 - h / 2;
      x = Math.min(Math.max(x, MARGIN), vw - w - MARGIN);
      y = Math.min(Math.max(y, MARGIN), vh - h - MARGIN);
      f.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      setPlaced(s);
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, side, offset, content, shortcut]);

  // Point the trigger itself (not the wrapper) at the tooltip while it shows.
  useEffect(() => {
    const el = trigger.current?.firstElementChild;
    if (!open || !el) return;
    el.setAttribute("aria-describedby", id);
    return () => el.removeAttribute("aria-describedby");
  }, [open, id]);

  const from: Record<Side, { x?: number; y?: number }> = { top: { y: 4 }, bottom: { y: -4 }, left: { x: 4 }, right: { x: -4 } };
  const origin: Record<Side, string> = { top: "bottom", bottom: "top", left: "right", right: "left" };

  return (
    <>
      {/* `display: contents` adds no box, so the trigger lays out as if unwrapped. */}
      <span
        ref={trigger}
        className="contents"
        onPointerEnter={(e) => e.pointerType === "mouse" && show()}
        onPointerLeave={hide}
        onPointerDown={hide}
        onFocus={(e) => e.target.matches(":focus-visible") && show(true)}
        onBlur={hide}
        onKeyDown={(e) => e.key === "Escape" && hide()}
      >
        {children}
      </span>
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div ref={floating} className="pointer-events-none fixed left-0 top-0 z-[200]">
                <motion.div
                  id={id}
                  role="tooltip"
                  initial={instant || reduce ? { opacity: instant ? 1 : 0 } : { opacity: 0, scale: 0.96, ...from[placed] }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: instant ? 0 : 0.1 } }}
                  transition={{ duration: 0.15, ease: EASE_OUT }}
                  style={{ transformOrigin: origin[placed] }}
                  className={cn(
                    "flex items-center gap-2 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-medium text-background shadow-[0_4px_12px_rgb(0_0_0/0.12)]",
                    className,
                  )}
                >
                  {content}
                  {shortcut && <kbd className="font-sans text-background/55">{shortcut}</kbd>}
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
