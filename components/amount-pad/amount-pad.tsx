"use client";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type AmountPadProps = {
  /** Controlled amount as typed, e.g. "1250.5". Empty string is nothing entered. */
  value?: string;
  /** Amount on mount when uncontrolled. */
  defaultValue?: string;
  /** Fires on every change with the typed string and its number. */
  onChange?: (value: string, amount: number) => void;
  /** Text before the number. */
  currency?: string;
  /** Digits allowed after the decimal point. 0 turns the point off. */
  decimals?: number;
  /** Largest amount. Going past it bounces the extra digit off and shows the limit. */
  max?: number;
  /** Font size of the number in px before it shrinks to fit. */
  size?: number;
  /** Focus the field on mount. */
  autoFocus?: boolean;
  /** Accessible name. */
  label?: string;
  className?: string;
};

// Digits drop in and land with a little give; removed ones fall away.
const LAND = { type: "spring", bounce: 0.38, visualDuration: 0.42 } as const;
const MOVE = { type: "spring", bounce: 0.12, visualDuration: 0.36 } as const;
const MAX_DIGITS = 12;

type Key = string; // "0"–"9", "." or "back"

/** The next typed string, "max" when the key would pass the limit, or null when it's refused. */
function next(
  raw: string,
  key: Key,
  decimals: number,
  max: number,
): string | "max" | null {
  if (key === "back") return raw.slice(0, -1);
  if (key === ".") {
    if (!decimals || raw.includes(".")) return null;
    return (raw || "0") + ".";
  }
  const base = raw === "0" ? "" : raw;
  const [int, frac] = base.split(".");
  if (frac !== undefined && frac.length >= decimals) return null;
  if (frac === undefined && int.length >= MAX_DIGITS) return null;
  const out = base + key;
  if (Number(out) > max) return "max";
  return out;
}

type Glyph = { key: string; ch: string; kind: "digit" | "sep" | "slot" };

// Digits keep their identity by position from the left, so typing only adds
// one at the end. Separators are keyed by their group, counted from the
// right, so a comma slides along as the number grows instead of popping.
// After a decimal point, faint slots show the digits still to come.
function glyphs(raw: string, decimals: number): Glyph[] {
  const [int, frac] = raw.split(".");
  const out: Glyph[] = [];
  for (let i = 0; i < int.length; i++) {
    out.push({ key: `d${i}`, ch: int[i], kind: "digit" });
    const left = int.length - i - 1;
    if (left > 0 && left % 3 === 0)
      out.push({ key: `g${left / 3}`, ch: ",", kind: "sep" });
  }
  if (frac !== undefined) {
    out.push({ key: "point", ch: ".", kind: "sep" });
    for (let i = 0; i < frac.length; i++)
      out.push({ key: `f${i}`, ch: frac[i], kind: "digit" });
    for (let i = frac.length; i < decimals; i++)
      out.push({ key: `s${i}`, ch: "0", kind: "slot" });
  }
  return out;
}

const format = (n: number, decimals: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });

export function AmountPad({
  value: valueProp,
  defaultValue = "",
  onChange,
  currency = "$",
  decimals = 2,
  max = 100000,
  size = 64,
  autoFocus,
  label = "Amount",
  className,
}: AmountPadProps) {
  const id = useId();
  const reduce = useReducedMotion();
  const [inner, setInner] = useState(defaultValue);
  const raw = valueProp ?? inner;
  const [limit, setLimit] = useState(false);
  // A refused digit shows up in red at the end, then bounces off.
  const [ghost, setGhost] = useState<{ n: number; ch: string } | null>(null);
  // Set while clearing, so digits fall one after another from the right.
  const [sweep, setSweep] = useState(false);

  const shakeX = useMotionValue(0);
  const scale = useMotionValue(1);
  const box = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);
  const ghostN = useRef(0);

  const live = useRef({ raw, decimals, max });
  useLayoutEffect(() => {
    live.current = { raw, decimals, max };
  });

  const later = (ms: number, fn: () => void) =>
    timers.current.push(window.setTimeout(fn, ms));

  const set = (v: string) => {
    if (valueProp === undefined) setInner(v);
    onChange?.(v, Number(v) || 0);
  };

  const refuse = (ch: string, overLimit: boolean) => {
    // A kick of velocity into a loose spring: one smooth, decaying wobble
    // instead of keyframes that reverse sharply at every point.
    if (!reduce)
      animate(shakeX, 0, {
        type: "spring",
        velocity: -260,
        stiffness: 900,
        damping: 20,
      });
    if (/^[0-9]$/.test(ch)) setGhost({ n: ++ghostN.current, ch });
    if (overLimit) {
      setLimit(true);
      later(1400, () => setLimit(false));
    }
  };

  const press = (key: Key) => {
    const { raw: r, decimals: d, max: m } = live.current;
    const out = next(r, key, d, m);
    if (out === null) return refuse(key, false);
    if (out === "max") return refuse(key, true);
    if (out !== r) {
      live.current.raw = out;
      set(out);
    }
  };

  const clear = () => {
    const n = live.current.raw.length;
    if (!n) return;
    setSweep(true);
    live.current.raw = "";
    set("");
    later(Math.min(240 + n * 35, 720), () => setSweep(false));
  };

  // Typing goes through a real input, so phones bring up their number pad,
  // paste works and screen readers see a text field. Every edit is caught
  // before it lands and replayed through the same rules as a key press.
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    const before = (e: InputEvent) => {
      e.preventDefault();
      const t = e.inputType;
      if (t === "deleteContentBackward") press("back");
      else if (t.startsWith("delete")) clear();
      else if (t.startsWith("insert")) {
        const text = (e.data ?? e.dataTransfer?.getData("text") ?? "").replace(
          /,/g,
          ".",
        );
        if (t === "insertFromPaste" || t === "insertReplacementText") {
          // A pasted amount replaces what's there, digit by digit.
          const clean = text.replace(/[^0-9.]/g, "");
          if (!clean) return;
          live.current.raw = "";
          for (const ch of clean) press(ch);
          if (!live.current.raw) set("");
          return;
        }
        for (const ch of text) if (/[0-9.]/.test(ch)) press(ch);
      }
    };
    el.addEventListener("beforeinput", before);
    return () => el.removeEventListener("beforeinput", before);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Shrink the number to fit its box. The line is measured at full size
  // (offsetWidth ignores the transform), so this never feeds back on itself.
  useLayoutEffect(() => {
    const fit = () => {
      const w = (box.current?.clientWidth ?? 0) - 8;
      const n = line.current?.offsetWidth ?? 0;
      const s = n > w && w > 0 ? w / n : 1;
      if (reduce) scale.set(s);
      else animate(scale, s, MOVE);
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (box.current) ro.observe(box.current);
    if (line.current) ro.observe(line.current);
    return () => ro.disconnect();
  }, [raw, reduce, scale]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const list = glyphs(raw, decimals);
  const amount = Number(raw) || 0;

  const enter = reduce
    ? { opacity: 0 }
    : { opacity: 0, y: "-0.42em", scale: 0.8, filter: "blur(5px)" };
  const shown = { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" };
  const leave = (i: number) =>
    reduce
      ? { opacity: 0, transition: { duration: 0.1 } }
      : {
          opacity: 0,
          y: "0.5em",
          scale: 0.8,
          filter: "blur(5px)",
          transition: {
            duration: 0.22,
            ease: [0.4, 0, 1, 1] as const,
            delay: sweep ? (list.length - i) * 0.035 : 0,
          },
        };

  return (
    <div
      className={cn(
        "flex w-full max-w-[420px] flex-col items-center",
        className,
      )}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div
        ref={box}
        onPointerDown={(e) => {
          // Keep focus in the field however the number is tapped.
          if (e.target !== field.current) {
            e.preventDefault();
            field.current?.focus();
          }
        }}
        className="group/field relative flex w-full cursor-text justify-center overflow-hidden rounded-[24px] px-1 py-3"
      >
        <input
          ref={field}
          id={id}
          value={
            raw
              ? `${currency}${format(amount, decimals)}${raw.endsWith(".") ? "." : ""}`
              : ""
          }
          onChange={() => {}}
          // The caret always sits at the end, so Backspace always has a digit to take.
          onSelect={(e) => {
            const el = e.currentTarget;
            const end = el.value.length;
            if (el.selectionStart !== end || el.selectionEnd !== end)
              el.setSelectionRange(end, end);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              clear();
            }
          }}
          inputMode={decimals ? "decimal" : "numeric"}
          autoComplete="off"
          autoFocus={autoFocus}
          aria-describedby={limit ? `${id}-limit` : undefined}
          className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 outline-none selection:bg-transparent"
        />

        <motion.div
          ref={line}
          aria-hidden
          style={{ x: shakeX, scale, fontSize: size }}
          className="pointer-events-none flex shrink-0 items-baseline font-semibold leading-[1.15] tracking-[-0.035em] whitespace-nowrap tabular-nums"
        >
          <motion.span
            layout="position"
            transition={MOVE}
            className={cn(
              // Same size and baseline as the digits so tops and bottoms line
              // up; a shade lighter keeps it secondary.
              "mr-[0.02em] transition-colors duration-200",
              raw ? "text-foreground/40" : "text-muted-foreground/30",
            )}
          >
            {currency}
          </motion.span>
          <AnimatePresence mode={sweep ? "sync" : "popLayout"} initial={false}>
            {list.length === 0 && !sweep && (
              <motion.span
                key="empty"
                layout="position"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{ duration: 0.2 }}
                className="text-muted-foreground/30"
              >
                0
              </motion.span>
            )}
            {list.map((g, i) => (
              <motion.span
                key={g.key}
                layout="position"
                initial={g.kind === "slot" ? { opacity: 0 } : enter}
                animate={shown}
                exit={
                  g.kind === "slot"
                    ? { opacity: 0, transition: { duration: 0.08 } }
                    : leave(i)
                }
                transition={{ ...LAND, layout: MOVE }}
                className={cn(
                  "inline-block",
                  g.kind === "slot"
                    ? "text-muted-foreground/25"
                    : "text-foreground",
                  g.kind === "sep" && "mx-[-0.03em]",
                )}
              >
                {g.ch}
              </motion.span>
            ))}
          </AnimatePresence>
          {/* The refused digit sits in a zero-width slot, so it never widens
              the line: no refit, no caret hop, nothing else moves. It plays
              one timeline (drop in, hold, fall off) and then unmounts. */}
          <span className="inline-block w-0 whitespace-nowrap">
            {ghost && (
              <motion.span
                key={ghost.n}
                initial={false}
                animate={
                  reduce
                    ? { opacity: [0, 1, 1, 0] }
                    : {
                        opacity: [0, 1, 1, 0],
                        y: ["-0.3em", "0em", "0em", "0.5em"],
                        scale: [0.85, 1, 1, 0.8],
                        rotate: [0, 0, 0, 10],
                      }
                }
                transition={{
                  duration: 0.6,
                  times: [0, 0.28, 0.6, 1],
                  ease: ["easeOut", "linear", "easeIn"],
                }}
                onAnimationComplete={() =>
                  setGhost((g) => (g?.n === ghost.n ? null : g))
                }
                className="inline-block origin-bottom text-[#EF4444] dark:text-[#F87171]"
              >
                {ghost.ch}
              </motion.span>
            )}
          </span>
          {/* Caret: rides after the last digit while the field has focus.
              Hidden while a refused digit sits on top of it. */}
          <motion.span
            layout="position"
            transition={MOVE}
            style={{ visibility: ghost ? "hidden" : undefined }}
            className={cn(
              "ml-[0.04em] h-[0.78em] w-[0.06em] self-center rounded-full bg-foreground/70 opacity-0",
              // CSS, not state: the field can take focus before React is listening.
              "group-has-[input:focus]/field:animate-[amount-caret_1.1s_steps(1)_infinite] group-has-[input:focus]/field:opacity-100",
            )}
          />
        </motion.div>
      </div>

      <style>{`@keyframes amount-caret{0%,55%{opacity:1}56%,100%{opacity:0}}`}</style>

      <div className="h-5" aria-live="polite">
        <AnimatePresence>
          {limit && (
            <motion.p
              id={`${id}-limit`}
              initial={{ opacity: 0, y: -4, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -4, filter: "blur(4px)" }}
              transition={{ duration: 0.2 }}
              className="text-[13px] font-medium text-[#EF4444] dark:text-[#F87171]"
            >
              Up to {currency}
              {format(max, decimals)}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
