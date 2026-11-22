"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export type PasswordPeekProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange" | "size"> & {
  /** Controlled value. */
  value?: string;
  /** Value on mount when uncontrolled. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Controlled visibility. */
  visible?: boolean;
  /** Visibility on mount when uncontrolled. */
  defaultVisible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
  /** Label above the field. Leave empty to hide it; it stays as the accessible name. */
  label?: string;
  /** Seconds the whole left-to-right reveal may take, however long the password. */
  revealDuration?: number;
  /** Corner radius in px. */
  radius?: number;
  className?: string;
};

export function PasswordPeek({
  value: valueProp,
  defaultValue = "",
  onValueChange,
  visible: visibleProp,
  defaultVisible = false,
  onVisibleChange,
  label = "Password",
  placeholder = "Enter password",
  revealDuration = 0.35,
  radius = 12,
  className,
  id: idProp,
  ...rest
}: PasswordPeekProps) {
  const reduce = useReducedMotion();
  const autoId = useId();
  const id = idProp ?? autoId;
  const [innerValue, setInnerValue] = useState(defaultValue);
  const [innerVisible, setInnerVisible] = useState(defaultVisible);
  const value = valueProp ?? innerValue;
  const visible = visibleProp ?? innerVisible;
  const input = useRef<HTMLInputElement>(null);
  // While a peek plays, the native text is hidden and a copy of the characters
  // animates over it; the copy ends on exactly what the input then shows.
  const [peek, setPeek] = useState<{ to: "show" | "hide"; run: number } | null>(null);
  const [scroll, setScroll] = useState(0);
  const prev = useRef(visible);

  const chars = Array.from(value);
  const step = chars.length > 1 ? Math.min(0.03, revealDuration / chars.length) : 0;
  const charDur = 0.22;
  const total = step * chars.length + charDur;

  // Runs before paint, so the input never flashes its new text or dots before
  // the copy takes over. Showing: the native text stays clear until the copy
  // has landed on the same pixels. Hiding: the native dots fade in as the
  // characters lift away.
  useLayoutEffect(() => {
    if (prev.current === visible) return;
    prev.current = visible;
    const el = input.current;
    if (reduce || !value || !el) return;
    const color = getComputedStyle(el.parentElement ?? el).color;
    el.getAnimations().forEach((a) => a.cancel());
    el.animate(
      visible ? [{ color: "transparent" }, { color: "transparent" }] : [{ color: "transparent" }, { color }],
      { duration: total * 1000, easing: "ease-in" },
    );
    setScroll(el.scrollLeft);
    setPeek((p) => ({ to: visible ? "show" : "hide", run: (p?.run ?? 0) + 1 }));
  }, [visible, reduce, value, total]);

  useEffect(() => {
    if (!peek) return;
    const t = setTimeout(() => setPeek(null), total * 1000);
    return () => clearTimeout(t);
  }, [peek, total]);

  const toggle = () => {
    const next = !visible;
    if (visibleProp === undefined) setInnerVisible(next);
    onVisibleChange?.(next);
    input.current?.focus({ preventScroll: true });
  };

  return (
    <div className={cn("flex w-full max-w-[340px] flex-col gap-2", className)}>
      {label && (
        <label htmlFor={id} className="text-[13px] font-medium tracking-tight text-neutral-600 dark:text-neutral-400">
          {label}
        </label>
      )}
      <div
        className="relative flex h-11 items-center bg-neutral-100 text-[15px] text-neutral-900 focus-within:ring-2 focus-within:ring-neutral-400 dark:bg-neutral-900 dark:text-neutral-100"
        style={{ borderRadius: radius }}
      >
        <input
          ref={input}
          id={id}
          type={visible ? "text" : "password"}
          aria-label={label ? undefined : "Password"}
          autoComplete="current-password"
          spellCheck={false}
          autoCapitalize="off"
          placeholder={placeholder}
          {...rest}
          value={value}
          onChange={(e) => {
            if (valueProp === undefined) setInnerValue(e.target.value);
            onValueChange?.(e.target.value);
          }}
          onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}
          className="h-full min-w-0 flex-1 bg-transparent caret-neutral-900 dark:caret-neutral-100 pl-3.5 pr-1 tracking-normal outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
        />
        {peek && (
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3.5 right-11 overflow-hidden">
            <span className="flex h-full items-center whitespace-pre tracking-normal" style={{ transform: `translateX(${-scroll}px)` }}>
              {chars.map((ch, i) => (
                <motion.span
                  key={`${peek.run}-${i}`}
                  className="inline-block"
                  initial={peek.to === "show" ? { opacity: 0, y: 7, filter: "blur(3px)" } : { opacity: 1, y: 0, filter: "blur(0px)" }}
                  animate={peek.to === "show" ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: -7, filter: "blur(3px)" }}
                  transition={{ duration: charDur, ease: EASE_OUT, delay: i * step }}
                >
                  {ch}
                </motion.span>
              ))}
            </span>
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={id}
          className="mr-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-neutral-500 outline-none transition-colors duration-150 hover:bg-neutral-200/70 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
        >
          <Eye open={visible} />
        </button>
      </div>
    </div>
  );
}

function Eye({ open }: { open: boolean }) {
  const reduce = useReducedMotion();
  const mask = useId();
  const [blink, setBlink] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setBlink((b) => b + 1);
  }, [open]);
  const slash = {
    initial: false as const,
    // Opacity too: a zero-length path still paints its round cap as a dot.
    animate: { pathLength: open ? 0 : 1, opacity: open ? 0 : 1 },
    transition: {
      pathLength: { duration: reduce ? 0 : 0.22, ease: EASE_OUT, delay: reduce ? 0 : open ? 0 : 0.1 },
      opacity: { duration: reduce ? 0 : 0.05, delay: reduce ? 0 : open ? 0.18 : 0.1 },
    },
  };

  return (
    <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="white" />
          <motion.path d="M4 4 L20 20" stroke="black" strokeWidth={4.5} {...slash} />
        </mask>
      </defs>
      {/* A quick blink on every toggle: the eye closes to a line and opens again. */}
      <motion.g
        key={blink}
        mask={`url(#${mask})`}
        style={{ originY: "12px", transformBox: "view-box" }}
        initial={false}
        animate={blink && !reduce ? { scaleY: [1, 0.08, 1] } : { scaleY: 1 }}
        transition={{ duration: 0.26, times: [0, 0.45, 1], ease: "easeInOut" }}
      >
        <path d="M2.8 12 C5 7.6 8.2 5.6 12 5.6 C15.8 5.6 19 7.6 21.2 12 C19 16.4 15.8 18.4 12 18.4 C8.2 18.4 5 16.4 2.8 12 Z" />
        <circle cx="12" cy="12" r="2.8" />
      </motion.g>
      <motion.path d="M4 4 L20 20" {...slash} />
    </svg>
  );
}
