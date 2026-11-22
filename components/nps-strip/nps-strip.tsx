"use client";

import { IconLoader2 } from "@tabler/icons-react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

// Eleven scores on one track. One pill glides between them and blends into the
// colour of its group on the way; a lighter one follows the pointer. The band
// underneath fills up to the score within its group, and below it the card
// grows into the follow-up for that group. Changing group swaps only the
// question line; the note and the button stay put, so nothing you typed moves.
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const GLIDE = { type: "spring", duration: 0.42, bounce: 0.12 } as const;
const HOVER = { type: "spring", duration: 0.28, bounce: 0 } as const;
const GROW = { type: "spring", duration: 0.5, bounce: 0 } as const;
const SCORES = Array.from({ length: 11 }, (_, i) => i);
const PAD = 4;

const group: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } },
  gone: { opacity: 0, filter: "blur(4px)", transition: { duration: 0.14 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 8, filter: "blur(4px)" },
  shown: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.36, ease: EASE_OUT } },
};
const still: Variants = { hidden: {}, shown: {}, gone: { opacity: 0 } };

export type NpsSegment = "detractor" | "passive" | "promoter";
export type NpsFeedback = { score: number; segment: NpsSegment; comment: string };

const SEGMENTS: { id: NpsSegment; from: number; to: number }[] = [
  { id: "detractor", from: 0, to: 6 },
  { id: "passive", from: 7, to: 8 },
  { id: "promoter", from: 9, to: 10 },
];
const segIndexOf = (s: number): number => (s <= 6 ? 0 : s <= 8 ? 1 : 2);

export type NpsStripProps = {
  /** Controlled score from 0 to 10, null for none. */
  value?: number | null;
  defaultValue?: number | null;
  onChange?: (score: number) => void;
  /** The question above the scores. */
  prompt?: string;
  /** Words under the two ends of the track. */
  lowLabel?: string;
  highLabel?: string;
  /** Name of each group: 0 to 6, 7 to 8, 9 to 10. */
  segmentLabels?: [string, string, string];
  /** Follow-up question for each group. */
  followUps?: [string, string, string];
  placeholder?: string;
  submitLabel?: string;
  thanksLabel?: string;
  /** Called with the score, its group and the note. Return a promise to hold the button in a sending state. */
  onSubmit?: (feedback: NpsFeedback) => void | Promise<unknown>;
  /** Colour of each group: detractors, passives, promoters. */
  colors?: [string, string, string];
  /** Width of the card in px; never wider than its container. */
  width?: number;
  className?: string;
};

