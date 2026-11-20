"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const SIZES = {
  sm: { height: 36, padX: 12, font: 14 },
  md: { height: 44, padX: 14, font: 15 },
  lg: { height: 52, padX: 16, font: 16 },
} as const;

type Allow = (char: string, soFar: string) => boolean;

// Each preset decides one character at a time against what has been kept so
// far, so "amount" can allow one dot and two decimals without a regex.
const PRESETS: Record<string, { allow: Allow; hint: string; inputMode: "numeric" | "decimal" | "text" }> = {
  digits: { allow: (c) => c >= "0" && c <= "9", hint: "Numbers only", inputMode: "numeric" },
  letters: { allow: (c) => /\p{L}| /u.test(c), hint: "Letters only", inputMode: "text" },
  alphanumeric: { allow: (c) => /[\p{L}\p{N}]/u.test(c), hint: "Letters and numbers only", inputMode: "text" },
  amount: {
    allow: (c, s) => {
      if (c === ".") return !s.includes(".");
      if (c < "0" || c > "9") return false;
      const dot = s.indexOf(".");
      return dot === -1 || s.length - dot <= 2;
    },
    hint: "Up to two decimals",
    inputMode: "decimal",
  },
};

// Never more pieces in flight than this, however much is pasted.
const MAX_PIECES = 24;

export type RejectDropInputProps = {
  /** Which characters the field keeps. Ignored when `allow` is given. */
  accept?: "digits" | "letters" | "alphanumeric" | "amount";
  /** Custom rule: return true to keep `char`, given the value kept so far. */
  allow?: Allow;
  /** Characters past this count are rejected too. 0 for no limit. */
  maxLength?: number;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Called with the characters that were thrown out. */
  onReject?: (rejected: string) => void;
  placeholder?: string;
  /** Accessible name for the field. */
  label?: string;
  /** Shown under the field for a moment after a rejection. Defaults to the preset's hint. */
  hint?: string;
  /** Colour of rejected characters and the hint. */
  color?: string;
  /** How hard rejected characters fall. 1 is roughly Earth. */
  gravity?: number;
  /** Nudge the field sideways when something is rejected. */
  shake?: boolean;
  size?: keyof typeof SIZES;
  /** Corner radius in px. */
  radius?: number;
  className?: string;
};

type Piece = {
  el: HTMLSpanElement;
  x: number;
  y: number;
  /** -1 tips and drifts left, 1 right. */
  dir: number;
  vx: number;
  vy: number;
  /** Spin speed and spin-up, in degrees per second (squared). */
  w: number;
  spin: number;
  start: number;
};

// Pixels per second squared. Text this size falling at this rate reads as a
// small real object dropping, rather than floating or being yanked.
const G = 2400;
// Seconds a rejected letter sits in place, turning red, before it falls.
const HOLD = 0.09;

