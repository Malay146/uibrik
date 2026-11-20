"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

// Letters falling at once, however much is pasted past the limit.
const MAX_PIECES = 24;
// Pixels per second squared: reads as a small real object dropping.
const G = 2400;
// Seconds a letter sits in place, turning red, before it falls.
const HOLD = 0.09;

const FONT = 15;
const LINE = 22;
const PAD = 14;

const cp = (s: string, utf16: number) => [...s.slice(0, utf16)].length;

type Piece = { el: HTMLSpanElement; x: number; y: number; dir: number; vx: number; vy: number; w: number; spin: number; start: number; hold: number };

export type SpillTextareaProps = {
  /** Characters allowed before letters start to fall. */
  limit?: number;
  /**
   * What happens to a letter typed past the limit. "fall": it drops out and
   * leaves its space empty. "copy": it stays, red, and a red copy drops.
   */
  overflow?: "fall" | "copy";
  value?: string;
  defaultValue?: string;
  /** Called with the text and whether it is over the limit. */
  onChange?: (value: string, over: boolean) => void;
  placeholder?: string;
  /** Accessible name for the field. */
  label?: string;
  /** Rows shown when empty. */
  minRows?: number;
  /** Rows it grows to before scrolling. */
  maxRows?: number;
  /** Share of the limit at which the ring turns to the warning colour. */
  warnAt?: number;
  /** Remaining count at which the ring shows a number. */
  countFrom?: number;
  warnColor?: string;
  /** Colour of over-limit letters. */
  color?: string;
  /** How hard letters fall. 1 is roughly Earth. */
  gravity?: number;
  /** Corner radius in px. */
  radius?: number;
  className?: string;
};

