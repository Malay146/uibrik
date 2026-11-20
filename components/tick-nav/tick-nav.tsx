"use client";

// A section list laid along a ruler. Each item has a tick; finer ticks sit
// between them. Under the pointer the ticks lengthen like a dock, easing off
// with distance, and each label slides out with its tick. The current item
// keeps a longer tick and full contrast. Arrow keys move focus, and focus
// swells the ruler the same way the pointer does.

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TickNavItem = string | { label: string; href?: string };

export type TickNavProps = {
  items: readonly TickNavItem[];
  /** Selected index, controlled. Pair with `onValueChange`. */
  value?: number;
  defaultValue?: number;
  onValueChange?: (index: number) => void;
  /** Fine ticks between items. */
  minorTicks?: number;
  /** Space between neighbouring ticks in px; rows grow to fit the fine ticks. */
  tickGap?: number;
  /** How far the ticks swell under the pointer, 0–1. 0 turns it off. */
  magnify?: number;
  /** Colour for the selected item. Empty uses the text colour. */
  accent?: string;
  /** Accessible name for the list. */
  label?: string;
  className?: string;
};

const MIN_ROW = 36; // px per item, at least: room for the label
const MAJOR = 22; // resting tick length
const MINOR = 12;
const SWELL = 30; // extra length at the pointer, at magnify 1
const SELECTED = 10; // extra length the selected tick keeps
const RADIUS = 84; // px over which the swell fades out

/** Where the pointer is along the list, and how present it is (0 gone, 1 here). */
type Hover = { pos: MotionValue<number>; on: MotionValue<number> };

// 1 at the pointer, easing to 0 at RADIUS: a cosine bell, no hard edge.
const bell = (d: number) => (d >= RADIUS ? 0 : (Math.cos((Math.PI * d) / RADIUS) + 1) / 2);

const labelOf = (it: TickNavItem) => (typeof it === "string" ? it : it.label);
const hrefOf = (it: TickNavItem) => (typeof it === "string" ? undefined : it.href);

