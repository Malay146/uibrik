"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// Size comes from --text-effect-size (default 1.25rem, i.e. text-xl), so a
// preview can enlarge the effect without changing the installed default.
const SIZE = "text-[length:var(--text-effect-size,1.25rem)] leading-[1.2]";

const TEXT = `${SIZE} text-zinc-700 font-light dark:text-zinc-200`;

// Quartic ease-out: each gap starts closing with intent, then glides shut
// over a long, soft tail, so letters land instead of stopping.
const easeOut = (p: number) => 1 - (1 - p) ** 4;

// useLayoutEffect warns during server rendering; the effect only needs the DOM.
const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Order = "wave" | "reverse" | "random";

export type TrackingInProps = {
  /** One entry per line. Long lines still wrap; each wrapped row closes on its own. */
  lines?: string[];
  /**
   * Each change plays the effect again and 0 shows the resting text.
   * Leave it out to play once when the text scrolls 40% up the screen.
   */
  play?: number;
  /** Gap after every letter at the start, in em. */
  spacing?: number;
  /** Seconds for one gap to close. */
  duration?: number;
  /** Seconds between the first and last gap of a line starting to close. */
  stagger?: number;
  /** Seconds between one line starting and the next. */
  lineStagger?: number;
  /** Which gaps close first: left to right, right to left, or any order. */
  order?: Order;
  /** 0–1. How far each gap may drift from its place in a wave, for a less mechanical feel. */
  jitter?: number;
  align?: "left" | "center" | "right";
  className?: string;
};

type Row = { chars: HTMLElement[]; delays: number[] };

// Every letter starts with a wide gap after it, and the gaps close in a soft
// wave, line after line, so the text draws in and settles into its natural
// tracking. The gaps are simulated with transforms (each letter is shifted by
// the open gaps before it) instead of animating padding, so nothing reflows
// per frame and it stays smooth on slow devices.
export function TrackingIn({
  lines = ["Every letter", "finds its place", "and settles in."],
  play,
  spacing = 1.3,
  duration = 1.1,
  stagger = 0.6,
  lineStagger = 0.14,
  order = "wave",
  jitter = 0.25,
  align = "left",
  className,
}: TrackingInProps) {
  const root = useRef<HTMLDivElement>(null);
  // Bumped to stop every running loop at once.
  const generation = useRef(0);

  // Rows of one line as the browser drew them, each letter with its start delay.
  const measure = (line: HTMLElement, index: number): Row[] => {
    const rows: HTMLElement[][] = [];
    let top = NaN;
    line.querySelectorAll<HTMLElement>("[data-c]").forEach((c) => {
      const t = c.parentElement!.offsetTop;
      if (t !== top) {
        top = t;
        rows.push([]);
      }
      rows[rows.length - 1].push(c);
    });
    const n = rows.reduce((a, r) => a + r.length, 0);
    // Position 0–1 of each gap in the closing sequence.
    const pos = Array.from({ length: n }, (_, i) => (n > 1 ? i / (n - 1) : 0));
    if (order === "reverse") pos.reverse();
    if (order === "random") {
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pos[i], pos[j]] = [pos[j], pos[i]];
      }
    }
    const mix = order === "random" ? 0 : Math.min(1, Math.max(0, jitter));
    const offset = index * lineStagger * 1000;
    let k = 0;
    return rows.map((chars) => ({
      chars,
      delays: chars.map(() => offset + ((1 - mix) * pos[k++] + mix * Math.random()) * stagger * 1000),
    }));
  };

  // Places every letter of `rows` for time `t` (ms since its line started).
  const paint = (rows: Row[], t: number, gap: number, ms: number) => {
    const pull = align === "center" ? 0.5 : align === "right" ? 1 : 0;
    for (const { chars, delays } of rows) {
      const open = delays.map((d) => gap * (1 - easeOut(Math.min(1, Math.max(0, (t - d) / ms)))));
      const total = open.reduce((a, b) => a + b, 0);
      let before = 0;
      for (let i = 0; i < chars.length; i++) {
        const x = before - pull * total;
        chars[i].style.transform = x ? `translate3d(${x}px,0,0)` : "";
        before += open[i];
      }
    }
  };

  const reset = () => {
    generation.current++;
    root.current?.querySelectorAll<HTMLElement>("[data-c]").forEach((c) => (c.style.transform = ""));
  };

  // Puts the given lines in their spread state; returns a function that plays them.
  const prepare = (lineEls: HTMLElement[]) => {
    const gap = spacing * parseFloat(getComputedStyle(root.current!).fontSize);
    const ms = duration * 1000;
    const end = ms + (stagger + lineStagger * (lineEls.length - 1)) * 1000;
    const rows = lineEls.map(measure);
    rows.forEach((r) => paint(r, 0, gap, ms));
    return () => {
      const gen = generation.current;
      let start = -1;
      const tick = (now: number) => {
        if (gen !== generation.current) return;
        if (start < 0) start = now;
        const t = now - start;
        rows.forEach((r) => paint(r, t, gap, ms));
        if (t < end) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
  };

  const lineEls = () => Array.from(root.current?.querySelectorAll<HTMLElement>("[data-line]") ?? []);
  const key = lines.join("\n");

  // Controlled replay: every new `play` value runs all lines from the spread state.
  useIsoLayoutEffect(() => {
    if (!play || reducedMotion()) return;
    prepare(lineEls())();
    return reset;
  }, [play, key]);

  // Uncontrolled: the text waits spread out and plays once when its top
  // reaches 60% of the way down the viewport.
  useIsoLayoutEffect(() => {
    const el = root.current;
    if (play !== undefined || !el || reducedMotion()) return;
    const start = prepare(lineEls());
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        start();
      },
      { rootMargin: "0px 0px -40% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      reset();
    };
  }, [play === undefined, key]);

  return (
    <div ref={root} className={cn(TEXT, "overflow-x-clip", className)} style={{ textAlign: align }}>
      <span className="sr-only">{lines.join(" ")}</span>
      {lines.map((line, li) => (
        <span key={li} data-line aria-hidden className="block">
          {line.split(" ").map((w, wi, words) => (
            <span key={wi}>
              <span className="inline-block whitespace-nowrap">
                {Array.from(w).map((ch, ci) => (
                  <span key={ci} data-c className="inline-block">
                    {ch}
                  </span>
                ))}
              </span>
              {wi < words.length - 1 ? " " : null}
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}
