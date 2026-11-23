"use client";

import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export type StoryRingProps = {
  /** Avatar image. Without one, the initials show. */
  src?: string;
  name: string;
  /** Stories in the ring: one arc each. */
  count?: number;
  /** Controlled number of stories already seen. */
  seen?: number;
  /** Stories seen on mount when uncontrolled. */
  defaultSeen?: number;
  onSeenChange?: (seen: number) => void;
  /**
   * Called on press with the story to open (the first unseen one, or 0 once
   * all are seen). The ring spins until the returned promise settles.
   */
  onOpen?: (index: number) => void | Promise<unknown>;
  /** How long the ring spins when onOpen returns nothing, ms. */
  loadTime?: number;
  /** Ring colour: drawn as a gradient of its own shades. */
  color?: string;
  /** Two or more colours for the gradient instead of shades of `color`. */
  colors?: string[];
  /** Avatar diameter in px. */
  size?: number;
  /** Show the name under the avatar. */
  showName?: boolean;
  className?: string;
};

const STROKE = 2.5;
const SEEN_STROKE = 1.5;
const INSET = 3;
// Gap between arcs, px along the ring.
const GAP_PX = 6;

/**
 * An avatar in a story ring: one gradient arc per story. Pressing it spins the
 * ring into dashes while the story loads, then the arc you opened drains to
 * grey and thins, so what's left to watch is always visible.
 */