export function TickNav({
  items,
  value,
  defaultValue = 0,
  onValueChange,
  minorTicks = 4,
  tickGap = 9,
  magnify = 1,
  accent = "",
  label = "Sections",
  className,
}: TickNavProps) {
  const reduce = useReducedMotion();
  const [own, setOwn] = useState(defaultValue);
  const selected = value ?? own;
  const [near, setNear] = useState<number | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const rows = useRef<(HTMLElement | null)[]>([]);

  // The pointer's height in the list, smoothed so the swell glides between items.
  const target = useMotionValue(0);
  const pos = useSpring(target, { stiffness: 380, damping: 36, mass: 0.6 });
  // Entering and leaving fade the swell in place instead of moving it, so
  // arriving mid-list grows only the ticks there, and leaving shrinks them where they are.
  const onTarget = useMotionValue(0);
  const on = useSpring(onTarget, { stiffness: 300, damping: 34 });
  const pointer: Hover = { pos, on };
  const inside = useRef(false);
  const strength = reduce ? 0 : magnify;
  // Ticks sit an even `tickGap` apart, so a row is as tall as its fine ticks need.
  const ROW = Math.max(MIN_ROW, tickGap * (minorTicks + 1));
  const gap = ROW / (minorTicks + 1);

  const select = (i: number) => {
    if (value === undefined) setOwn(i);
    onValueChange?.(i);
  };

  const track = (y: number) => {
    if (!inside.current) {
      // Arriving: start the swell right here rather than gliding in from elsewhere.
      target.jump(y);
      pos.jump(y);
      inside.current = true;
    }
    target.set(y);
    onTarget.set(1);
    const i = Math.round((y - ROW / 2) / ROW);
    setNear(i >= 0 && i < items.length && Math.abs(y - (i * ROW + ROW / 2)) < ROW / 2 ? i : null);
  };

  const leave = () => {
    inside.current = false;
    onTarget.set(0);
    setNear(null);
  };

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const next = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    rows.current[Math.max(0, Math.min(items.length - 1, next))]?.focus();
  };

  return (
    <nav aria-label={label} className={cn("select-none", className)}>
      <ul
        ref={list}
        className="relative"
        style={{ height: items.length * ROW }}
        onPointerMove={(e) => {
          if (e.pointerType !== "mouse") return;
          track(e.clientY - list.current!.getBoundingClientRect().top);
        }}
        onPointerLeave={leave}
      >
        {/* Fine ticks between items, swelling with the same bell. Rows sit on a fixed grid, so every position is known without measuring. */}
        <li aria-hidden className="pointer-events-none absolute inset-0">
          {items.slice(0, -1).flatMap((_, i) =>
            Array.from({ length: minorTicks }, (_, k) => {
              const y = i * ROW + ROW / 2 + gap * (k + 1);
              return <Tick key={`m${i}-${k}`} y={y} rest={MINOR} pointer={pointer} strength={strength * 0.75} minor />;
            }),
          )}
        </li>

        {items.map((it, i) => {
          const y = i * ROW + ROW / 2;
          const isSelected = i === selected;
          const lit = isSelected || near === i;
          const href = hrefOf(it);
          const Tag = href ? "a" : "button";
          return (
            <li key={i} className="absolute inset-x-0 flex items-center" style={{ top: i * ROW, height: ROW }}>
              <Tick y={y} rest={MAJOR} pointer={pointer} strength={strength} selected={isSelected} color={isSelected ? accent : ""} lit={lit} />
              <Shifted y={y} pointer={pointer} strength={strength} selected={isSelected}>
                <Tag
                  ref={(el: HTMLElement | null) => {
                    rows.current[i] = el;
                  }}
                  {...(href ? { href } : { type: "button" as const })}
                  aria-current={isSelected ? (href ? "location" : "true") : undefined}
                  onClick={() => select(i)}
                  onFocus={() => track(y)}
                  onBlur={leave}
                  onKeyDown={(e: KeyboardEvent) => onKeyDown(e, i)}
                  className={cn(
                    "flex h-8 cursor-pointer items-center gap-3 rounded-lg px-2 text-[15px] tracking-tight outline-none transition-colors duration-200",
                    "focus-visible:ring-2 focus-visible:ring-neutral-400",
                    lit ? "text-foreground" : "text-muted-foreground",
                    isSelected && "font-medium",
                  )}
                  style={isSelected && accent ? { color: accent } : undefined}
                >
                  {labelOf(it)}
                </Tag>
              </Shifted>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

// Extra length from the pointer's bell, plus the selected bonus (eased in and out).
function useLength(y: number, pointer: Hover, strength: number, rest: number, selected = false) {
  const bonus = useMotionValue(selected ? SELECTED : 0);
  useEffect(() => {
    const c = animate(bonus, selected ? SELECTED : 0, { type: "spring", duration: 0.35, bounce: 0 });
    return () => c.stop();
  }, [selected, bonus]);
  return useTransform([pointer.pos, pointer.on, bonus], ([p, on, b]: number[]) => rest + b + SWELL * strength * on * bell(Math.abs(p - y)));
}

function Tick({
  y,
  rest,
  pointer,
  strength,
  selected = false,
  minor = false,
  lit = false,
  color = "",
}: {
  y: number;
  rest: number;
  pointer: Hover;
  strength: number;
  selected?: boolean;
  minor?: boolean;
  lit?: boolean;
  color?: string;
}) {
  const width = useLength(y, pointer, strength, rest, selected);
  return (
    <motion.span
      aria-hidden
      className={cn(
        "absolute left-0 h-px origin-left rounded-full transition-colors duration-200",
        minor ? "bg-foreground/20" : selected ? "bg-foreground" : lit ? "bg-foreground/70" : "bg-foreground/30",
      )}
      style={{ top: minor ? y : "50%", width, backgroundColor: color || undefined }}
    />
  );
}

// The label rides out with its tick, keeping a constant gap to its end.
function Shifted({
  y,
  pointer,
  strength,
  selected,
  children,
}: {
  y: number;
  pointer: Hover;
  strength: number;
  selected: boolean;
  children: ReactNode;
}) {
  const width = useLength(y, pointer, strength, MAJOR, selected);
  const x = useTransform(width, (w) => w - MAJOR);
  return (
    <motion.div className="relative" style={{ x, marginLeft: MAJOR + 14 }}>
      {children}
    </motion.div>
  );
}
