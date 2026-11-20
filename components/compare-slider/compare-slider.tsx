"use client";

// Two layers stacked in one frame; the top one is cut at the handle, so
// dragging it wipes between them. Press anywhere to glide there, drag to
// scrub, or focus the handle and use the arrow keys. On first view it sweeps
// in from one side to show what it does. Each label fades as the handle covers
// its side, so it never sits on top of the wrong layer.
//
// Everything moves with transforms only (no clip-path, no left/top), and the
// position never goes through React state, so dragging stays on the compositor.

import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
// Stiff and slightly over-damped: follows the pointer within a frame or two,
// smoothing out uneven pointer events without ever overshooting.
const FOLLOW = { stiffness: 700, damping: 45, mass: 0.5 };

export type CompareSliderProps = {
  /** Shown on the start side (left, or top when vertical). */
  before: ReactNode;
  /** Shown on the end side. */
  after: ReactNode;
  beforeLabel?: string;
  afterLabel?: string;
  /** Starting handle position, 0–100. */
  defaultPosition?: number;
  /** Wipe left–right, or top–bottom. */
  orientation?: "horizontal" | "vertical";
  /** Move the handle with the pointer, without pressing. */
  hover?: boolean;
  /** Sweep the handle in from the far edge the first time it scrolls into view. */
  intro?: boolean;
  /** Corner radius in px. */
  radius?: number;
  onChange?: (position: number) => void;
  className?: string;
};

const clamp = (v: number) => Math.min(100, Math.max(0, v));

export function CompareSlider({
  before,
  after,
  beforeLabel = "Before",
  afterLabel = "After",
  defaultPosition = 50,
  orientation = "horizontal",
  hover = false,
  intro = true,
  radius = 20,
  onChange,
  className,
}: CompareSliderProps) {
  const reduce = useReducedMotion();
  const vertical = orientation === "vertical";
  const frame = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [active, setActive] = useState(false);
  const start = clamp(defaultPosition);
  const playIntro = intro && !reduce;

  // `target` is where the handle should be; `pos` springs after it.
  const target = useMotionValue(playIntro ? 100 : start);
  const pos = useSpring(target, FOLLOW);
  const introAnim = useRef<AnimationPlaybackControls>(undefined);

  // Kept off React state so a drag never re-renders the component.
  useMotionValueEvent(pos, "change", (p) => thumb.current?.setAttribute("aria-valuenow", String(Math.round(p))));

  const inView = useInView(frame, { once: true, amount: 0.4 });
  useEffect(() => {
    if (!inView || !playIntro) return;
    introAnim.current = animate(target, start, { duration: 1.1, ease: EASE_OUT, delay: 0.15 });
    return () => introAnim.current?.stop();
    // Plays once, on first view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);

  // The end layer is shifted by the handle position and its content shifted
  // back by the same amount, so it stays put while its edge moves.
  const shift = useTransform(pos, (p) => `${p}%`);
  const unshift = useTransform(pos, (p) => `${-p}%`);
  // A label fades as the handle closes in on its corner.
  const beforeOpacity = useTransform(pos, [6, 22], [0, 1]);
  const afterOpacity = useTransform(pos, [78, 94], [1, 0]);

  const set = (p: number) => {
    introAnim.current?.stop();
    const next = clamp(p);
    target.set(next);
    if (reduce) pos.jump(next);
    onChange?.(Math.round(next));
  };

  const fromPointer = (e: PointerEvent) => {
    const r = frame.current!.getBoundingClientRect();
    return vertical ? ((e.clientY - r.top) / r.height) * 100 : ((e.clientX - r.left) / r.width) * 100;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragging.current = true;
    setActive(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    set(fromPointer(e));
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current || (hover && e.pointerType === "mouse")) set(fromPointer(e));
  };

  const stop = () => {
    dragging.current = false;
    setActive(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 2;
    const back = vertical ? "ArrowUp" : "ArrowLeft";
    const fwd = vertical ? "ArrowDown" : "ArrowRight";
    const keys: Record<string, number> = { [back]: -step, [fwd]: step };
    if (e.key in keys) set(target.get() + keys[e.key]);
    else if (e.key === "Home") set(0);
    else if (e.key === "End") set(100);
    else return;
    e.preventDefault();
  };

  const along = (v: MotionValue<string>) => (vertical ? { y: v } : { x: v });

  return (
    <div
      ref={frame}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      className={cn(
        "relative isolate w-full touch-none select-none overflow-hidden bg-muted",
        vertical ? "cursor-row-resize" : "cursor-col-resize",
        className,
      )}
      style={{ borderRadius: radius }}
    >
      <div className="relative size-full [&>img]:size-full [&>img]:object-cover">{before}</div>
      <motion.div className="absolute inset-0 overflow-hidden will-change-transform" style={along(shift)}>
        <motion.div
          className="absolute inset-0 will-change-transform [&>img]:size-full [&>img]:object-cover"
          style={along(unshift)}
        >
          {after}
        </motion.div>
      </motion.div>

      <Label opacity={beforeOpacity} className="left-3 top-3">
        {beforeLabel}
      </Label>
      <Label opacity={afterOpacity} className={vertical ? "bottom-3 left-3" : "right-3 top-3"}>
        {afterLabel}
      </Label>

      {/* A frame-sized rail moved by the position; the line and grip sit on its start edge. */}
      <motion.div className="pointer-events-none absolute inset-0 will-change-transform" style={along(shift)}>
        <div
          aria-hidden
          className={cn(
            "absolute bg-white/90 shadow-[0_0_0_0.5px_rgb(0_0_0/0.1)]",
            vertical ? "inset-x-0 top-0 h-px -translate-y-1/2" : "inset-y-0 left-0 w-px -translate-x-1/2",
          )}
        />
        <div
          ref={thumb}
          role="slider"
          tabIndex={0}
          aria-label={`${beforeLabel} and ${afterLabel} comparison`}
          aria-orientation={orientation}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(start)}
          onKeyDown={onKeyDown}
          className={cn(
            "pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none",
            "focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900/40",
            vertical ? "left-1/2 top-0" : "left-0 top-1/2",
          )}
        >
          <motion.div
            animate={{ scale: active ? 1.08 : 1 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="grid size-9 place-items-center rounded-full bg-white text-neutral-500 shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_2px_8px_rgb(0_0_0/0.16)]"
          >
            <Grip vertical={vertical} spread={active} />
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}

function Label({ opacity, className, children }: { opacity: MotionValue<number>; className: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <motion.span
      aria-hidden
      style={{ opacity }}
      className={cn(
        "pointer-events-none absolute rounded-full bg-black/50 px-2.5 py-1 text-xs font-medium text-white",
        className,
      )}
    >
      {children}
    </motion.span>
  );
}

// Two small chevrons pointing away from each other: "drag either way".
// They part slightly while held.
function Grip({ vertical, spread }: { vertical: boolean; spread: boolean }) {
  const t = { duration: 0.2, ease: EASE_OUT };
  return (
    <svg
      aria-hidden
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={vertical ? { transform: "rotate(90deg)" } : undefined}
    >
      <motion.path d="M6 4.5 2.5 8 6 11.5" animate={{ x: spread ? -1.25 : 0 }} transition={t} />
      <motion.path d="M10 4.5 13.5 8 10 11.5" animate={{ x: spread ? 1.25 : 0 }} transition={t} />
    </svg>
  );
}
