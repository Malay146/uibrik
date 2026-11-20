"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

// A skeleton that takes its shape from the real layout instead of a hand-drawn
// copy of it. While loading, the content renders invisibly (with placeholder
// data if the real data isn't there yet) and every line of text, image, icon
// and control in it is measured: text gets one bar per wrapped line, at the
// line's real width, and everything else gets its own box with its own corner
// radius. One shimmer sweeps across all of them at once, so a long list costs
// a single animation. When loading ends, the bars fade away top to bottom
// while the content wipes in behind them, rather than everything popping in
// at once.
//
// Shape it by hand where needed: `data-skeleton` turns an element into one
// box (an avatar, a chart), `data-skeleton-ignore` leaves it out.

export type SkeletonProps = {
  loading: boolean;
  children: ReactNode;
  /** One sweep across the content, in seconds. 0 turns the shimmer off. */
  shimmerDuration?: number;
  /** How long the reveal takes from top to bottom, in seconds. */
  reveal?: number;
  /** Corner radius for text bars, in px. Boxes keep their element's own radius. */
  radius?: number;
  className?: string;
  style?: CSSProperties;
};

type Box = { x: number; y: number; w: number; h: number; r: number };

const MEDIA = "img,svg,video,canvas,picture,input,textarea,select,button,[role=img],[data-skeleton]";

// Finds every block to draw, relative to the container.
function measure(root: HTMLElement, radius: number): Box[] {
  const base = root.getBoundingClientRect();
  const out: Box[] = [];
  const push = (r: DOMRect, rad: number) => {
    if (r.width < 1 || r.height < 1) return;
    out.push({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height, r: rad });
  };
  const radiusOf = (el: Element, r: DOMRect) => {
    const v = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    return Math.min(v, r.width / 2, r.height / 2);
  };

  const walk = (el: Element) => {
    if (el.hasAttribute("data-skeleton-ignore")) return;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return;
    if (el !== root && el.matches(MEDIA)) {
      const r = el.getBoundingClientRect();
      push(r, radiusOf(el, r));
      return;
    }
    const range = document.createRange();
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.textContent?.trim()) continue;
        // One bar per wrapped line, a little shorter than the line so the gaps read as line spacing.
        range.selectNodeContents(node);
        const size = parseFloat(style.fontSize) || 14;
        const bar = Math.round(size * 0.78);
        const lines: DOMRect[] = [];
        for (const r of range.getClientRects()) {
          const same = lines.find((l) => Math.abs(l.top + l.height / 2 - (r.top + r.height / 2)) < 2);
          if (same) {
            const left = Math.min(same.left, r.left);
            const right = Math.max(same.right, r.right);
            lines[lines.indexOf(same)] = new DOMRect(left, same.top, right - left, same.height);
          } else lines.push(r);
        }
        for (const l of lines) push(new DOMRect(l.left, l.top + (l.height - bar) / 2, l.width, bar), Math.min(radius, bar / 2));
      } else if (node.nodeType === Node.ELEMENT_NODE) walk(node as Element);
    }
  };
  walk(root);
  return out;
}