export function RejectDropInput({
  accept = "digits",
  allow,
  maxLength = 0,
  value,
  defaultValue = "",
  onChange,
  onReject,
  placeholder = "0000 0000",
  label = "Number",
  hint,
  color = "#ef4444",
  gravity = 1,
  shake = false,
  size = "md",
  radius = 12,
  className,
}: RejectDropInputProps) {
  const preset = PRESETS[accept] ?? PRESETS.digits;
  const rule = allow ?? preset.allow;
  const hintText = hint ?? preset.hint;

  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const [showHint, setShowHint] = useState(false);
  const [announce, setAnnounce] = useState("");
  const reduce = useReducedMotion();
  const id = useId();

  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const caretRef = useRef<number | null>(null);
  const pieces = useRef<Piece[]>([]);
  const raf = useRef(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const s = SIZES[size];

  // The caret has to land where the user typed, not at the end, once the
  // rejected characters are cut out.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (el && caretRef.current !== null && document.activeElement === el) {
      el.setSelectionRange(caretRef.current, caretRef.current);
    }
    caretRef.current = null;
  });

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(hintTimer.current);
    },
    [],
  );

  // One loop for every piece. Positions come from closed-form motion (where a
  // body is after t seconds of gravity), not per-frame integration, so a
  // dropped frame on a slow phone never changes the path, only skips along it.
  const tick = useCallback(
    function step(now: number) {
      const g = G * gravity;
      for (const p of pieces.current) {
        const t = (now - p.start) / 1000;
        if (t < 0) continue;
        if (t < HOLD) {
          // Sitting where it was typed, it starts to lean over its outer
          // corner as it loses its footing.
          const k = t / HOLD;
          p.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.dir * 5 * k * k}deg)`;
          continue;
        }
        const f = t - HOLD;
        const x = p.x + p.vx * f;
        const y = p.y + p.vy * f + 0.5 * g * f * f;
        const r = p.dir * 5 + p.dir * (p.w * f + 0.5 * p.spin * f * f);
        // Fades only once it is clearly on its way, gone before it gets far.
        const o = 1 - Math.min(1, Math.max(0, (f - 0.08) / 0.3)) ** 1.6;
        p.el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${r}deg)`;
        p.el.style.opacity = String(o);
        if (o <= 0) p.el.remove();
      }
      pieces.current = pieces.current.filter((p) => p.el.isConnected);
      if (pieces.current.length) raf.current = requestAnimationFrame(step);
    },
    [gravity],
  );

  const drop = (chars: string[], startX: number) => {
    const layer = layerRef.current;
    const field = fieldRef.current;
    const input = inputRef.current;
    const m = measureRef.current;
    if (!layer || !field || !input || !m) return;
    const style = getComputedStyle(input);
    const top = (field.offsetHeight - m.offsetHeight) / 2;
    const now = performance.now();
    let x = startX;
    chars.slice(0, MAX_PIECES).forEach((ch, i) => {
      const el = document.createElement("span");
      el.textContent = ch === " " ? "\u00a0" : ch;
      // Same font and weight as the field, so the piece is the letter that
      // was typed: it appears in the text colour and blushes red before it
      // goes.
      el.style.cssText = `position:absolute;left:0;top:0;font:${style.font};letter-spacing:${style.letterSpacing};font-variant-numeric:tabular-nums;color:${style.color};white-space:pre;pointer-events:none;will-change:transform,opacity;transition:color ${HOLD * 1000}ms ease-out`;
      layer.appendChild(el);
      const dir = Math.random() < 0.5 ? -1 : 1;
      // Tip over the corner on the side it falls toward.
      el.style.transformOrigin = dir > 0 ? "100% 85%" : "0% 85%";
      el.style.transform = `translate3d(${x}px, ${top}px, 0)`;
      void el.offsetWidth;
      el.style.color = color;
      pieces.current.push({
        el,
        x,
        y: top,
        dir,
        // A small sideways drift and barely any lift: a letter slipping off a
        // ledge, not one thrown.
        vx: dir * (10 + Math.random() * 18),
        vy: -(8 + Math.random() * 14),
        w: 30 + Math.random() * 40,
        spin: 260 + Math.random() * 220,
        start: now + i * 34,
      });
      x += el.offsetWidth;
    });
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(tick);
  };

  const handle = (e: ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const caret = e.target.selectionStart ?? raw.length;
    let kept = "";
    let caretKept = 0;
    const rejected: string[] = [];
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      const ok = rule(ch, kept) && (!maxLength || kept.length < maxLength);
      if (ok) {
        kept += ch;
        if (i < caret) caretKept++;
      } else rejected.push(ch);
    }

    if (value === undefined) setInner(kept);
    if (kept !== current) onChange?.(kept);
    if (!rejected.length) return;

    caretRef.current = caretKept;
    onReject?.(rejected.join(""));
    setAnnounce(`${hintText}. Removed ${rejected.join("")}`);
    setShowHint(true);
    clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setShowHint(false), 1600);
    // A controlled parent that ignores onChange still needs the DOM reset.
    e.target.value = kept;

    if (reduce) return;
    const m = measureRef.current;
    if (!m) return;
    m.textContent = kept.slice(0, caretKept);
    const x = Math.min(s.padX + m.offsetWidth - e.target.scrollLeft, e.target.clientWidth - 6);
    // Line-height probe for vertical placement.
    m.textContent = kept.slice(0, caretKept) || "0";
    drop(rejected, x);
    if (shake) {
      fieldRef.current?.animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(-3px)" }, { transform: "translateX(2px)" }, { transform: "translateX(0)" }],
        { duration: 220, easing: "ease-out" },
      );
    }
  };

  return (
    <div className={cn("relative w-full max-w-xs", className)} style={{ "--c": color } as CSSProperties}>
      <div
        ref={fieldRef}
        className="relative bg-muted transition-shadow duration-200 focus-within:ring-2 focus-within:ring-neutral-400/60"
        style={{ height: s.height, borderRadius: radius }}
      >
        <label htmlFor={id} className="sr-only">
          {label}
        </label>
        <input
          ref={inputRef}
          id={id}
          value={current}
          onChange={handle}
          placeholder={placeholder}
          inputMode={preset.inputMode}
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`${id}-hint`}
          style={{ paddingInline: s.padX, fontSize: s.font, borderRadius: radius }}
          className="h-full w-full bg-transparent font-medium tabular-nums tracking-tight text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        {/* Hidden copy of the text up to the caret, to find where it sits. */}
        <span
          ref={measureRef}
          aria-hidden
          className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre font-medium tabular-nums tracking-tight"
          style={{ fontSize: s.font }}
        />
        {/* Pieces live outside the input's clip so they can fall past it. */}
        <div ref={layerRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-visible" />
      </div>
      <div id={`${id}-hint`} className="absolute inset-x-0 top-full h-0">
        <AnimatePresence>
          {showHint && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="px-1 pt-2 text-[13px] font-medium text-(--c)"
            >
              {hintText}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
