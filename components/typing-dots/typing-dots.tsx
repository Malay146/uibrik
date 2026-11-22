"use client";

import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

// The bubble while typing: three dots with even padding around them.
const DOTS_W = 58;
const DOTS_H = 38;

export type TypingDotsProps = {
  /** Messages that arrive one after another, each typed out first. */
  messages?: string[];
  /** Seconds the dots show before each message lands. */
  typingDuration?: number;
  /** Seconds between one message landing and the next one starting to type. */
  gap?: number;
  /** Start over once every message has landed. */
  loop?: boolean;
  /** Seconds the finished thread stays before it starts over. */
  holdDuration?: number;
  /** Widest a bubble grows before its text wraps, in px. */
  maxWidth?: number;
  /** Corner radius of the bubbles in px. */
  radius?: number;
  className?: string;
};

export function TypingDots({
  messages = ["Hey! Just landed.", "Grabbing a coffee, then I'll head your way.", "Twenty minutes?"],
  typingDuration = 1.4,
  gap = 0.5,
  loop = true,
  holdDuration = 2.4,
  maxWidth = 260,
  radius = 20,
  className,
}: TypingDotsProps) {
  // How many bubbles are on screen, and whether the last one is still typing.
  const [count, setCount] = useState(1);
  const [typing, setTyping] = useState(true);
  const [cycle, setCycle] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!messages.length) return;
    let t: ReturnType<typeof setTimeout>;
    if (typing) {
      t = setTimeout(() => setTyping(false), typingDuration * 1000);
    } else if (count < messages.length) {
      t = setTimeout(() => {
        setCount((c) => c + 1);
        setTyping(true);
      }, gap * 1000);
    } else if (loop) {
      t = setTimeout(() => {
        setLeaving(true);
        t = setTimeout(() => {
          setLeaving(false);
          setCount(1);
          setTyping(true);
          setCycle((c) => c + 1);
        }, 350);
      }, holdDuration * 1000);
    }
    return () => clearTimeout(t);
  }, [typing, count, messages.length, typingDuration, gap, loop, holdDuration]);

  return (
    <motion.div
      role="log"
      aria-live="polite"
      className={cn("flex w-full flex-col items-start gap-1.5", className)}
      style={{ maxWidth: maxWidth + 40 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
    >
      {messages.slice(0, count).map((text, i) => (
        <Bubble key={`${cycle}-${i}`} text={text} typing={typing && i === count - 1} maxWidth={maxWidth} radius={radius} />
      ))}
    </motion.div>
  );
}

function Bubble({ text, typing, maxWidth, radius }: { text: string; typing: boolean; maxWidth: number; radius: number }) {
  const reduce = useReducedMotion();
  // The text is measured off-screen at its final wrap, so the bubble can grow
  // straight to it and the words never reflow while it does.
  const [ref, { width, height }] = useMeasure();
  const size = typing || !width ? { width: DOTS_W, height: DOTS_H } : { width, height };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.25, ease: EASE_OUT }}
      className="relative"
    >
      <span
        ref={ref}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 inline-block px-3.5 py-2 text-[15px] leading-snug tracking-tight"
        style={{ maxWidth, width: "max-content" }}
      >
        {text}
      </span>
      <motion.div
        initial={false}
        animate={size}
        transition={{ duration: reduce ? 0 : 0.35, ease: EASE_OUT }}
        className="relative overflow-hidden rounded-[var(--r)] rounded-bl-md bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100"
        style={{ ["--r" as string]: `${radius}px` }}
      >
        <AnimatePresence initial={false}>
          {typing ? (
            <motion.span
              key="dots"
              aria-label="Typing"
              className="absolute left-0 top-0 flex items-center justify-center gap-1"
              style={{ width: DOTS_W, height: DOTS_H }}
              exit={{ opacity: 0, filter: "blur(2px)" }}
              transition={{ duration: 0.15 }}
            >
              {[0, 1, 2].map((d) => (
                <Dot key={d} index={d} reduce={!!reduce} />
              ))}
            </motion.span>
          ) : (
            <motion.span
              key="text"
              className="absolute left-0 top-0 inline-block px-3.5 py-2 text-[15px] leading-snug tracking-tight"
              style={{ width: width || undefined }}
              initial={{ opacity: 0, filter: "blur(3px)", y: 2 }}
              animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
              transition={{ duration: reduce ? 0 : 0.3, ease: EASE_OUT, delay: reduce ? 0 : 0.08 }}
            >
              {text}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

// Started from an effect: inside AnimatePresence initial={false} an animate
// prop would jump straight to its last keyframe instead of looping.
function Dot({ index, reduce }: { index: number; reduce: boolean }) {
  const controls = useAnimationControls();
  useEffect(() => {
    if (reduce) return;
    // One dot at a time: each rises and brightens in its own slot, then rests while the others take their turn.
    controls.start({
      y: [0, -3.5, 0, 0],
      opacity: [0.35, 1, 0.35, 0.35],
      transition: { duration: 1.2, ease: "easeInOut", times: [0, 0.16, 0.32, 1], repeat: Infinity, delay: index * 0.2 },
    });
    return () => controls.stop();
  }, [controls, index, reduce]);
  return <motion.span animate={controls} style={{ opacity: reduce ? 0.7 : 0.35 }} className="size-[7px] rounded-full bg-neutral-400 dark:bg-neutral-500" />;
}
