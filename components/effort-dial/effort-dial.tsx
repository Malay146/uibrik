"use client";

import { IconLoader2 } from "@tabler/icons-react";
import {
  animate,
  AnimatePresence,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type Variants,
} from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

// A gauge for customer effort. The scale runs as one gradient from easiest to
// hardest: faint along the whole arc, solid from the start up to the knob. The
// knob follows the pointer exactly, ticks light as it passes, and on release it
// settles into the middle of the nearest answer, like a dial with detents.
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const SETTLE = { type: "spring", duration: 0.45, bounce: 0.12 } as const;
const GROW = { type: "spring", duration: 0.45, bounce: 0 } as const;
// Geometry in viewBox units: centre at the bottom middle, arc over the top.
const W = 260;
const H = 146;
const CX = W / 2;
const CY = 132;
const R = 100;
const STROKE = 12;
const TICKS = 41;

const group: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.045, delayChildren: 0.05 } },
  gone: { opacity: 0, filter: "blur(4px)", transition: { duration: 0.12 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 6, filter: "blur(3px)" },
  shown: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.32, ease: EASE_OUT } },
};
const still: Variants = { hidden: {}, shown: {}, gone: { opacity: 0 } };

// Angle in degrees: 180 at the left end of the arc, 0 at the right. Rounded so
// the server and the browser, whose trig can differ in the last digit, render
// the same attributes and hydrate cleanly.
const round = (n: number) => Math.round(n * 100) / 100;
const point = (deg: number, r = R) => {
  const t = (deg * Math.PI) / 180;
  return [round(CX + r * Math.cos(t)), round(CY - r * Math.sin(t))] as const;
};
const ARC = (() => {
  const [x1, y1] = point(180);
  const [x2, y2] = point(0);
  return `M${x1} ${y1} A${R} ${R} 0 0 1 ${x2} ${y2}`;
})();

