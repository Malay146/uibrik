"use client";

import { useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { MotionConfig, motion } from "motion/react";
import { cn } from "@/lib/utils";

// Checkbox and checkbox group. Ticking fills the box and draws the check on
// stroke by stroke; a box that's partly ticked shows a dash, and the check
// morphs into the dash and back rather than swapping. Unticking runs the
// stroke backwards before the fill lets go.
//
// The group can carry a "select all" box that goes indeterminate when only
// some are ticked. Shift-click ticks (or unticks) every box between the last
// one you clicked and this one, like a mail client.

export type CheckedState = boolean | "indeterminate";

const SIZES = {
  sm: { box: 16, radius: 4.5, text: "text-[13px]", gap: "gap-2.5" },
  md: { box: 18, radius: 5, text: "text-sm", gap: "gap-3" },
  lg: { box: 20, radius: 6, text: "text-[15px]", gap: "gap-3" },
} as const;

// Both marks have three points, so the path can morph between them.
const CHECK = "M4.5 9.25 L7.6 12.25 L13.5 6.25";
const DASH = "M5.25 9 L9 9 L12.75 9";
const EASE = [0.23, 1, 0.32, 1] as const;

type BoxProps = {
  state: CheckedState;
  size: keyof typeof SIZES;
  disabled?: boolean;
  /** Seconds the check takes to draw. */
  duration: number;
};

/** The square itself, without the button around it. */
function Box({ state, size, disabled, duration }: BoxProps) {
  const s = SIZES[size];
  const on = state !== false;
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center border transition-[border-color,box-shadow,scale] duration-150 ease-out",
        on
          ? "border-transparent"
          : "border-black/20 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] group-hover/cb:border-black/35 dark:border-white/20 dark:bg-white/[0.04] dark:group-hover/cb:border-white/35",
        "group-active/cb:scale-[0.92]",
        disabled && "group-active/cb:scale-100",
      )}
      style={{ width: s.box, height: s.box, borderRadius: s.radius }}
    >
      <motion.span
        className="absolute -inset-px bg-neutral-900 dark:bg-white"
        style={{ borderRadius: s.radius }}
        initial={false}
        animate={on ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.7 }}
        transition={on ? { duration: duration * 0.6, ease: EASE } : { duration: duration * 0.5, ease: EASE, delay: duration * 0.35 }}
      />
      <svg viewBox="0 0 18 18" className="relative size-full text-white dark:text-neutral-900" fill="none">
        <motion.path
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ d: state === "indeterminate" ? DASH : CHECK, pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
          transition={{
            d: { duration: duration * 0.8, ease: EASE },
            pathLength: on ? { duration, ease: EASE, delay: duration * 0.25 } : { duration: duration * 0.5, ease: EASE },
            opacity: on ? { duration: 0.01, delay: duration * 0.25 } : { duration: 0.01, delay: duration * 0.5 },
          }}
        />
      </svg>
    </span>
  );
}

export type CheckboxProps = {
  /** Checked state (controlled). Pair with `onCheckedChange`. */
  checked?: CheckedState;
  /** Checked state on mount (uncontrolled). */
  defaultChecked?: CheckedState;
  onCheckedChange?: (checked: boolean, event: MouseEvent<HTMLButtonElement>) => void;
  label?: ReactNode;
  /** Smaller second line under the label. */
  description?: ReactNode;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  /** Submits "on" (or `value`) under this name with a surrounding form while checked. */
  name?: string;
  value?: string;
  /** Seconds the check takes to draw. */
  duration?: number;
  id?: string;
  className?: string;
};

export function Checkbox({
  checked,
  defaultChecked = false,
  onCheckedChange,
  label,
  description,
  size = "md",
  disabled = false,
  name,
  value = "on",
  duration = 0.25,
  id,
  className,
}: CheckboxProps) {
  const [inner, setInner] = useState<CheckedState>(defaultChecked);
  const state = checked ?? inner;
  const auto = useId();
  const labelId = `${id ?? auto}-label`;
  const descId = `${id ?? auto}-desc`;
  const s = SIZES[size];

  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    // An indeterminate box ticks everything, like the native one.
    const next = state !== true;
    if (checked === undefined) setInner(next);
    onCheckedChange?.(next, e);
  };

  return (
    <MotionConfig reducedMotion="user">
      <button
        id={id}
        type="button"
        role="checkbox"
        aria-checked={state === "indeterminate" ? "mixed" : state}
        aria-labelledby={label ? labelId : undefined}
        aria-describedby={description ? descId : undefined}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          "group/cb relative flex w-fit cursor-pointer select-none items-start text-left outline-none",
          "rounded-md focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:cursor-default disabled:opacity-45",
          // A bare box still gets a 40px target on touch.
          !label && "before:absolute before:-inset-2.5 before:content-['']",
          s.gap,
          s.text,
          className,
        )}
      >
        <span className="flex items-center" style={{ height: label ? "1.43em" : undefined }}>
          <Box state={state} size={size} disabled={disabled} duration={duration} />
        </span>
        {label && (
          <span className="flex min-w-0 flex-col gap-0.5">
            <span id={labelId} className="font-medium leading-[1.43em] text-foreground">
              {label}
            </span>
            {description && (
              <span id={descId} className="text-[0.92em] leading-snug text-muted-foreground">
                {description}
              </span>
            )}
          </span>
        )}
        {name && state === true && <input type="hidden" name={name} value={value} />}
      </button>
    </MotionConfig>
  );
}