export function SpillTextarea({
  limit = 140,
  overflow = "fall",
  value,
  defaultValue = "",
  onChange,
  placeholder = "What's happening?",
  label = "Message",
  minRows = 3,
  maxRows = 8,
  warnAt = 0.8,
  countFrom = 20,
  warnColor = "#f59e0b",
  color = "#ef4444",
  gravity = 1,
  radius = 16,
  className,
}: SpillTextareaProps) {
  const [inner, setInner] = useState(defaultValue);
  const text = value ?? inner;
  const id = useId();
  const reduce = useReducedMotion();

  const areaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const prevLen = useRef<number | null>(null);
  const pieces = useRef<Piece[]>([]);
  const raf = useRef(0);
  const [height, setHeight] = useState(minRows * LINE + PAD * 2);

  const chars = [...text];
  const len = chars.length;
  const over = Math.max(0, len - limit);
  const head = chars.slice(0, limit).join("");
  const tail = chars.slice(limit);
  const falling = overflow === "fall";

  // Grow with the text, up to maxRows, measured from the mirror so the two
  // always wrap the same.
  useLayoutEffect(() => {
    const m = mirrorRef.current;
    if (!m) return;
    setHeight(Math.min(Math.max(m.scrollHeight, minRows * LINE + PAD * 2), maxRows * LINE + PAD * 2));
  }, [text, minRows, maxRows]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // Closed-form motion from elapsed time, so a dropped frame skips along the
  // path instead of changing it.
  const tick = (now: number) => {
    const g = G * gravity;
    for (const p of pieces.current) {
      const t = (now - p.start) / 1000;
      if (t < 0) continue;
      if (t < p.hold) {
        const k = t / p.hold;
        p.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.dir * 5 * k * k}deg)`;
        continue;
      }
      const f = t - p.hold;
      const lean = p.hold ? p.dir * 5 : 0;
      const x = p.x + p.vx * f;
      const y = p.y + p.vy * f + 0.5 * g * f * f;
      const r = lean + p.dir * (p.w * f + 0.5 * p.spin * f * f);
      const o = 1 - Math.min(1, Math.max(0, (f - 0.1) / 0.34)) ** 1.6;
      p.el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${r}deg)`;
      p.el.style.opacity = String(o);
      if (o <= 0) p.el.remove();
    }
    pieces.current = pieces.current.filter((p) => p.el.isConnected);
    if (pieces.current.length) raf.current = requestAnimationFrame(tick);
    else raf.current = 0;
  };

  // New letters past the limit: find each one's glyph in the mirror and drop
  // a twin of it from exactly there.
  useLayoutEffect(() => {
    const prev = prevLen.current;
    prevLen.current = len;
    // Nothing falls for text that was already there on mount.
    if (prev === null || len <= prev || len <= limit || reduce) return;
    const layer = layerRef.current;
    const mirror = mirrorRef.current;
    const area = areaRef.current;
    if (!layer || !mirror || !area) return;
    const style = getComputedStyle(mirror);
    const now = performance.now();
    const from = Math.max(prev, limit);
    for (let i = from, n = 0; i < len && n < MAX_PIECES; i++, n++) {
      const glyph = mirror.querySelector<HTMLElement>(`[data-i="${i - limit}"]`);
      if (!glyph) continue;
      const x = glyph.offsetLeft;
      const y = glyph.offsetTop - area.scrollTop;
      if (y < -LINE || y > height) continue;
      const el = document.createElement("span");
      el.textContent = glyph.textContent;
      const dir = Math.random() < 0.5 ? -1 : 1;
      // In "fall" the letter itself goes, so it appears in the text colour
      // and blushes red first. In "copy" the red letter stays and its twin
      // lets go straight away.
      el.style.cssText = `position:absolute;left:0;top:0;font:${style.font};letter-spacing:${style.letterSpacing};line-height:${LINE}px;white-space:pre;pointer-events:none;will-change:transform,opacity;transform:translate3d(${x}px,${y}px,0);transform-origin:${dir > 0 ? "100% 80%" : "0% 80%"};color:${falling ? style.color : color};transition:color ${HOLD * 1000}ms ease-out`;
      layer.appendChild(el);
      if (falling) {
        void el.offsetWidth;
        el.style.color = color;
      }
      pieces.current.push({
        el,
        x,
        y,
        dir,
        vx: dir * (10 + Math.random() * 18),
        vy: -(8 + Math.random() * 14),
        w: 30 + Math.random() * 40,
        spin: 260 + Math.random() * 220,
        start: now + n * 34,
        hold: falling ? HOLD : 0,
      });
    }
    if (!raf.current) raf.current = requestAnimationFrame(tick);
    // tick and height are read fresh enough from the closure; only a change
    // in length should drop letters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [len]);

  const ratio = Math.min(1, len / limit);
  const left = limit - len;
  const ringColor = over ? color : ratio >= warnAt ? warnColor : "currentColor";
  const R = 9;
  const C = 2 * Math.PI * R;
  const showCount = left <= countFrom;

  return (
    <div className={cn("relative w-full max-w-md", className)} style={{ "--c": color } as CSSProperties}>
      <div className="relative bg-muted focus-within:ring-2 focus-within:ring-neutral-400/60" style={{ borderRadius: radius }}>
        <div className="relative overflow-hidden" style={{ height, borderTopLeftRadius: radius, borderTopRightRadius: radius }}>
          {/* The textarea's own text is invisible; this copy draws it, so the
              part past the limit can be coloured or emptied. Same font,
              padding and wrapping, so the caret lines up. */}
          <div
            ref={mirrorRef}
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 whitespace-pre-wrap wrap-break-word font-normal tracking-tight text-foreground"
            style={{ padding: PAD, fontSize: FONT, lineHeight: `${LINE}px` }}
          >
            {head}
            {tail.map((ch, i) => (
              <span
                key={i}
                data-i={i}
                className="text-(--c)"
                // "fall" keeps the letter's space but not the letter: the gap
                // is where it fell from.
                style={falling && !reduce ? { visibility: "hidden" } : undefined}
              >
                {ch}
              </span>
            ))}
            {"​"}
          </div>
          <label htmlFor={id} className="sr-only">
            {label}
          </label>
          <textarea
            ref={areaRef}
            id={id}
            value={text}
            placeholder={placeholder}
            aria-describedby={`${id}-count`}
            aria-invalid={over > 0 || undefined}
            onChange={(e) => {
              const next = e.target.value;
              if (value === undefined) setInner(next);
              onChange?.(next, cp(next, next.length) > limit);
            }}
            onScroll={(e) => {
              if (mirrorRef.current) mirrorRef.current.style.transform = `translateY(${-e.currentTarget.scrollTop}px)`;
              if (layerRef.current) layerRef.current.replaceChildren();
              pieces.current = [];
            }}
            className="absolute inset-0 h-full w-full resize-none bg-transparent tracking-tight text-transparent caret-foreground outline-none [scrollbar-width:none] placeholder:text-muted-foreground/60 selection:bg-neutral-400/30 selection:text-transparent"
            style={{ padding: PAD, fontSize: FONT, lineHeight: `${LINE}px` }}
          />
        </div>
        <div className="flex h-11 items-center justify-end gap-2 px-3">
          <span
            id={`${id}-count`}
            aria-live="polite"
            className={cn("text-[13px] font-medium tabular-nums transition-colors duration-200", over ? "text-(--c)" : "text-muted-foreground")}
          >
            {showCount ? left : ""}
            <span className="sr-only">{showCount ? " characters left" : ""}</span>
          </span>
          <motion.svg
            aria-hidden
            width={24}
            height={24}
            viewBox="0 0 24 24"
            className="-rotate-90 text-foreground"
            animate={{ scale: showCount ? 1.1 : 1 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          >
            <circle cx={12} cy={12} r={R} fill="none" stroke="currentColor" strokeWidth={2.5} opacity={0.12} />
            <circle
              cx={12}
              cy={12}
              r={R}
              fill="none"
              stroke={ringColor}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - ratio)}
              className="transition-[stroke-dashoffset,stroke] duration-200 ease-out"
            />
          </motion.svg>
        </div>
        {/* Falling letters live outside the text's clip, so they can leave the field. */}
        <div ref={layerRef} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0 overflow-visible" />
      </div>
    </div>
  );
}
