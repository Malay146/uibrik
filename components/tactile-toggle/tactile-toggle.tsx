"use client";

import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

// ─── Geometry ─────────────────────────────────────────────────────────────────
const TRACK_W = 44;
const TRACK_H = 26;
const PAD = 2;
const KNOB = TRACK_H - PAD * 2;
// Pointer travel before a press counts as a drag rather than a tap.
const DRAG_SLOP = 3;

const SPRING = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 } as const;
const INSTANT = { duration: 0 } as const;
// Off track: a tint of the text colour, so it reads in light and dark alike.
const TRACK_OFF = "color-mix(in srgb, var(--foreground) 14%, transparent)";

export type TactileToggleProps = {
  /** Controlled state. Leave out to let the toggle keep its own. */
  checked?: boolean;
  /** Starting state when uncontrolled. */
  defaultChecked?: boolean;
  /** Called with the new state when the switch flips. */
  onCheckedChange?: (checked: boolean) => void;
  /** Track colour when on. */
  accent?: string;
  /** How far the knob stretches while pressed, in px. */
  squish?: number;
  disabled?: boolean;
  className?: string;
  /** Accessible name, since the switch shows no text. */
  "aria-label"?: string;
};

/** A switch whose knob squishes under the finger and can be dragged like the real thing. */
export function TactileToggle({
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  accent = "#22c55e",
  squish: squishProp = 6,
  disabled = false,
  className,
  "aria-label": ariaLabel = "Toggle",
}: TactileToggleProps) {
  const reduce = !!useReducedMotion();
  const squish = reduce ? 0 : squishProp;
  const [inner, setInner] = useState(defaultChecked);
  const checked = checkedProp ?? inner;
  const [pressed, setPressed] = useState(false);
  // Knob position while it's being dragged; null when it's at rest.
  const [dragX, setDragX] = useState<number | null>(null);
  const drag = useRef<{ startX: number; from: number; moved: boolean } | null>(null);
  // A drag ends in a click on the switch; that click must not flip it again.
  const swallowClick = useRef(false);

  const flip = (next: boolean) => {
    if (next === checked) return;
    setInner(next);
    onCheckedChange?.(next);
  };

  // The knob grows toward the middle while pressed, so it stays pinned to
  // whichever end it rests on: on the right it has to shift left as it widens.
  const knobW = KNOB + (pressed ? squish : 0);
  const travel = TRACK_W - PAD * 2 - knobW;
  const knobX = dragX ?? (checked ? travel : 0);
  // Mid-drag the track already shows the side the knob will land on.
  const on = dragX === null ? checked : dragX > travel / 2;

  const release = () => {
    const d = drag.current;
    drag.current = null;
    setPressed(false);
    if (d?.moved && dragX !== null) {
      swallowClick.current = true;
      flip(dragX > travel / 2);
    }
    setDragX(null);
  };

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => {
        if (swallowClick.current) {
          swallowClick.current = false;
          return;
        }
        flip(!checked);
      }}
      onPointerDown={(e) => {
        if (disabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setPressed(true);
        drag.current = { startX: e.clientX, from: checked ? TRACK_W - PAD * 2 - KNOB - squish : 0, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.startX;
        if (!d.moved && Math.abs(dx) < DRAG_SLOP) return;
        d.moved = true;
        setDragX(Math.min(travel, Math.max(0, d.from + dx)));
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={(e) => e.key === " " && setPressed(true)}
      onKeyUp={() => setPressed(false)}
      className={cn(
        "relative shrink-0 cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-default disabled:opacity-50",
        className,
      )}
      style={{ width: TRACK_W, height: TRACK_H, padding: PAD }}
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full"
        initial={false}
        animate={{ backgroundColor: on ? accent : TRACK_OFF }}
        transition={{ duration: 0.2 }}
      />
      <motion.span
        aria-hidden
        className="relative block rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.2),0_0_0_0.5px_rgb(0_0_0/0.06)] dark:shadow-[0_1px_3px_rgb(0_0_0/0.5)]"
        style={{ height: KNOB }}
        initial={false}
        animate={{ width: knobW, x: knobX }}
        // Under the finger the knob tracks exactly; let go and it springs home.
        transition={reduce || dragX !== null ? INSTANT : SPRING}
      />
    </motion.button>
  );
}
