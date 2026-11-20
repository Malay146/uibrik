"use client";

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { cn } from "@/lib/utils";

// Radio group. There's one dot, and choosing another option sends it across
// to that option's ring instead of blinking one off and the next on, so the
// eye follows the choice. In the cards layout an outline travels with it,
// measured from the cards so it lands exactly on cards of any size.
//
// Tab lands on the chosen option, arrows move the choice (skipping disabled
// options), Home and End jump to the ends.

export type RadioOption =
  | string
  | { value: string; label: ReactNode; description?: ReactNode; /** Right-aligned detail, e.g. a price. */ meta?: ReactNode; icon?: ReactNode; disabled?: boolean };

export type RadioGroupProps = {
  options: readonly RadioOption[];
  /** Chosen value (controlled). Pair with `onChange`. */
  value?: string;
  /** Chosen value on mount (uncontrolled). Leave out for none. */
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Plain rows, or a bordered card per option. */
  variant?: "list" | "cards";
  /** Lay the options out in a column, or side by side where they fit. */
  orientation?: "vertical" | "horizontal";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  /** Submits the chosen value under this name with a surrounding form. */
  name?: string;
  /** Seconds the dot takes to travel. */
  duration?: number;
  /** Names the group for screen readers. */
  label?: string;
  className?: string;
};

const SIZES = {
  sm: { ring: 16, dot: 6, text: "text-[13px]", gap: "gap-2.5" },
  md: { ring: 18, dot: 8, text: "text-sm", gap: "gap-3" },
  lg: { ring: 20, dot: 9, text: "text-[15px]", gap: "gap-3" },
} as const;

type Norm = Exclude<RadioOption, string>;
const normalise = (o: RadioOption): Norm => (typeof o === "string" ? { value: o, label: o } : o);
type Rect = { x: number; y: number; w: number; h: number };

export function RadioGroup({
  options,
  value,
  defaultValue,
  onChange,
  variant = "list",
  orientation = "vertical",
  size = "md",
  disabled = false,
  name,
  duration = 0.3,
  label,
  className,
}: RadioGroupProps) {
  const items = options.map(normalise);
  const uid = useId();
  const [inner, setInner] = useState(defaultValue);
  const selected = value ?? inner;
  const selectedIndex = items.findIndex((o) => o.value === selected);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const wrap = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const s = SIZES[size];
  const cards = variant === "cards";
  const spring = { type: "spring", duration, bounce: 0 } as const;

  // Where each card sits, for the travelling outline.
  const count = items.length;
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el || !cards) return;
    const read = () =>
      setRects(refs.current.slice(0, count).map((b) => ({ x: b?.offsetLeft ?? 0, y: b?.offsetTop ?? 0, w: b?.offsetWidth ?? 0, h: b?.offsetHeight ?? 0 })));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    refs.current.forEach((b) => b && ro.observe(b));
    return () => ro.disconnect();
  }, [count, cards, size, orientation]);

  const usable = (i: number) => !disabled && !items[i]?.disabled;

  const choose = (i: number) => {
    if (!usable(i)) return;
    const v = items[i].value;
    if (value === undefined) setInner(v);
    if (v !== selected) onChange?.(v);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    const from = selectedIndex < 0 ? (step > 0 ? -1 : 0) : selectedIndex;
    let to = -1;
    if (e.key === "Home") to = items.findIndex((_, i) => usable(i));
    else if (e.key === "End") {
      for (let i = items.length - 1; i >= 0 && to < 0; i--) if (usable(i)) to = i;
    } else if (step) {
      for (let k = 1; k <= items.length; k++) {
        const i = (((from + step * k) % items.length) + items.length) % items.length;
        if (usable(i)) {
          to = i;
          break;
        }
      }
    }
    if (to < 0) return;
    e.preventDefault();
    choose(to);
    refs.current[to]?.focus();
  };

  // With nothing chosen, Tab lands on the first usable option.
  const tabStop = selectedIndex >= 0 ? selectedIndex : items.findIndex((_, i) => usable(i));
  const outline = cards && selectedIndex >= 0 ? rects[selectedIndex] : undefined;

  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup id={uid}>
        <div
          ref={wrap}
          role="radiogroup"
          aria-label={label}
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
          className={cn(
            "relative isolate flex",
            orientation === "horizontal" ? "flex-row flex-wrap" : "flex-col",
            cards ? "gap-2" : size === "sm" ? "gap-2.5" : "gap-3",
            orientation === "horizontal" && !cards && "gap-x-6",
            className,
          )}
        >
          {outline && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute left-0 top-0 z-10 rounded-xl ring-[1.5px] ring-inset ring-neutral-900 dark:ring-white"
              initial={false}
              animate={{ x: outline.x, y: outline.y, width: outline.w, height: outline.h }}
              transition={spring}
            />
          )}
          {items.map((o, i) => {
            const on = i === selectedIndex;
            return (
              <button
                key={o.value}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!usable(i)}
                tabIndex={i === tabStop ? 0 : -1}
                onClick={() => choose(i)}
                className={cn(
                  "group/rd relative flex cursor-pointer select-none items-start text-left outline-none",
                  "focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "disabled:cursor-default disabled:opacity-45",
                  s.gap,
                  s.text,
                  cards
                    ? "min-h-11 rounded-xl border border-black/[0.08] bg-white p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-150 hover:border-black/15 dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none dark:hover:border-white/20"
                    : "rounded-md py-0.5",
                  // Until the outline is measured, the chosen card draws its own.
                  cards && orientation === "horizontal" && "flex-1 basis-40",
                  cards && on && !outline && "ring-[1.5px] ring-inset ring-neutral-900 dark:ring-white",
                )}
              >
                <span className="flex items-center" style={{ height: "1.43em" }}>
                  <span
                    aria-hidden
                    className={cn(
                      "relative grid shrink-0 place-items-center rounded-full border transition-[border-color,background-color,scale] duration-150 ease-out group-active/rd:scale-[0.9]",
                      on
                        ? "border-neutral-900 bg-white dark:border-white dark:bg-white/[0.04]"
                        : "border-black/20 bg-white group-hover/rd:border-black/35 dark:border-white/20 dark:bg-white/[0.04] dark:group-hover/rd:border-white/35",
                    )}
                    style={{ width: s.ring, height: s.ring }}
                  >
                    {on && (
                      <motion.span
                        layoutId="dot"
                        className="rounded-full bg-neutral-900 dark:bg-white"
                        style={{ width: s.dot, height: s.dot }}
                        transition={spring}
                      />
                    )}
                  </span>
                </span>
                {o.icon && <span className="flex items-center text-muted-foreground [&_svg]:size-[1.15em]" style={{ height: "1.43em" }}>{o.icon}</span>}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-medium leading-[1.43em] text-foreground">{o.label}</span>
                    {o.meta && <span className="shrink-0 tabular-nums text-muted-foreground">{o.meta}</span>}
                  </span>
                  {o.description && <span className="text-[0.92em] leading-snug text-muted-foreground">{o.description}</span>}
                </span>
              </button>
            );
          })}
          {name && selected !== undefined && <input type="hidden" name={name} value={selected} />}
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}