export function NpsStrip({
  value: valueProp,
  defaultValue = null,
  onChange,
  prompt = "How likely are you to recommend us to a friend?",
  lowLabel = "Not likely",
  highLabel = "Very likely",
  segmentLabels = ["Detractor", "Passive", "Promoter"],
  followUps = ["What would have made it better?", "What would make it a 10?", "What do you love most?"],
  placeholder = "Tell us a little more",
  submitLabel = "Send",
  thanksLabel = "Thanks for the feedback",
  onSubmit,
  colors = ["#e5484d", "#e8890c", "#16a35a"],
  width = 460,
  className,
}: NpsStripProps) {
  const id = useId();
  const reduce = useReducedMotion();
  const [inner, setInner] = useState<number | null>(defaultValue);
  const score = valueProp === undefined ? inner : valueProp;
  const [hover, setHover] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const [trackMeasure, { width: trackW }] = useMeasure();
  const [bodyMeasure, { height: bodyH }] = useMeasure();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!trackW || ready) return;
    const f = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(f);
  }, [trackW, ready]);

  const colorOf = (s: number) => colors[segIndexOf(s)];
  const segIndex = score === null ? -1 : segIndexOf(score);
  const shownSeg = hover !== null ? segIndexOf(hover) : segIndex;
  const shownScore = hover ?? score;

  // Each score's slot on the track, so one pill can glide between them.
  const slot = Math.max(0, (trackW - PAD * 2) / SCORES.length);
  const xOf = (s: number) => PAD + s * slot;

  const pick = (s: number) => {
    if (valueProp === undefined) setInner(s);
    onChange?.(s);
    setDone(false);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    let next: number | null = null;
    if (delta) next = Math.min(10, Math.max(0, (score ?? (delta > 0 ? -1 : 11)) + delta));
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 10;
    if (next === null) return;
    e.preventDefault();
    pick(next);
    rowRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  };

  const finish = async () => {
    if (score === null) return;
    const result = onSubmit?.({ score, segment: SEGMENTS[segIndexOf(score)].id, comment: comment.trim() });
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

  // Until the track is measured the pills jump into place rather than slide in from the left.
  const t = (spring: object) => (reduce || !ready ? { duration: 0 } : spring);
  const tone = score === null ? undefined : colorOf(score);

  return (
    <div className={cn("flex w-full justify-center", className)} style={{ maxWidth: width }}>
      <div className="w-full overflow-hidden rounded-[26px] bg-(--np-card) text-sm text-foreground [--np-card:#f2f2f4] [--np-well:#ffffff] dark:[--np-card:#1c1c1e] dark:[--np-well:#2a2a2d]">
        <div className="px-4 pt-5 sm:px-5">
          <p id={`${id}-q`} className="px-1 font-medium">
            {prompt}
          </p>

          <div
            ref={(el) => {
              rowRef.current = el;
              trackMeasure(el);
            }}
            role="radiogroup"
            aria-labelledby={`${id}-q`}
            onKeyDown={onKey}
            onPointerLeave={() => setHover(null)}
            className="relative isolate mt-4 flex rounded-full bg-(--np-well)"
            style={{ padding: PAD }}
          >
            {/* The pointer's wash, one element gliding along the track. */}
            <motion.span
              aria-hidden
              initial={false}
              animate={{
                x: hover !== null ? xOf(hover) : score !== null ? xOf(score) : xOf(5),
                opacity: hover !== null && hover !== score && slot ? 0.14 : 0,
                backgroundColor: colorOf(hover ?? score ?? 5),
              }}
              transition={{ ...t(HOVER), opacity: { duration: reduce ? 0 : 0.15 }, backgroundColor: { duration: reduce ? 0 : 0.2 } }}
              className="absolute left-0 -z-10 rounded-full"
              style={{ top: PAD, bottom: PAD, width: slot }}
            />
            {/* The pick: one pill that glides and blends from one group's colour to the next. */}
            <motion.span
              aria-hidden
              initial={false}
              animate={{
                x: score !== null ? xOf(score) : xOf(5),
                opacity: score !== null && slot ? 1 : 0,
                scale: score !== null ? 1 : 0.6,
                backgroundColor: tone ?? colors[1],
              }}
              transition={{ ...t(GLIDE), opacity: { duration: reduce ? 0 : 0.18 }, backgroundColor: { duration: reduce ? 0 : 0.3, ease: EASE_OUT } }}
              className="absolute left-0 -z-10 rounded-full"
              style={{ top: PAD, bottom: PAD, width: slot }}
            />
            {SCORES.map((s) => {
              const on = score === s;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${s}, ${segmentLabels[segIndexOf(s)]}`}
                  tabIndex={(score ?? 0) === s ? 0 : -1}
                  onPointerEnter={(e) => e.pointerType === "mouse" && setHover(s)}
                  onClick={() => pick(s)}
                  className="relative flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-full text-[13px] font-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
                >
                  <motion.span
                    initial={false}
                    animate={{ y: on && !reduce ? [0, -2, 0] : 0 }}
                    transition={{ duration: 0.32, ease: EASE_OUT }}
                    className={cn(
                      "transition-colors duration-200",
                      on ? "text-white" : hover === s ? "text-foreground" : "text-foreground/55",
                    )}
                  >
                    {s}
                  </motion.span>
                </button>
              );
            })}
          </div>

          {/* The three groups as a band under the track, each filling up to the score within it. */}
          <div aria-hidden className="mt-2.5 flex gap-1" style={{ paddingInline: PAD }}>
            {SEGMENTS.map((g, i) => {
              const span = g.to - g.from + 1;
              const reach = shownSeg === i && shownScore !== null ? (shownScore - g.from + 1) / span : 0;
              return (
                <div key={g.id} className="relative h-1 overflow-hidden rounded-full" style={{ flex: span }}>
                  <div className="absolute inset-0 opacity-20" style={{ background: colors[i] }} />
                  <motion.div
                    initial={false}
                    animate={{ scaleX: reach, opacity: hover !== null && hover !== score ? 0.55 : 1 }}
                    transition={{ scaleX: t(GLIDE), opacity: { duration: reduce ? 0 : 0.15 } }}
                    className="absolute inset-0 origin-left rounded-full"
                    style={{ background: colors[i] }}
                  />
                </div>
              );
            })}
          </div>
          <div aria-hidden className="mt-1.5 flex justify-between px-1 text-xs text-muted-foreground">
            <span>{lowLabel}</span>
            <span>{highLabel}</span>
          </div>
        </div>

        <motion.div initial={false} animate={{ height: score === null ? 20 : bodyH }} transition={t(GROW)} className="overflow-hidden">
          <div ref={bodyMeasure}>
            <AnimatePresence mode="popLayout" initial={false}>
              {score !== null && !done && (
                <motion.div
                  key="ask"
                  variants={reduce ? still : group}
                  initial="hidden"
                  animate="shown"
                  exit="gone"
                  className="flex flex-col gap-3 px-4 pb-4 pt-5 sm:px-5 sm:pb-5"
                >
                  {/* Only this line changes with the group: the chip and question cross over in place. */}
                  <motion.div variants={item} className="relative h-6 overflow-hidden px-1">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.div
                        key={segIndex}
                        initial={{ opacity: 0, y: 12, filter: "blur(3px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0, y: -12, filter: "blur(3px)" }}
                        transition={{ duration: reduce ? 0 : 0.26, ease: EASE_OUT }}
                        className="flex items-center gap-2"
                      >
                        <span
                          className="flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-medium"
                          style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
                        >
                          {segmentLabels[segIndex]}
                        </span>
                        <span className="truncate font-medium text-muted-foreground">{followUps[segIndex]}</span>
                      </motion.div>
                    </AnimatePresence>
                  </motion.div>
                  <motion.textarea
                    variants={item}
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={placeholder}
                    aria-label={followUps[segIndex]}
                    className="w-full resize-none rounded-2xl bg-(--np-well) px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-neutral-400/50"
                  />
                  <motion.button
                    variants={item}
                    type="button"
                    onClick={finish}
                    disabled={sending}
                    whileTap={reduce ? undefined : { scale: 0.98 }}
                    className="h-10 w-full cursor-pointer rounded-full bg-foreground font-medium text-background outline-none hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-(--np-card)"
                  >
                    <span className="relative flex items-center justify-center overflow-hidden">
                      <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span
                          key={sending ? "sending" : "idle"}
                          initial={{ y: 14, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          exit={{ y: -14, opacity: 0 }}
                          transition={{ duration: reduce ? 0 : 0.2, ease: EASE_OUT }}
                          className="flex"
                        >
                          {sending ? <IconLoader2 size={17} className="animate-spin" aria-label="Sending" /> : submitLabel}
                        </motion.span>
                      </AnimatePresence>
                    </span>
                  </motion.button>
                </motion.div>
              )}
              {score !== null && done && (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, filter: "blur(4px)", y: 6 }}
                  animate={{ opacity: 1, filter: "blur(0px)", y: 0, transition: { duration: reduce ? 0 : 0.32, ease: EASE_OUT, delay: reduce ? 0 : 0.1 } }}
                  exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.12 } }}
                  className="flex items-center justify-center gap-2 px-5 pb-5 pt-4 font-medium"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden className="shrink-0">
                    <motion.circle
                      cx="10"
                      cy="10"
                      r="10"
                      fill={tone ?? "#22c55e"}
                      initial={reduce ? false : { scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", duration: 0.4, bounce: 0.2, delay: 0.12 }}
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
                      transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.28 }}
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
        {done ? thanksLabel : score !== null ? `${score}, ${segmentLabels[segIndex]}` : ""}
      </span>
    </div>
  );
}
