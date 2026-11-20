"use client";

import { useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { cn } from "@/lib/utils";

// Tag input. What you type is drawn by a mirror under a transparent field, so
// when Enter or a comma finishes a tag, the typed word itself flies into the
// new chip (a shared layout animation from the mirror to the chip's label)
// while the chip's fill grows in around it. The field glides along to its new
// place, chips after a removed one close the gap, and the box eases to its
// new height when a row wraps, so nothing ever jumps. Pasting a list ("a, b,
// c" or one per line) adds them all at once.
//
// Backspace in an empty field first selects the last chip, a second press
// removes it; arrows walk the selection along the chips. A duplicate isn't
// added twice: the chip that already has it gives a small nudge instead.

export type TagInputProps = {
  /** Tags (controlled). Pair with `onChange`. */
  value?: readonly string[];
  /** Tags on mount (uncontrolled). */
  defaultValue?: readonly string[];
  onChange?: (tags: string[]) => void;
  placeholder?: string;
  /** Most tags allowed. Typing stops once it's full. */
  max?: number;
  /** Keys besides Enter that finish a tag. */
  delimiters?: readonly string[];
  /** Turns typed text into a tag, or rejects it with null. Defaults to trimming. */
  transform?: (text: string) => string | null;
  /** Match duplicates regardless of case. */
  ignoreCase?: boolean;
  /** Seconds chips and the field take to move. */
  duration?: number;
  /** Names the field for screen readers. */
  label?: string;
  disabled?: boolean;
  className?: string;
};

const PAD = 6; // the box's padding, px

export function TagInput({
  value,
  defaultValue = [],
  onChange,
  placeholder = "Add a tag",
  max = Infinity,
  delimiters = [","],
  transform = (t) => t.trim() || null,
  ignoreCase = true,
  duration = 0.35,
  label = "Tags",
  disabled = false,
  className,
}: TagInputProps) {
  const id = useId();
  const [inner, setInner] = useState<readonly string[]>(defaultValue);
  const tags = value ?? inner;
  const [text, setText] = useState("");
  // The chip Backspace or the arrows have picked out, or null while typing.
  const [picked, setPicked] = useState<number | null>(null);
  // A chip nudging because its tag was typed again, keyed so a repeat replays it.
  const [nudge, setNudge] = useState<{ i: number; n: number } | null>(null);
  const [announce, setAnnounce] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const flow = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  const spring = { type: "spring", duration, bounce: 0 } as const;
  const key = (t: string) => (ignoreCase ? t.toLowerCase() : t);
  const layoutKey = (t: string) => `${id}-${key(t)}`;

  // The box eases to the height of its rows.
  useLayoutEffect(() => {
    const el = flow.current;
    if (!el) return;
    const read = () => setHeight(el.offsetHeight + PAD * 2);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const commit = (next: string[]) => {
    if (value === undefined) setInner(next);
    onChange?.(next);
  };

  // Adds what it can from `pieces`, in order; returns whether the text was used.
  const add = (pieces: string[]) => {
    const next = [...tags];
    let dup: number | null = null;
    for (const raw of pieces) {
      if (next.length >= max) break;
      const t = transform(raw);
      if (!t) continue;
      const at = next.findIndex((x) => key(x) === key(t));
      if (at >= 0) {
        dup = at;
        continue;
      }
      next.push(t);
    }
    if (next.length > tags.length) {
      commit(next);
      setAnnounce(`Added ${next.slice(tags.length).join(", ")}`);
    }
    if (dup !== null) {
      const d = dup;
      setNudge((p) => ({ i: d, n: (p?.n ?? 0) + 1 }));
    }
    return next.length > tags.length || dup !== null;
  };

  const remove = (i: number) => {
    const t = tags[i];
    commit(tags.filter((_, k) => k !== i));
    setAnnounce(`Removed ${t}`);
    setPicked(null);
    input.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const caretAtStart = e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0;
    if (e.key === "Enter" || delimiters.includes(e.key)) {
      if (e.key !== "Enter" || text.trim()) e.preventDefault();
      if (text.trim() && add([text])) setText("");
      return;
    }
    if (e.key === "Backspace" && caretAtStart) {
      if (picked !== null) {
        e.preventDefault();
        remove(picked);
      } else if (!text && tags.length) {
        e.preventDefault();
        setPicked(tags.length - 1);
      }
      return;
    }
    if (e.key === "Delete" && picked !== null) {
      e.preventDefault();
      remove(picked);
      return;
    }
    if (e.key === "ArrowLeft" && caretAtStart && tags.length) {
      e.preventDefault();
      setPicked((p) => (p === null ? tags.length - 1 : Math.max(0, p - 1)));
      return;
    }
    if (e.key === "ArrowRight" && picked !== null) {
      e.preventDefault();
      setPicked((p) => (p === null || p >= tags.length - 1 ? null : p + 1));
      return;
    }
    if (e.key === "Escape" && picked !== null) {
      e.preventDefault();
      setPicked(null);
      return;
    }
    if (picked !== null) setPicked(null);
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    const split = new RegExp(`[\\n\\t${delimiters.map((d) => d.replace(/[\\\]^-]/g, "\\$&")).join("")}]`);
    if (!split.test(pasted)) return;
    e.preventDefault();
    add((text + pasted).split(split));
    setText("");
  };

  const full = tags.length >= max;
  const draft = text.trim();

  return (
    <MotionConfig reducedMotion="user" transition={spring}>
      <motion.div
        // A press anywhere on the box that isn't a chip puts the caret in the field.
        onPointerDown={(e) => {
          if (disabled || (e.target as Element).closest("button, input")) return;
          e.preventDefault();
          input.current?.focus();
        }}
        initial={false}
        animate={height === null ? undefined : { height }}
        className={cn(
          "relative w-full cursor-text overflow-hidden rounded-xl bg-background text-sm shadow-[inset_0_0_0_1px_var(--border)] transition-shadow duration-150",
          "has-[input:focus-visible]:shadow-[inset_0_0_0_1px_rgb(163_163_163),0_0_0_3px_rgb(163_163_163/0.18)]",
          disabled && "pointer-events-none opacity-50",
          className,
        )}
        style={{ padding: PAD }}
      >
        <LayoutGroup id={id}>
          <div ref={flow} className="flex flex-wrap items-center gap-1.5">
            <ul id={`${id}-tags`} aria-label={label} className="contents">
              <AnimatePresence initial={false} mode="popLayout">
                {tags.map((t, i) => (
                  <motion.li
                    key={key(t)}
                    layout="position"
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, scale: 0.8, filter: "blur(2px)", transition: { duration: 0.16, ease: "easeOut" } }}
                    className="relative flex"
                  >
                    <motion.span
                      key={nudge?.i === i ? nudge.n : 0}
                      initial={{ x: 0 }}
                      animate={nudge?.i === i ? { x: [0, -3, 3, -2, 0] } : { x: 0 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      onAnimationComplete={() => nudge?.i === i && setNudge(null)}
                      className="relative flex h-7 items-center gap-0.5 pl-2.5 pr-0.5 font-medium"
                    >
                      {/* The fill grows in around the label as it lands. */}
                      <motion.span
                        aria-hidden
                        initial={{ opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={cn(
                          "absolute inset-0 rounded-lg transition-colors duration-150",
                          picked === i ? "bg-foreground" : "bg-muted",
                        )}
                      />
                      <motion.span
                        layoutId={layoutKey(t)}
                        className={cn(
                          "relative max-w-[16ch] truncate transition-colors duration-150",
                          picked === i ? "text-background" : "text-foreground",
                        )}
                      >
                        {t}
                      </motion.span>
                      <motion.button
                        type="button"
                        tabIndex={-1}
                        aria-label={`Remove ${t}`}
                        disabled={disabled}
                        onClick={() => remove(i)}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={cn(
                          "relative grid size-6 cursor-pointer place-items-center rounded-md outline-none transition-colors duration-150",
                          picked === i
                            ? "text-background/70 hover:text-background"
                            : "text-muted-foreground hover:bg-background/70 hover:text-foreground dark:hover:bg-background/40",
                        )}
                      >
                        <svg aria-hidden width={10} height={10} viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                          <path d="M2 2l6 6M8 2l-6 6" />
                        </svg>
                      </motion.button>
                    </motion.span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>

            {/* The field. Its text is transparent; the mirror under it draws the
                same text and sizes the field, and carries the layout id the
                chip picks up when the text becomes a tag. */}
            <motion.div layout="position" className="relative grid min-w-[8ch] grow basis-[8ch]">
              <span aria-hidden className="pointer-events-none flex h-7 items-center overflow-hidden whitespace-pre px-1.5 [grid-area:1/1]">
                {draft ? (
                  <motion.span key={layoutKey(draft)} layoutId={layoutKey(draft)} className="font-medium text-foreground">
                    {text}
                  </motion.span>
                ) : (
                  // Only spaces so far: kept, so the mirror stays as wide as the field's text.
                  <span>{text}</span>
                )}
              </span>
              <input
                ref={input}
                value={text}
                disabled={disabled}
                readOnly={full}
                onChange={(e) => {
                  setText(e.target.value);
                  setPicked(null);
                }}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                onBlur={() => {
                  setPicked(null);
                  if (text.trim() && add([text])) setText("");
                }}
                placeholder={tags.length || full ? "" : placeholder}
                aria-label={label}
                aria-describedby={`${id}-tags`}
                className="h-7 w-full min-w-0 bg-transparent px-1.5 font-medium text-transparent caret-foreground outline-none [grid-area:1/1] placeholder:font-normal placeholder:text-muted-foreground"
              />
            </motion.div>
          </div>
        </LayoutGroup>
        <span role="status" aria-live="polite" className="sr-only">
          {announce}
        </span>
      </motion.div>
    </MotionConfig>
  );
}