export type CheckboxOption = string | { value: string; label: ReactNode; description?: ReactNode; disabled?: boolean };

export type CheckboxGroupProps = {
  options: readonly CheckboxOption[];
  /** Ticked values (controlled). Pair with `onChange`. */
  value?: readonly string[];
  /** Ticked values on mount (uncontrolled). */
  defaultValue?: readonly string[];
  onChange?: (value: string[]) => void;
  /** Label for a parent box that ticks them all. Leave out for no parent. */
  selectAll?: ReactNode;
  /** Shift-click ticks every box between the last click and this one. */
  rangeSelect?: boolean;
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  /** Submits each ticked value under this name. */
  name?: string;
  /** Seconds the check takes to draw. */
  duration?: number;
  /** Names the group for screen readers. */
  label?: string;
  className?: string;
};

type Norm = { value: string; label: ReactNode; description?: ReactNode; disabled?: boolean };
const normalise = (o: CheckboxOption): Norm => (typeof o === "string" ? { value: o, label: o } : o);

export function CheckboxGroup({
  options,
  value,
  defaultValue = [],
  onChange,
  selectAll,
  rangeSelect = true,
  size = "md",
  disabled = false,
  name,
  duration = 0.25,
  label,
  className,
}: CheckboxGroupProps) {
  const items = options.map(normalise);
  const [inner, setInner] = useState<readonly string[]>(defaultValue);
  const selected = value ?? inner;
  const last = useRef<number | null>(null);

  const commit = (next: Set<string>) => {
    // Keep the options' order, whatever order they were ticked in.
    const list = items.filter((o) => next.has(o.value)).map((o) => o.value);
    if (value === undefined) setInner(list);
    onChange?.(list);
  };

  const enabled = items.filter((o) => !o.disabled && !disabled);
  const ticked = enabled.filter((o) => selected.includes(o.value)).length;
  const parent: CheckedState = ticked === 0 ? false : ticked === enabled.length ? true : "indeterminate";

  const toggleAll = (on: boolean) => {
    const next = new Set(selected);
    for (const o of enabled) {
      if (on) next.add(o.value);
      else next.delete(o.value);
    }
    commit(next);
    last.current = null;
  };

  const toggle = (i: number, on: boolean, shift: boolean) => {
    const next = new Set(selected);
    const from = rangeSelect && shift && last.current !== null ? Math.min(last.current, i) : i;
    const to = rangeSelect && shift && last.current !== null ? Math.max(last.current, i) : i;
    for (let k = from; k <= to; k++) {
      const o = items[k];
      if (o.disabled) continue;
      if (on) next.add(o.value);
      else next.delete(o.value);
    }
    commit(next);
    last.current = i;
  };

  return (
    <div role="group" aria-label={label} className={cn("flex flex-col", size === "sm" ? "gap-2.5" : "gap-3", className)}>
      {selectAll && (
        <Checkbox
          checked={parent}
          onCheckedChange={toggleAll}
          label={selectAll}
          size={size}
          disabled={disabled || enabled.length === 0}
          duration={duration}
        />
      )}
      <div className={cn("flex flex-col", size === "sm" ? "gap-2.5" : "gap-3", selectAll && "pl-[calc(var(--cb-box)+0.75rem)]")} style={{ ["--cb-box" as string]: `${SIZES[size].box}px` }}>
        {items.map((o, i) => (
          <Checkbox
            key={o.value}
            checked={selected.includes(o.value)}
            onCheckedChange={(on, e) => toggle(i, on, e.shiftKey)}
            label={o.label}
            description={o.description}
            size={size}
            disabled={disabled || o.disabled}
            name={name}
            value={o.value}
            duration={duration}
          />
        ))}
      </div>
    </div>
  );
}
