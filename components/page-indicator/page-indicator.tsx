"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import NumberFlow from "@number-flow/react";
import useMeasure from "react-use-measure";
import { animate, AnimatePresence, motion, MotionValue, useMotionValue, useTransform } from "motion/react";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

const getSnapshot = () => document.documentElement.classList.contains("dark");

function useIsDark() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

// Page indicator. Click a dash to jump, grab the wide one and scrub, arrow keys
// to step, click the number to type a page.

const SMOOTH = { duration: 0.5, ease: [0.32, 0.72, 0, 1] } as const;
const GLIDE = { duration: 0.45, ease: [0.22, 1, 0.36, 1] } as const; // the row's slide when the window moves
const SLOT = 22; // width of one resting dash

// rubber-band: resistance grows the further past either end the target sits
const makeStretch = (TOTAL: number, STEP: number, MAX_STRETCH: number) => (target: number) => {
  const over =
    target > TOTAL
      ? (target - TOTAL) * STEP
      : target < 1
        ? (target - 1) * STEP
        : 0;
  return Math.sign(over) * MAX_STRETCH * (1 - Math.exp(-Math.abs(over) / 80));
};

type DashProps = {
  ref?: React.Ref<HTMLDivElement>; // AnimatePresence popLayout measures the exiting dash through this
  page: number;
  active: boolean;
  grabbing: boolean;
  stretch: MotionValue<number>;
  fade: number; // opacity of dashes at an edge that has more pages beyond it
  onSelect: () => void;
  onGrab: (e: React.PointerEvent) => void;
};

const Dash = ({
  ref,
  page,
  active,
  grabbing,
  stretch,
  fade,
  onSelect,
  onGrab,
}: DashProps) => {
  // motion animates the colour itself, so it can't use a `dark:` class
  const dark = useIsDark();
  // elastic stretch past the first/last page: grows from the pinned edge
  const scaleX = useTransform(stretch, (v) => 1 + Math.abs(v) / 54);
  const scaleY = useTransform(stretch, (v) => 1 - Math.abs(v) / 300);
  const originX = useTransform(stretch, (v) => (v > 0 ? 0 : 1));

  return (
    <motion.div
      ref={ref}
      // dashes enter at full width and full opacity: a hard scrub always shows a complete row
      initial={{ width: active ? 54 : 22, opacity: fade }}
      animate={{ width: active ? 54 : 22, opacity: fade }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{
        ...SMOOTH,
        width: { duration: 0.35, ease: [0.25, 1, 0.5, 1] },
      }}
      onClick={onSelect}
      onPointerDown={active ? onGrab : undefined}
      aria-hidden
      data-page={page}
      data-active={active}
      className={`group/dash relative z-10 flex h-6 items-center justify-center ${active ? "overflow-visible" : "overflow-hidden"} ${
        active ? "cursor-grab" : "cursor-pointer"
      } ${grabbing && active ? "cursor-grabbing" : ""}`}
    >
      <motion.div
        style={active ? { scaleX, scaleY, originX } : undefined}
        className="mx-[3px] flex min-w-0 flex-1 items-center"
      >
        <motion.div
          animate={{
            backgroundColor: active
              ? dark
                ? "#d4d4d4"
                : "#525252"
              : dark
                ? "#404040"
                : "#d4d4d4",
            scale: grabbing && active ? 1.06 : 1,
          }}
          transition={SMOOTH}
          className="h-2 w-full rounded-full transition-[filter] duration-200 group-hover/dash:brightness-[0.93] dark:group-hover/dash:brightness-125"
        />
      </motion.div>
    </motion.div>
  );
};

export type PageIndicatorProps = {
  /** Number of pages. */
  total?: number;
  /** Dashes shown at once. Odd keeps the active one centred. */
  visible?: number;
  /** Starting page when uncontrolled (1-based). */
  defaultPage?: number;
  /** Called when the page changes. */
  onChange?: (page: number) => void;
  /** Pixels of drag per page while scrubbing. */
  dragStep?: number;
  /** How far the grabbed dash stretches past either end, in px. */
  stretch?: number;
  /** Show the page number pill (click it to type a page). */
  showNumber?: boolean;
  className?: string;
};

