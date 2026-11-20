"use client";

import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

// `play` counts presses of a card's Change button. 0 means the card has not
// been pressed yet, so every effect renders its resting state without
// animating on page load.
export type EffectProps = { play: number };

// Size comes from --text-effect-size (default 1.25rem, i.e. text-xl), so a
// preview can enlarge every effect without changing the installed default.
const SIZE = "text-[length:var(--text-effect-size,1.25rem)] leading-[1.4]";

const TEXT = `${SIZE} text-zinc-700 font-medium dark:text-zinc-200`;

/** 0.9 × the effect size (text-lg at the default). */
const SIZE_SM = "text-[length:calc(var(--text-effect-size,1.25rem)*0.9)] leading-[1.556]";

// 05 — Typing with a human hand: keystrokes arrive at uneven intervals,
// spaces earn a short pause, and one typo is noticed and backspaced.
type Keystroke = { type: "add"; ch: string } | { type: "del" } | { type: "wait"; ms: number };

const TYPE_FINAL = "Typing with a human hand";
const TYPE_SCRIPT: Keystroke[] = [
  ...Array.from("Typing with a humna").map((ch) => ({ type: "add", ch }) as Keystroke),
  { type: "wait", ms: 380 },
  ...Array.from("na").map(() => ({ type: "del" }) as Keystroke),
  ...Array.from("an hand").map((ch) => ({ type: "add", ch }) as Keystroke),
];

// The scripted typo belongs to the default sentence; other text is typed straight.
const scriptFor = (text: string): Keystroke[] =>
  text === TYPE_FINAL ? TYPE_SCRIPT : Array.from(text).map((ch) => ({ type: "add", ch }) as Keystroke);

export function Typewriter({
  play,
  text = TYPE_FINAL,
  keyDelay = 35,
  keyJitter = 70,
  spacePause = 90,
}: EffectProps & {
  text?: string;
  /** Shortest gap between keystrokes, ms. */
  keyDelay?: number;
  /** Random extra per keystroke, up to this many ms. */
  keyJitter?: number;
  /** Extra pause after a space, ms. */
  spacePause?: number;
}) {
  const [typed, setTyped] = useState(text);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (!play) return;
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const script = scriptFor(text);
    const next = () => {
      const key = script[i++];
      if (!key) return setTyping(false);
      let wait = keyDelay + Math.random() * keyJitter;
      if (key.type === "add") {
        setTyped((t) => t + key.ch);
        if (key.ch === " ") wait += spacePause;
      } else if (key.type === "del") {
        setTyped((t) => t.slice(0, -1));
        wait = 60;
      } else {
        wait = key.ms;
      }
      timer = setTimeout(next, wait);
    };
    timer = setTimeout(() => {
      setTyped("");
      setTyping(true);
      timer = setTimeout(next, 150);
    }, 0);
    return () => clearTimeout(timer);
    // tuning changes apply from the next play
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);

  return (
    <p aria-label={text} className={cn(TEXT, SIZE_SM, "font-mono whitespace-pre")}>
      {typed}
      <motion.span
        aria-hidden
        className="ml-px inline-block h-[1.1em] w-[2px] translate-y-[0.15em] bg-current"
        animate={{ opacity: typing ? 1 : 0 }}
        transition={{ duration: 0.2 }}
      />
    </p>
  );
}