export function StoryRing({
  src,
  name,
  count = 3,
  seen: seenProp,
  defaultSeen = 0,
  onSeenChange,
  onOpen,
  loadTime = 900,
  color = "#e1306c",
  colors,
  size = 64,
  showName = true,
  className,
}: StoryRingProps) {
  const reduce = useReducedMotion();
  const [inner, setInner] = useState(defaultSeen);
  const seen = Math.min(count, Math.max(0, seenProp ?? inner));
  const [loading, setLoading] = useState(false);
  const spin = useAnimationControls();
  const gradId = useId();
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const box = size + (INSET + STROKE) * 2;
  const c = box / 2;
  const r = size / 2 + INSET + STROKE / 2;
  const n = Math.max(1, count);
  const gap = n > 1 ? GAP_PX / (2 * Math.PI * r) : 0;
  const seg = 1 / n - gap;
  // Shades of one colour: lighter and a touch warmer at one end, deeper and cooler at the other.
  const stops =
    colors && colors.length >= 2
      ? colors
      : [`color-mix(in oklab, color-mix(in oklab, ${color}, #ffb020 16%), white 30%)`, color, `color-mix(in oklab, color-mix(in oklab, ${color}, #4b2bd6 14%), black 22%)`];
  const allSeen = seen >= n;

  // The dashes turn while loading; when it stops they coast to rest.
  const spun = useRef(false);
  useEffect(() => {
    if (loading && !reduce) {
      spun.current = true;
      spin.start({ rotate: [0, 360], transition: { duration: 1.1, ease: "linear", repeat: Infinity } });
    } else if (spun.current) {
      spun.current = false;
      spin.start({ rotate: 360, transition: { duration: 0.5, ease: EASE_OUT } }).then(() => spin.set({ rotate: 0 }));
    }
  }, [loading, reduce, spin]);

  const press = async () => {
    if (loading) return;
    const index = allSeen ? 0 : seen;
    setLoading(true);
    const started = Date.now();
    try {
      const out = onOpen?.(index);
      if (out && typeof (out as Promise<unknown>).then === "function") await out;
      else await new Promise((res) => setTimeout(res, loadTime));
    } catch {
      if (alive.current) setLoading(false);
      return;
    }
    // Never flash: keep the spin up long enough to read as one turn.
    const left = 450 - (Date.now() - started);
    if (left > 0) await new Promise((res) => setTimeout(res, left));
    if (!alive.current) return;
    setLoading(false);
    if (!allSeen) {
      if (seenProp === undefined) setInner(seen + 1);
      onSeenChange?.(seen + 1);
    }
  };

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  const t = reduce ? { duration: 0 } : { duration: 0.5, ease: EASE_OUT };

  return (
    <div className={cn("inline-flex flex-col items-center gap-1.5", className)} style={{ width: box }}>
      <motion.button
        type="button"
        onClick={press}
        aria-busy={loading}
        aria-label={`${name}'s story, ${allSeen ? "all seen" : `${n - seen} new`}`}
        whileTap={reduce ? undefined : { scale: 0.94 }}
        transition={{ type: "spring", duration: 0.3, bounce: 0.3 }}
        className="relative cursor-pointer rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
        style={{ width: box, height: box }}
      >
        <svg viewBox={`0 0 ${box} ${box}`} width={box} height={box} className="absolute inset-0 overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1={0} y1={box} x2={box} y2={0}>
              {stops.map((s, i) => (
                <stop key={i} offset={i / (stops.length - 1)} style={{ stopColor: s }} />
              ))}
            </linearGradient>
          </defs>
          <motion.g animate={spin} style={{ originX: "50%", originY: "50%" }}>
            {/* One arc per story, starting at twelve o'clock. */}
            <motion.g initial={false} animate={{ opacity: loading ? 0 : 1 }} transition={{ duration: reduce ? 0 : 0.18 }}>
              {Array.from({ length: n }, (_, i) => {
                const start = i / n + gap / 2;
                const done = i < seen;
                return (
                  <g key={i} transform={`rotate(-90 ${c} ${c})`}>
                    <motion.circle
                      cx={c}
                      cy={c}
                      r={r}
                      fill="none"
                      pathLength={1}
                      stroke={`url(#${gradId})`}
                      strokeLinecap="round"
                      strokeDasharray={`${seg} ${1 - seg}`}
                      strokeDashoffset={-start}
                      initial={false}
                      animate={{ strokeWidth: done ? SEEN_STROKE : STROKE, opacity: done ? 0 : 1 }}
                      transition={{ ...t, opacity: { duration: reduce ? 0 : 0.2, delay: done && !reduce ? 0.45 : 0 } }}
                    />
                    {/* Grey sweeps over an arc once its story is seen. */}
                    <motion.circle
                      cx={c}
                      cy={c}
                      r={r}
                      fill="none"
                      pathLength={1}
                      className="stroke-neutral-300 dark:stroke-neutral-700"
                      strokeLinecap="round"
                      strokeDashoffset={-start}
                      initial={false}
                      animate={{ strokeDasharray: done ? `${seg} ${1 - seg}` : `0 1`, strokeWidth: done ? SEEN_STROKE : STROKE, opacity: done ? 1 : 0 }}
                      transition={{ ...t, opacity: { duration: 0.01 } }}
                    />
                  </g>
                );
              })}
            </motion.g>
            {/* While loading, the ring breaks into turning dashes. */}
            <motion.circle
              cx={c}
              cy={c}
              r={r}
              fill="none"
              pathLength={1}
              stroke={`url(#${gradId})`}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray="0.035 0.0275"
              initial={false}
              animate={{ opacity: loading ? 1 : 0 }}
              transition={{ duration: reduce ? 0 : 0.18 }}
            />
          </motion.g>
        </svg>
        <span className="absolute overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800" style={{ inset: INSET + STROKE }}>
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" width={size} height={size} decoding="async" draggable={false} className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center font-medium tracking-tight text-neutral-600 dark:text-neutral-300" style={{ fontSize: size * 0.34 }}>
              {initials}
            </span>
          )}
        </span>
      </motion.button>
      {showName && (
        <span className={cn("max-w-full truncate text-xs tracking-tight transition-colors duration-300", allSeen ? "text-neutral-500 dark:text-neutral-400" : "font-medium text-neutral-900 dark:text-neutral-100")}>
          {name}
        </span>
      )}
    </div>
  );
}
