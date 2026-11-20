"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const BOOKMARK = "M18 7v14l-6 -4l-6 4v-14a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4z";

const STAR = "M12 0C12.6 6.6 17.4 11.4 24 12C17.4 12.6 12.6 17.4 12 24C11.4 17.4 6.6 12.6 0 12C6.6 11.4 11.4 6.6 12 0Z";

const SIZES = {
  sm: { height: 32, padX: 10, font: 13, icon: 16 },
  md: { height: 40, padX: 13, font: 14, icon: 18 },
  lg: { height: 48, padX: 16, font: 15, icon: 20 },
} as const;

// Neutral looks shared by the library's quiet buttons.
const VARIANTS = {
  soft: "bg-muted hover:bg-neutral-200/70 dark:hover:bg-neutral-800",
  ghost: "bg-transparent hover:bg-muted",
  outline: "bg-background shadow-[inset_0_0_0_1px_var(--border)] hover:bg-muted",
} as const;

/**
 * How the bookmark fills when saved.
 * - drop: from the top, like a ribbon falling into place
 * - rise: from the bottom up
 * - pop: out from the centre
 */
export type BookmarkFill = "drop" | "rise" | "pop";

const FILL_ORIGIN: Record<BookmarkFill, { originX: number; originY: number }> = {
  drop: { originX: 0.5, originY: 0 },
  rise: { originX: 0.5, originY: 1 },
  pop: { originX: 0.5, originY: 0.5 },
};

// Three sparkles around the icon, largest first. Positions are the sparkle's
// centre relative to the icon's top-left, for an 18px icon (scaled to the real
// one); `dx`/`dy` is the small drift away from the icon as each one pops.
// Kept inside the button, which clips.
const SPARKLES = [
  { x: 20, y: -2, size: 10, dx: 3, dy: -2, delay: 0.12 },
  { x: -3, y: 0, size: 7, dx: -2, dy: -2, delay: 0.18 },
  { x: -2, y: 17, size: 5, dx: -2, dy: 2, delay: 0.24 },
];

export type BookmarkButtonProps = {
  label?: string;
  /** Shown once saved. */
  savedLabel?: string;
  defaultSaved?: boolean;
  /** Icon and label, or the icon alone (the label stays as its accessible name). */
  display?: "label" | "icon";
  /** How the bookmark fills when saved. */
  fill?: BookmarkFill;
  /** Three sparkles pop around the icon on save. */
  sparkles?: boolean;
  /** Colour the saved bookmark and its sparkles, instead of keeping them neutral. */
  tint?: boolean;
  /** Colour of the saved bookmark when tinted. */
  color?: string;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Corner radius in px. */
  radius?: number;
  /** Called with the new state after each toggle. */
  onChange?: (saved: boolean) => void;
  className?: string;
};

export function BookmarkButton({
  label = "Save",
  savedLabel = "Saved",
  defaultSaved = false,
  display = "label",
  fill = "drop",
  sparkles = true,
  tint = false,
  color = "#f59e0b",
  variant = "soft",
  size = "md",
  radius = 12,
  onChange,
  className,
}: BookmarkButtonProps) {
  const [saved, setSaved] = useState(defaultSaved);
  // Bumped on every save so the sparkles replay, even on a quick re-save.
  const [burst, setBurst] = useState(0);
  const clipId = useId();
  // The button eases between the two label widths instead of snapping.
  const [ref, { width }] = useMeasure();
  const current = saved ? savedLabel : label;
  const s = SIZES[size];
  const iconOnly = display === "icon";
  const k = s.icon / 18;
  const accent = saved && tint ? color : undefined;

  const toggle = () => {
    if (!saved) setBurst((n) => n + 1);
    setSaved(!saved);
    onChange?.(!saved);
  };

  return (
    <motion.button
      type="button"
      aria-pressed={saved}
      aria-label={iconOnly ? current : undefined}
      onClick={toggle}
      whileTap={{ scale: 0.96 }}
      animate={{ width: width || "auto" }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      style={{ height: s.height, fontSize: s.font, borderRadius: radius }}
      className={cn(
        "relative cursor-pointer overflow-hidden font-medium tracking-tight outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        VARIANTS[variant],
        saved ? "text-foreground" : "text-neutral-600 dark:text-neutral-400",
        className,
      )}
    >
      <span
        ref={ref}
        className="flex h-full w-max items-center gap-1.5"
        // Icon-only is a square: the icon centred in the button's height.
        style={iconOnly ? { width: s.height, justifyContent: "center" } : { paddingLeft: s.padX - 1, paddingRight: s.padX }}
      >
        <span className="relative flex shrink-0" style={{ color: accent }}>
          {sparkles &&
            saved &&
            burst > 0 &&
            SPARKLES.map((p, i) => (
              <motion.svg
                key={`${burst}-${i}`}
                aria-hidden
                width={p.size * k}
                height={p.size * k}
                viewBox="0 0 24 24"
                fill="currentColor"
                className="pointer-events-none absolute"
                style={{ left: (p.x - p.size / 2) * k, top: (p.y - p.size / 2) * k }}
                // Fully opaque throughout: each one pops in slightly past full size,
                // settles, turns a little as it drifts out, then shrinks away.
                // Only the last sliver fades, so it never reads as see-through.
                initial={{ scale: 0, opacity: 1, rotate: -30, x: 0, y: 0 }}
                animate={{ scale: [0, 1.2, 1, 0], opacity: [1, 1, 1, 0], rotate: 60, x: p.dx * k, y: p.dy * k }}
                // Per-value transitions replace the parent one outright, so each repeats the timing.
                transition={{
                  default: { duration: 0.6, delay: p.delay, ease: EASE_OUT },
                  scale: { duration: 0.6, delay: p.delay, times: [0, 0.3, 0.55, 1], ease: ["easeOut", "easeInOut", "easeIn"] },
                  opacity: { duration: 0.6, delay: p.delay, times: [0, 0.3, 0.9, 1] },
                }}
              >
                <path d={STAR} />
              </motion.svg>
            ))}
          <svg
            aria-hidden
            width={s.icon}
            height={s.icon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 transition-colors duration-200"
          >
            <clipPath id={clipId}>
              <motion.rect
                x={0}
                y={0}
                width={24}
                height={24}
                initial={false}
                animate={fill === "pop" ? { scale: saved ? 1 : 0 } : { scaleY: saved ? 1 : 0 }}
                transition={{ duration: saved ? 0.35 : 0.2, ease: EASE_OUT }}
                style={FILL_ORIGIN[fill]}
              />
            </clipPath>
            <path d={BOOKMARK} />
            <path d={BOOKMARK} fill="currentColor" clipPath={`url(#${clipId})`} />
          </svg>
        </span>
        {!iconOnly && (
          <span className="relative overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={current}
                initial={{ y: "100%", opacity: 0, filter: "blur(2px)" }}
                animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                exit={{ y: "-100%", opacity: 0, filter: "blur(2px)" }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="block whitespace-nowrap"
              >
                {current}
              </motion.span>
            </AnimatePresence>
          </span>
        )}
      </span>
    </motion.button>
  );
}
