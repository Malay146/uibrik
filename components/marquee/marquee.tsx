"use client";

// An endless row (or column) of anything: logos, quotes, tags. The content is
// repeated just enough times to cover the frame, then the whole track slides
// one copy's length and wraps, so the loop never shows a seam. Hovering can
// ease it slower or to a stop (never a dead halt), it can be dragged and
// flicked, and it rests while off screen or while focus is inside it.

import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

export type MarqueeProps = {
  children: ReactNode;
  /** Which way the content travels. Up and down need a frame with a height. */
  direction?: "left" | "right" | "up" | "down";
  /** Pixels per second. */
  speed?: number;
  /** What hovering does: ease to `hoverSpeed`, ease to a stop, or nothing. */
  onHover?: "slow" | "pause" | "none";
  /** Speed while hovered when `onHover` is "slow", as a share of `speed`. */
  hoverSpeed?: number;
  /** Let people drag the track and flick it; it drifts back to its own speed. */
  draggable?: boolean;
  /** Space between items, and between copies, in px. */
  gap?: number;
  /** Which edges fade into the page: both, only the start (left/top), only the end, or none. */
  fadeEdges?: "both" | "start" | "end" | "none";
  /** Width of each faded edge in px. */
  fade?: number;
  className?: string;
};

export function Marquee({
  children,
  direction = "left",
  speed = 40,
  onHover = "slow",
  hoverSpeed = 0.25,
  draggable = false,
  gap = 40,
  fadeEdges = "both",
  fade = 64,
  className,
}: MarqueeProps) {
  const reduce = useReducedMotion();
  const vertical = direction === "up" || direction === "down";
  const sign = direction === "left" || direction === "up" ? -1 : 1;

  const frameEl = useRef<HTMLDivElement>(null);
  const [frameRef, frame] = useMeasure();
  const [copyRef, copy] = useMeasure();
  const length = (vertical ? copy.height : copy.width) + gap;
  const frameLength = vertical ? frame.height : frame.width;
  // One copy to show, plus enough to fill the frame while it slides away.
  const copies = length > gap ? Math.max(2, Math.ceil(frameLength / length) + 1) : 2;

  const offset = useMotionValue(0);
  const factor = useRef(1);
  const hovered = useRef(false);
  const focused = useRef(false);
  const onScreen = useRef(true);
  // Dragging: where the pointer was, how far it has moved, and the flick
  // speed (px/s) that decays once it's let go.
  const drag = useRef<{ last: number; moved: number; time: number } | null>(null);
  const fling = useRef(0);
  // Set for the click that follows a real drag, so it can be swallowed.
  const dragged = useRef(false);

  // No point animating what nobody can see.
  useEffect(() => {
    const el = frameEl.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      onScreen.current = e.isIntersecting;
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const wrap = (v: number) => ((v % length) - length) % length;

  useAnimationFrame((_, delta) => {
    if (reduce || length <= gap || !onScreen.current || drag.current) return;
    // Ease toward the target speed over ~200ms rather than snapping to it.
    const target =
      focused.current || (hovered.current && onHover === "pause")
        ? 0
        : hovered.current && onHover === "slow"
          ? hoverSpeed
          : 1;
    factor.current += (target - factor.current) * Math.min(1, delta / 120);
    fling.current *= Math.exp(-delta / 350);
    const step = sign * speed * factor.current + fling.current;
    // Wrap inside (-length, 0], so the track always starts with a full copy in view.
    offset.set(wrap(offset.get() + (step * delta) / 1000));
  });

  const transform = useTransform(offset, (v) => (vertical ? `translateY(${v}px)` : `translateX(${v}px)`));

  const axis = (e: PointerEvent) => (vertical ? e.clientY : e.clientX);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!draggable || reduce || e.button !== 0) return;
    drag.current = { last: axis(e), moved: 0, time: performance.now() };
    dragged.current = false;
    fling.current = 0;
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    const dx = axis(e) - d.last;
    // Capture only once it's clearly a drag, so plain clicks on links still land.
    if (d.moved < 4 && Math.abs(d.moved + dx) >= 4) e.currentTarget.setPointerCapture(e.pointerId);
    d.moved += Math.abs(dx);
    // Smoothed velocity, used as the flick when released.
    const v = (dx / Math.max(1, now - d.time)) * 1000;
    fling.current = fling.current * 0.6 + v * 0.4;
    d.last = axis(e);
    d.time = now;
    offset.set(wrap(offset.get() + dx));
  };

  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    // A stale velocity (pointer held still before release) shouldn't fling.
    if (performance.now() - d.time > 80) fling.current = 0;
    // Remove the track's own speed from the flick; the loop adds it back.
    fling.current -= sign * speed * factor.current;
    drag.current = null;
    dragged.current = d.moved >= 4;
  };

  const start = fadeEdges === "both" || fadeEdges === "start" ? `transparent, #000 ${fade}px` : "#000";
  const end = fadeEdges === "both" || fadeEdges === "end" ? `#000 calc(100% - ${fade}px), transparent` : "#000";
  const mask =
    fadeEdges !== "none" && fade > 0
      ? `linear-gradient(${vertical ? "180deg" : "90deg"}, ${start}, ${end})`
      : undefined;

  return (
    <div
      ref={(el) => {
        frameEl.current = el;
        frameRef(el);
      }}
      onPointerEnter={(e) => {
        hovered.current = e.pointerType === "mouse";
      }}
      onPointerLeave={() => {
        hovered.current = false;
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      // A drag that ends over a link shouldn't also follow it.
      onClickCapture={(e) => {
        if (!dragged.current) return;
        dragged.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
      // Keyboard users can stop it by tabbing into it.
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) focused.current = false;
      }}
      className={cn(
        "relative overflow-hidden",
        vertical && "h-full",
        draggable && !reduce && cn("cursor-grab select-none active:cursor-grabbing", vertical ? "touch-pan-x" : "touch-pan-y"),
        className,
      )}
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
      <motion.div
        className={cn("flex w-max", vertical && "w-full flex-col")}
        style={{ transform: reduce ? undefined : transform, gap }}
      >
        {Array.from({ length: copies }, (_, i) => (
          <div
            key={i}
            ref={i === 0 ? copyRef : undefined}
            // Only the first copy is read out or tabbed to; the rest are scenery.
            aria-hidden={i > 0 || undefined}
            inert={i > 0 || undefined}
            className={cn("flex shrink-0 items-center", vertical && "flex-col")}
            style={{ gap }}
            onDragStart={(e) => draggable && e.preventDefault()}
          >
            {children}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