const hex = (c: string) => {
  const h = c.replace("#", "");
  const f = h.length === 3 ? h.replace(/./g, "$&$&") : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) || 0);
};
// The colour at a point along the scale, 0 at the easiest end and 1 at the hardest.
const colorAt = (colors: string[], t: number) => {
  if (colors.length < 2) return colors[0] ?? "#888888";
  const x = Math.min(1, Math.max(0, t)) * (colors.length - 1);
  const i = Math.min(colors.length - 2, Math.floor(x));
  const a = hex(colors[i]);
  const b = hex(colors[i + 1]);
  const f = x - i;
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",")})`;
};

export type EffortFeedback = { score: number; label: string; comment: string };

export type EffortDialProps = {
  /** Controlled answer, 1 for the easiest, null for none. */
  value?: number | null;
  defaultValue?: number | null;
  onChange?: (score: number) => void;
  /** The question above the dial. */
  prompt?: string;
  /** One answer per stretch of the dial, easiest first. Three to seven. */
  labels?: string[];
  /** Gradient stops from easiest to hardest. */
  colors?: string[];
  /** Asked when the answer is one of the two hardest. Empty skips it. */
  hardPrompt?: string;
  submitLabel?: string;
  thanksLabel?: string;
  /** Called with the score (1 is easiest), its label and any note. Return a promise to hold the button in a sending state. */
  onSubmit?: (feedback: EffortFeedback) => void | Promise<unknown>;
  /** Width of the card in px; never wider than its container. */
  width?: number;
  className?: string;
};

export function EffortDial({
  value: valueProp,
  defaultValue = null,
  onChange,
  prompt = "How easy was it to get set up?",
  labels = ["Very easy", "Easy", "Okay", "Hard", "Very hard"],
  colors = ["#16a35a", "#84cc16", "#eab308", "#f97316", "#e5484d"],
  hardPrompt = "What got in the way?",
  submitLabel = "Send",
  thanksLabel = "Thanks, that helps",
  onSubmit,
  width = 360,
  className,
}: EffortDialProps) {
  const uid = useId().replace(/:/g, "");
  const reduce = useReducedMotion();
  const n = Math.max(1, labels.length);
  const span = 180 / n;
  const centreOf = (i: number) => 180 - (i + 0.5) * span;
  const indexOf = (d: number) => Math.min(n - 1, Math.max(0, Math.floor((180 - d) / span)));
  const toneOf = (i: number) => colorAt(colors, (i + 0.5) / n);

  const [inner, setInner] = useState<number | null>(defaultValue);
  const value = valueProp === undefined ? inner : valueProp;
  // With no answer the knob waits at the top and nothing is filled.
  const deg = useMotionValue(value ? centreOf(value - 1) : 90);
  const [live, setLive] = useState<number | null>(value ? value - 1 : null);
  const [lit, setLit] = useState(() => (value ? Math.round(((180 - centreOf(value - 1)) / 180) * (TICKS - 1)) : -1));
  const [held, setHeld] = useState(false);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const dragging = useRef(false);
  // Where the pointer last was, so a quick tap settles on the tapped answer, not wherever the glide had reached.
  const aim = useRef(90);
  const svgRef = useRef<SVGSVGElement>(null);
  const inView = useInView(svgRef, { once: true, amount: 0.4 });
  const [bodyMeasure, { height: bodyH }] = useMeasure();

  useEffect(() => {
    if (dragging.current) return;
    const target = value ? centreOf(value - 1) : 90;
    animate(deg, target, reduce ? { duration: 0 } : SETTLE);
    // centreOf only depends on the label count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, n, reduce]);

  const answered = value !== null || live !== null;

  // Only the tick count and the answer re-render; the arc and knob read the angle directly.
  useMotionValueEvent(deg, "change", (d) => {
    const ticks = answered ? Math.round(((180 - d) / 180) * (TICKS - 1)) : -1;
    if (ticks !== lit) setLit(ticks);
    if (!dragging.current) return;
    const i = indexOf(d);
    if (i !== live) {
      setLive(i);
      // A light tick under the thumb as the knob crosses into the next answer.
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(6);
    }
  });

  const choose = (i: number) => {
    setLive(i);
    if (valueProp === undefined) setInner(i + 1);
    onChange?.(i + 1);
    setDone(false);
    animate(deg, centreOf(i), reduce ? { duration: 0 } : SETTLE);
  };

  const angleAt = (clientX: number, clientY: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return deg.get();
    const x = ((clientX - r.left) / r.width) * W - CX;
    const y = CY - ((clientY - r.top) / r.height) * H;
    let a = (Math.atan2(y, x) * 180) / Math.PI;
    // Below the centre line, stick to whichever end is nearer.
    if (a < 0) a = a < -90 ? 180 : 0;
    return Math.min(179.5, Math.max(0.5, a));
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    setHeld(true);
    const a = angleAt(e.clientX, e.clientY);
    aim.current = a;
    setLive(indexOf(a));
    animate(deg, a, reduce ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT });
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    deg.stop();
    aim.current = angleAt(e.clientX, e.clientY);
    deg.set(aim.current);
  };
  const onUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    setHeld(false);
    choose(indexOf(aim.current));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = live ?? -1;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(n - 1, cur + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(0, cur === -1 ? 0 : cur - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next === null) return;
    e.preventDefault();
    choose(next);
  };

  const finish = async () => {
    if (live === null) return;
    const hard = hardPrompt && live >= n - 2;
    const result = onSubmit?.({ score: live + 1, label: labels[live], comment: hard ? comment.trim() : "" });
    if (result instanceof Promise) {
      setSending(true);
      try {
        await result;
      } catch {
        setSending(false);
        return;
      }
      setSending(false);
    }
    setDone(true);
  };

  const fill = useTransform(deg, (d) => Math.max(0.001, (180 - d) / 180));
  const knobX = useTransform(deg, (d) => point(d)[0]);
  const knobY = useTransform(deg, (d) => point(d)[1]);
  const knobTone = useTransform(deg, (d) => (answered ? colorAt(colors, (180 - d) / 180) : "#a1a1aa"));
  const tone = live === null ? undefined : toneOf(live);
  const word = live === null ? "Drag the dial" : labels[live];
  const hard = !!hardPrompt && live !== null && live >= n - 2;
  const spring = reduce ? { duration: 0 } : GROW;
  const drawn = reduce || inView;

  return (
    <div className={cn("flex w-full justify-center", className)} style={{ maxWidth: width }}>
      <div className="w-full overflow-hidden rounded-[26px] bg-(--ed-card) text-sm text-foreground [--ed-card:#f2f2f4] [--ed-track:#e3e3e7] dark:[--ed-card:#1c1c1e] dark:[--ed-track:#2c2c30]">
        <div className="flex flex-col items-center px-5 pt-5">
          <p className="text-center font-medium">{prompt}</p>

          <div
            role="slider"
            tabIndex={0}
            aria-label={prompt}
            aria-valuemin={1}
            aria-valuemax={n}
            aria-valuenow={live === null ? undefined : live + 1}
            aria-valuetext={live === null ? undefined : labels[live]}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onKeyDown={onKey}
            className="relative mt-4 w-full max-w-[300px] cursor-grab touch-none rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-4 focus-visible:ring-offset-(--ed-card) active:cursor-grabbing"
          >
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block w-full overflow-visible" aria-hidden>
              <defs>
                <linearGradient id={`${uid}-g`} gradientUnits="userSpaceOnUse" x1={CX - R} y1="0" x2={CX + R} y2="0">
                  {colors.map((c, i) => (
                    <stop key={i} offset={colors.length > 1 ? i / (colors.length - 1) : 0} stopColor={c} />
                  ))}
                </linearGradient>
              </defs>

              {/* Ticks outside the arc: long ones mark where each answer starts, and they light as the knob passes. */}
              {Array.from({ length: TICKS }, (_, i) => {
                const d = 180 - (i / (TICKS - 1)) * 180;
                const isMajor = Number.isInteger((i * n) / (TICKS - 1));
                const [x1, y1] = point(d, R + STROKE / 2 + 6);
                const [x2, y2] = point(d, R + STROKE / 2 + (isMajor ? 14 : 10));
                const on = i <= lit;
                return (
                  <g key={i}>
                    {/* A neutral tick, and over it the coloured one that fades in as the knob passes. */}
                    <motion.line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="currentColor"
                      strokeWidth={isMajor ? 2 : 1.4}
                      strokeLinecap="round"
                      initial={false}
                      animate={{ opacity: drawn && !on ? (isMajor ? 0.28 : 0.14) : 0 }}
                      transition={{ duration: reduce ? 0 : 0.25, delay: drawn && lit < 0 && !reduce ? 0.25 + i * 0.008 : 0 }}
                    />
                    <motion.line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={colorAt(colors, i / (TICKS - 1))}
                      strokeWidth={isMajor ? 2 : 1.4}
                      strokeLinecap="round"
                      initial={false}
                      animate={{ opacity: drawn && on ? 1 : 0 }}
                      transition={{ duration: reduce ? 0 : 0.12 }}
                    />
                  </g>
                );
              })}

              {/* The track, then the whole scale faintly over it, then the filled part. */}
              <motion.path
                d={ARC}
                stroke="var(--ed-track)"
                strokeWidth={STROKE}
                strokeLinecap="round"
                fill="none"
                initial={false}
                animate={{ pathLength: drawn ? 1 : 0 }}
                transition={{ duration: reduce ? 0 : 0.7, ease: EASE_OUT }}
              />
              <motion.path
                d={ARC}
                stroke={`url(#${uid}-g)`}
                strokeOpacity={0.22}
                strokeWidth={STROKE}
                strokeLinecap="round"
                fill="none"
                initial={false}
                animate={{ pathLength: drawn ? 1 : 0 }}
                transition={{ duration: reduce ? 0 : 0.7, ease: EASE_OUT }}
              />
              <motion.path
                d={ARC}
                stroke={`url(#${uid}-g)`}
                strokeWidth={STROKE}
                strokeLinecap="round"
                fill="none"
                style={{ pathLength: fill }}
                initial={false}
                animate={{ opacity: answered ? 1 : 0 }}
                transition={{ duration: reduce ? 0 : 0.2 }}
              />

              {/* Notches in the card colour split the arc into answers. */}
              {Array.from({ length: n - 1 }, (_, i) => {
                const d = 180 - (i + 1) * span;
                const [x1, y1] = point(d, R - STROKE / 2 - 1);
                const [x2, y2] = point(d, R + STROKE / 2 + 1);
                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ed-card)" strokeWidth={2.5} />;
              })}

              {/* A small number at the middle of each answer, inside the arc; the picked one takes its colour. */}
              {labels.map((_, i) => {
                const [x, y] = point(centreOf(i), R - STROKE / 2 - 13);
                const on = live === i;
                return (
                  <g key={i} className="text-[9px] font-medium tabular-nums">
                    <motion.text
                      x={x}
                      y={y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="currentColor"
                      initial={false}
                      animate={{ opacity: drawn && !on ? 0.32 : 0 }}
                      transition={{ duration: reduce ? 0 : 0.2 }}
                    >
                      {i + 1}
                    </motion.text>
                    <motion.text
                      x={x}
                      y={y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={toneOf(i)}
                      initial={false}
                      animate={{ opacity: drawn && on ? 1 : 0 }}
                      transition={{ duration: reduce ? 0 : 0.2 }}
                    >
                      {i + 1}
                    </motion.text>
                  </g>
                );
              })}

              <motion.g style={{ x: knobX, y: knobY }}>
                <motion.g initial={false} animate={{ scale: held ? 1.14 : drawn ? 1 : 0 }} transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.35, bounce: 0.3 }}>
                  <circle r={15} className="fill-(--ed-card)" />
                  <circle r={11} className="fill-white dark:fill-neutral-100" />
                  <motion.circle r={11} fill="none" strokeWidth={1.5} style={{ stroke: knobTone }} initial={false} animate={{ opacity: answered ? 0.35 : 0 }} />
                  <motion.circle r={4.5} style={{ fill: knobTone }} />
                </motion.g>
              </motion.g>
            </svg>

            {/* The answer sits inside the arc. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
              <div className="relative h-8 w-full overflow-hidden text-center text-[22px] font-medium tracking-[-0.02em]">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={word}
                    initial={{ y: 18, opacity: 0, filter: "blur(3px)" }}
                    animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                    exit={{ y: -18, opacity: 0, filter: "blur(3px)" }}
                    transition={{ duration: reduce ? 0 : 0.22, ease: EASE_OUT }}
                    className={cn("block whitespace-nowrap", live === null && "text-lg text-muted-foreground")}
                  >
                    {word}
                  </motion.span>
                </AnimatePresence>
              </div>
              <motion.span
                initial={false}
                animate={{ backgroundColor: tone ? `color-mix(in srgb, ${tone} 15%, transparent)` : "rgba(127,127,127,0.1)", color: tone ?? "rgb(127,127,127)" }}
                transition={{ duration: reduce ? 0 : 0.2 }}
                className="mt-1 flex h-6 items-center rounded-full px-2.5 text-xs font-medium tabular-nums"
              >
                {live === null ? `1 to ${n}` : `${live + 1} of ${n}`}
              </motion.span>
            </div>
          </div>
          <div aria-hidden className="mt-2 flex w-full max-w-[316px] justify-between text-xs text-muted-foreground">
            <span>{labels[0]}</span>
            <span>{labels[n - 1]}</span>
          </div>
        </div>

        <motion.div initial={false} animate={{ height: answered ? bodyH : 20 }} transition={spring} className="overflow-hidden">
          <div ref={bodyMeasure}>
            <AnimatePresence mode="popLayout" initial={false}>
              {answered && !done && (
                <motion.div
                  key={hard ? "hard" : "easy"}
                  variants={reduce ? still : group}
                  initial="hidden"
                  animate="shown"
                  exit="gone"
                  className="flex flex-col gap-3 px-5 pb-5 pt-4"
                >
                  {hard && (
                    <motion.textarea
                      variants={item}
                      rows={2}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder={hardPrompt}
                      aria-label={hardPrompt}
                      className="w-full resize-none rounded-2xl bg-white px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-neutral-400/50 dark:bg-white/[0.06]"
                    />
                  )}
                  <motion.button
                    variants={item}
                    type="button"
                    onClick={finish}
                    disabled={sending || live === null}
                    className="h-10 w-full cursor-pointer rounded-full bg-foreground font-medium text-background outline-none hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-(--ed-card)"
                  >
                    <span className="flex items-center justify-center">
                      {sending ? <IconLoader2 size={17} className="animate-spin" aria-label="Sending" /> : submitLabel}
                    </span>
                  </motion.button>
                </motion.div>
              )}
              {answered && done && (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, filter: "blur(4px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)", transition: { duration: reduce ? 0 : 0.3, ease: EASE_OUT, delay: reduce ? 0 : 0.08 } }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  className="flex items-center justify-center gap-2 px-5 pb-5 pt-4 font-medium"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="shrink-0">
                    <motion.circle
                      cx="10"
                      cy="10"
                      r="10"
                      fill="#22c55e"
                      initial={reduce ? false : { scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", duration: 0.4, bounce: 0.2, delay: 0.1 }}
                      style={{ transformOrigin: "center" }}
                    />
                    <motion.path
                      d="M6 10.4l2.7 2.7L14.2 7.6"
                      fill="none"
                      stroke="white"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.26 }}
                    />
                  </svg>
                  {thanksLabel}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {done ? thanksLabel : ""}
      </span>
    </div>
  );
}