export function Skeleton({ loading, children, shimmerDuration = 2.2, reveal = 0.5, radius = 6, className, style }: SkeletonProps) {
  const id = useId().replace(/:/g, "");
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // "loading" → "revealing" → "idle". The overlay stays up through the reveal.
  const [phase, setPhase] = useState<"loading" | "revealing" | "idle">(loading ? "loading" : "idle");

  // Adjust state during render when `loading` flips, rather than in an effect.
  const [was, setWas] = useState(loading);
  if (was !== loading) {
    setWas(loading);
    setPhase(loading ? "loading" : reduced || !boxes.length ? "idle" : "revealing");
  }

  useLayoutEffect(() => {
    if (phase !== "loading") return;
    const el = content.current;
    if (!el) return;
    const read = () => {
      setBoxes(measure(el, radius));
      setSize({ w: el.offsetWidth, h: el.offsetHeight });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    // Fonts landing late change line widths.
    document.fonts?.ready.then(read).catch(() => {});
    return () => ro.disconnect();
  }, [phase, radius]);

  useEffect(() => {
    if (phase !== "revealing") return;
    const t = setTimeout(() => setPhase("idle"), (reveal + 0.35) * 1000);
    return () => clearTimeout(t);
  }, [phase, reveal]);

  const showOverlay = phase !== "idle" && boxes.length > 0;
  const hidden = phase === "loading";

  return (
    <div ref={root} aria-busy={loading || undefined} className="relative">
      <motion.div
        ref={content}
        className={className}
        inert={hidden}
        aria-hidden={hidden || undefined}
        initial={false}
        animate={
          hidden
            ? { opacity: 0, "--sk-wipe": "0%" }
            : phase === "revealing"
              ? { opacity: 1, "--sk-wipe": "130%" }
              : { opacity: 1, "--sk-wipe": "130%" }
        }
        transition={{ opacity: { duration: hidden ? 0 : 0.2 }, "--sk-wipe": { duration: hidden ? 0 : reveal, ease: [0.4, 0, 0.2, 1] } }}
        style={
          phase === "revealing"
            ? ({
                ...style,
                WebkitMaskImage: "linear-gradient(to bottom, #000 calc(var(--sk-wipe) - 30%), transparent var(--sk-wipe))",
                maskImage: "linear-gradient(to bottom, #000 calc(var(--sk-wipe) - 30%), transparent var(--sk-wipe))",
              } as CSSProperties)
            : style
        }
      >
        {children}
      </motion.div>

      {showOverlay && (
        <svg aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-visible [--sk-peak:0.24] [--sk-tone:#737373] dark:[--sk-peak:0.18] dark:[--sk-tone:#a3a3a3]" width={size.w} height={size.h}>
          <defs>
            <linearGradient id={`${id}-g`} x1="0" x2="1" y1="0" y2="0">
              {/* Tone and strength come from --sk-tone and --sk-peak: a colour's own
                  alpha is dropped by stop-color, so it can't carry the strength.
                  Eased stops keep the band free of visible edges. */}
              {[0, 0.25, 0.5, 0.75, 1].map((o) => (
                <stop key={o} offset={o} style={{ stopColor: "var(--sk-tone)", stopOpacity: `calc(var(--sk-peak) * ${[0, 0.3, 1, 0.3, 0][o * 4]})` }} />
              ))}
            </linearGradient>
            <clipPath id={`${id}-c`}>
              {boxes.map((b, i) => (
                <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.r} />
              ))}
            </clipPath>
          </defs>
          <g clipPath={`url(#${id}-c)`}>
            {boxes.map((b, i) => (
              <motion.rect
                key={i}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={b.r}
                className="fill-black/[0.08] dark:fill-white/[0.09]"
                initial={false}
                animate={{ opacity: phase === "revealing" ? 0 : 1 }}
                // Each block leaves when the wipe passes its top edge.
                transition={{ duration: 0.25, delay: phase === "revealing" ? (b.y / Math.max(size.h, 1)) * reveal : 0 }}
              />
            ))}
            {shimmerDuration > 0 && !reduced && phase === "loading" && (
              <rect
                x={0}
                y={0}
                width={Math.max(160, size.w * 0.45)}
                height={size.h}
                fill={`url(#${id}-g)`}
                style={
                  {
                    "--sk-from": `${-Math.max(160, size.w * 0.45)}px`,
                    "--sk-to": `${size.w}px`,
                    animation: `sk-sweep ${shimmerDuration}s linear infinite`,
                  } as CSSProperties
                }
              />
            )}
          </g>
          <style>{`@keyframes sk-sweep{from{transform:translateX(var(--sk-from))}to{transform:translateX(var(--sk-to))}}`}</style>
        </svg>
      )}
    </div>
  );
}