/** Pagination dashes you can click, scrub, step with arrows or type into. */
export function PageIndicator({
  total: TOTAL = 48,
  visible = 11,
  defaultPage = 6,
  onChange,
  dragStep: STEP = 14,
  stretch: MAX_STRETCH = 30,
  showNumber = true,
  className,
}: PageIndicatorProps) {
  const WINDOW = Math.max(1, Math.min(visible, TOTAL));
  const half = Math.floor(WINDOW / 2);
  const clamp = (n: number) => Math.min(TOTAL, Math.max(1, n));
  const stretchFor = makeStretch(TOTAL, STEP, MAX_STRETCH);
  const [current, setCurrentState] = useState(() => clamp(defaultPage));
  const setCurrent = (n: number) => {
    setCurrentState(n);
    onChange?.(n);
  };
  const [grabbing, setGrabbing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // a typed page shows in the number at once; only the dashes glide there
  const [typed, setTyped] = useState<number | null>(null);

  const stretch = useMotionValue(0);
  // the pill's background grows with the dash, pinned on the opposite edge
  const bgLeft = useTransform(stretch, (v) => Math.min(v, 0));
  const bgRight = useTransform(stretch, (v) => -Math.max(v, 0));
  const grab = useRef({ x: 0, page: defaultPage });
  const inputRef = useRef<HTMLInputElement>(null);
  const [measureRef, bounds] = useMeasure();
  const closing = useRef(true);
  const travel = useRef<{ stop: () => void } | null>(null);
  const springing = useRef<{ stop: () => void } | null>(null);

  // number pill leans and squashes with the dash when pulled past an end
  const numX = useTransform(stretch, (v) => v * 0.35);
  const numScaleX = useTransform(stretch, (v) => 1 + Math.abs(v) / 250);

  const springBack = useCallback(() => {
    springing.current = animate(stretch, 0, {
      type: "spring",
      stiffness: 260,
      damping: 16,
    });
  }, [stretch]);

  // cancel any gliding / snap-back before a new interaction takes over
  const interrupt = useCallback(() => {
    setTyped(null);
    travel.current?.stop();
    springing.current?.stop();
  }, []);

  useEffect(() => interrupt, [interrupt]);

  const start = Math.min(Math.max(current - half, 1), TOTAL - WINDOW + 1);
  // The window steps a whole dash at a time. Rather than animating every dash (which piles up
  // during a hard scrub), offset the one row by the step and ease that single value back to 0.
  const rowX = useMotionValue(0);
  const prevStart = useRef(start);
  const rowAnim = useRef<{ stop: () => void } | null>(null);
  useLayoutEffect(() => {
    const delta = start - prevStart.current;
    prevStart.current = start;
    if (!delta) return;
    rowAnim.current?.stop();
    rowX.set(
      Math.max(-SLOT, Math.min(SLOT, rowX.get() + delta * SLOT)),
    );
    rowAnim.current = animate(rowX, 0, GLIDE);
  }, [start, rowX]);

  const pages = Array.from({ length: WINDOW }, (_, i) => start + i);
  // edge dashes dim when more pages continue beyond them
  const edgeFade = (i: number) => {
    const fromLeft = start > 1 ? [0.35, 0.7][i] : undefined;
    const fromRight =
      start + WINDOW - 1 < TOTAL ? [0.35, 0.7][WINDOW - 1 - i] : undefined;
    return Math.min(fromLeft ?? 1, fromRight ?? 1);
  };

  // scrub: window listeners, because the grabbed dash changes as pages change
  useEffect(() => {
    if (!grabbing) return;
    const move = (e: PointerEvent) => {
      const target = grab.current.page + (e.clientX - grab.current.x) / STEP;
      setCurrent(clamp(Math.round(target)));
      stretch.set(stretchFor(target));
    };
    const up = () => {
      setGrabbing(false);
      springBack();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grabbing, stretch, springBack]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const finish = (save: boolean) => {
    if (closing.current) return;
    closing.current = true;
    const n = parseInt(draft, 10);
    setEditing(false);
    if (!save || Number.isNaN(n) || clamp(n) === current) return;
    // glide through the pages so the pill visibly travels to its target
    interrupt();
    setTyped(clamp(n));
    travel.current = animate(current, clamp(n), {
      duration: Math.min(1.2, 0.35 + Math.abs(clamp(n) - current) * 0.02),
      ease: [0.32, 0.72, 0, 1],
      onUpdate: (v) => setCurrent(Math.round(v)),
      onComplete: () => setTyped(null),
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const keys: Record<string, number> = {
      ArrowRight: current + 1,
      ArrowUp: current + 1,
      ArrowLeft: current - 1,
      ArrowDown: current - 1,
      Home: 1,
      End: TOTAL,
    };
    if (e.key in keys) {
      e.preventDefault();
      interrupt();
      const next = clamp(keys[e.key]);
      // already at the end: a small elastic nudge instead of nothing
      if (next === current && keys[e.key] !== current) {
        stretch.set(Math.sign(keys[e.key] - current) * 10);
        springBack();
      }
      setCurrent(next);
    }
  };

  return (
    <>
      {/* while grabbing, cover the page so no element under the pointer can change the cursor */}
      {grabbing && <div className="fixed inset-0 z-50 cursor-grabbing" />}
      <div className={`flex flex-col items-center gap-3 ${className ?? ""}`}>
        {showNumber && (
        <motion.div
          animate={{ width: bounds.width ? bounds.width + 32 : "auto" }}
          initial={false}
          style={{ x: numX, scaleX: numScaleX }}
          transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
          onClick={() => {
            if (editing) return;
            setDraft("");
            closing.current = false;
            setEditing(true);
          }}
          className={`flex items-center justify-center squircle-mask squircle-2xl bg-neutral-100 text-2xl text-zinc-700 font-medium dark:bg-neutral-900 dark:text-zinc-200 ${
            editing ? "" : "cursor-text"
          }`}
        >
          <div
            ref={measureRef}
            className="shrink-0 px-0 py-1 whitespace-nowrap"
          >
            {editing ? (
              <input
                ref={inputRef}
                value={draft}
                inputMode="numeric"
                aria-label="Go to page"
                placeholder={String(current)}
                style={{
                  width: `${Math.max(draft.length, String(current).length) + 0.5}ch`,
                }}
                onChange={(e) =>
                  setDraft(e.target.value.replace(/\D/g, "").slice(0, 3))
                }
                onBlur={() => finish(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") finish(true);
                  if (e.key === "Escape") finish(false);
                }}
                className="bg-transparent text-center text-2xl font-medium text-zinc-700 outline-none placeholder:text-neutral-400 dark:text-zinc-200 dark:placeholder:text-neutral-500"
              />
            ) : (
              <NumberFlow value={typed ?? current} />
            )}
          </div>
        </motion.div>
        )}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Page"
          aria-valuemin={1}
          aria-valuemax={TOTAL}
          aria-valuenow={current}
          onKeyDown={onKeyDown}
          className="group relative flex min-w-[300px] touch-none select-none items-center justify-center px-[13px] py-2 outline-none"
        >
          <motion.div
            aria-hidden
            style={{ left: bgLeft, right: bgRight }}
            className="absolute inset-y-0 squircle-mask squircle-2xl bg-neutral-100 group-focus-visible:rounded-2xl group-focus-visible:[mask-image:none] group-focus-visible:ring-2 group-focus-visible:ring-neutral-400 dark:bg-neutral-900 dark:group-focus-visible:ring-neutral-600"
          />
          <motion.div
            style={{ x: rowX }}
            className="relative flex items-center"
          >
            <AnimatePresence initial={false} mode="popLayout">
              {pages.map((p, i) => (
                <Dash
                  key={p}
                  page={p}
                  active={p === current}
                  grabbing={grabbing}
                  stretch={stretch}
                  fade={edgeFade(i)}
                  onSelect={() => {
                    interrupt();
                    setCurrent(p);
                  }}
                  onGrab={(e) => {
                    e.preventDefault();
                    interrupt();
                    grab.current = { x: e.clientX, page: current };
                    setGrabbing(true);
                  }}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>
    </>
  );
}
