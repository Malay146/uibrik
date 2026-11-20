"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion, type Transition } from "motion/react";
import { IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// Avatar stack. A short row of overlapping avatars that fans out a little on
// hover. Open it and the row itself reflows into a list: the container grows
// into a card and every avatar springs from its place in the row to its place
// in the list, names easing in beside them. It is one tree in both states, so
// motion's layout animation carries each element across and nothing is
// swapped or cross-faded. Only positions are layout-animated: the card's
// surface tweens its real width, height and radius instead of being scaled,
// so text and shadows never stretch on the way.
//
// Opening springs with a little life; closing settles faster and without
// overshoot, so dismissing never feels slower than asking.
//
// The card is absolutely positioned over a placeholder the size of the row,
// so opening it never shifts the page around it.

const PAD = 8; // card padding, px; also how far the card sits out from the row
const GAP = 8; // between rows, px
const FAN = 5; // how much each overlap loosens on hover, px

export type Person = {
  id: string | number;
  name: string;
  /** Second line under the name. */
  role?: string;
  /** Photo. Without one, the initials show. */
  src?: string;
};

export type AvatarStackProps = {
  people: readonly Person[];
  /** Avatars shown in the row before the "+N". */
  max?: number;
  /** Avatar diameter, px. */
  size?: number;
  /** How far each avatar tucks under the one before it, px. */
  overlap?: number;
  /** What opens the list. */
  trigger?: "click" | "hover";
  className?: string;
};

const TINTS = [
  "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-100",
  "bg-neutral-300 text-neutral-800 dark:bg-neutral-600 dark:text-neutral-100",
  "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-200",
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

const EASE = [0.23, 1, 0.32, 1] as const;

export function AvatarStack({ people, max = 4, size = 40, overlap = 12, trigger = "click", className }: AvatarStackProps) {
  const reduceMotion = useReducedMotion();
  const uid = useId();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [cardSize, setCardSize] = useState<{ width: number; height: number } | null>(null);
  const [fanned, setFanned] = useState(false);

  const shown = Math.min(max, people.length);
  const extra = people.length - shown;
  const slots = shown + (extra > 0 ? 1 : 0);
  const width = slots * size - Math.max(0, slots - 1) * overlap;
  const tuck = fanned && !open && !reduceMotion ? overlap - FAN : overlap;
  const visible = open ? people : people.slice(0, shown);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (trigger === "click" && !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open, trigger]);

  // The open card's size in px, read before paint. Animating to "100%" instead would let motion
  // resolve the percentage after the row has already reflowed, so the surface would snap.
  // offsetWidth/Height ignore transforms, so rows still in flight don't skew it.
  useLayoutEffect(() => {
    const el = card.current;
    if (!open || !el) return;
    const measure = () => setCardSize({ width: el.offsetWidth, height: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const instant = { duration: 0 };
  const spring = (delay = 0): Transition =>
    reduceMotion
      ? instant
      : open
        ? { type: "spring", visualDuration: 0.42, bounce: 0.2, delay }
        : { type: "spring", visualDuration: 0.3, bounce: 0, delay };
  // Opening, avatars leave the row first to last; closing, they land last to first.
  const stagger = (i: number) => (open ? i * 0.022 : (visible.length - 1 - i) * 0.012);
  // The card's outline in real pixels, shared by the surface and the close button's anchor.
  const frame =
    open && cardSize ? { width: cardSize.width, height: cardSize.height } : { width: width + PAD * 2, height: size + PAD * 2 };
  const close = () => {
    setOpen(false);
    toggle.current?.focus();
  };

  const listId = `${uid}-list`;

  return (
    <div
      ref={root}
      className={cn("relative inline-block", className)}
      style={{ width, height: size }}
      onPointerEnter={() => (trigger === "hover" ? setOpen(true) : setFanned(true))}
      onPointerLeave={() => (trigger === "hover" ? setOpen(false) : setFanned(false))}
    >
      <LayoutGroup id={uid}>
        <div
          ref={card}
          className="absolute z-20"
          style={{ top: -PAD, left: -PAD, padding: PAD, minWidth: open ? 244 : undefined, borderRadius: open ? 24 : size / 2 + PAD }}
        >
          {/* The card surface: grows from a pill around the row to the full card, in real pixels. */}
          <motion.div
            aria-hidden
            initial={false}
            animate={{ ...frame, borderRadius: open ? 24 : size / 2 + PAD, opacity: open ? 1 : 0 }}
            transition={{
              default: spring(),
              opacity: reduceMotion ? instant : { duration: open ? 0.18 : 0.22, ease: EASE, delay: open ? 0 : 0.08 },
            }}
            className={cn(
              "absolute top-0 left-0 bg-white",
              "shadow-[0_0_0_1px_rgb(0_0_0/0.06),0_12px_32px_-12px_rgb(0_0_0/0.18)]",
              "dark:bg-neutral-900 dark:shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_12px_32px_-12px_rgb(0_0_0/0.7)]",
            )}
          />

          {/* Covers the row, and then the card, so the whole stack is one control that keeps focus. */}
          <button
            ref={toggle}
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={`${people.length} people`}
            onClick={trigger === "click" ? () => setOpen((o) => !o) : undefined}
            onFocus={trigger === "hover" ? () => setOpen(true) : undefined}
            onBlur={trigger === "hover" ? () => setOpen(false) : undefined}
            className="absolute inset-0 z-10 cursor-pointer rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
          />

          {/* Tracks the surface's size so the close button arrives with the card's corner.
              Leaving, popLayout pins it where it was, so it fades in place instead of
              sliding left with the shrinking card. */}
          <motion.div initial={false} animate={frame} transition={spring()} className="pointer-events-none absolute top-0 left-0 z-30">
            <AnimatePresence mode="popLayout" anchorX="left">
              {open && trigger === "click" && (
                <motion.button
                  type="button"
                  aria-label="Close"
                  onClick={close}
                  initial={{ opacity: 0, scale: 0.5, filter: "blur(0px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)", transition: reduceMotion ? instant : { type: "spring", visualDuration: 0.3, bounce: 0.3, delay: 0.14 } }}
                  // Leaves over about as long as the card takes to close, so the two settle together.
                  exit={{
                    opacity: 0,
                    scale: 0.7,
                    filter: "blur(2px)",
                    transition: reduceMotion ? instant : { duration: 0.26, ease: [0.4, 0, 0.2, 1], opacity: { duration: 0.2, delay: 0.04, ease: "easeOut" } },
                  }}
                  whileTap={reduceMotion ? undefined : { scale: 0.9 }}
                  className={cn(
                    "pointer-events-auto absolute -top-2 -right-2 grid size-6 cursor-pointer place-items-center rounded-full bg-white text-neutral-500 outline-none",
                    "shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_2px_6px_-1px_rgb(0_0_0/0.15)] transition-colors duration-150 hover:text-neutral-900",
                    "focus-visible:ring-2 focus-visible:ring-neutral-400",
                    "dark:bg-neutral-800 dark:text-neutral-400 dark:shadow-[0_0_0_1px_rgb(255_255_255/0.1),0_2px_6px_-1px_rgb(0_0_0/0.6)] dark:hover:text-neutral-50",
                  )}
                >
                  <IconX size={12} stroke={2.5} />
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>

          <ul
            id={listId}
            aria-hidden={!open || undefined}
            className={cn("relative flex", open ? "flex-col pr-3" : "flex-row items-center")}
            style={{ gap: open ? GAP : 0 }}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {visible.map((p, i) => {
                const late = i >= shown;
                // People past `max` live in the "+N" chip, so they leave from and return to it.
                const chip = { x: shown * (size - overlap), y: -i * (size + GAP), scale: 0.7 };
                return (
                  <motion.li
                    key={p.id}
                    layout="position"
                    initial={late ? { ...chip, opacity: 0 } : false}
                    animate={{ x: 0, y: 0, scale: 1, opacity: 1 }}
                    exit={
                      late
                        ? {
                            ...chip,
                            opacity: 0,
                            transition: reduceMotion
                              ? instant
                              : { type: "spring", visualDuration: 0.24, bounce: 0, opacity: { duration: 0.12, ease: EASE } },
                          }
                        : { opacity: 0, transition: reduceMotion ? instant : { duration: 0.1 } }
                    }
                    transition={{
                      layout: spring(stagger(i)),
                      default: spring(stagger(i)),
                      opacity: reduceMotion ? instant : { duration: 0.12, delay: stagger(i) },
                    }}
                    // relative: popLayout pins a leaving name at its offset from the list, but a row that
                    // is moving (transformed) becomes the box it is placed in. Without this, names in the
                    // rows flying back into the "+N" chip are offset twice and jump.
                    className="relative flex items-center gap-3"
                    style={{ height: size, marginLeft: open || i === 0 ? 0 : -tuck, zIndex: open ? undefined : shown - i }}
                  >
                    <span
                      style={{ width: size, height: size, fontSize: size * 0.34, borderRadius: size / 2 }}
                      className={cn(
                        "relative grid shrink-0 place-items-center overflow-hidden font-medium select-none",
                        "ring-2 ring-white dark:ring-neutral-900",
                        !p.src && TINTS[i % TINTS.length],
                      )}
                    >
                      {p.src ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.src} alt="" draggable={false} decoding="async" className="size-full object-cover" />
                      ) : (
                        initials(p.name)
                      )}
                    </span>
                    {/* Runs its entry on first mount too: the late rows mount already open. */}
                    <AnimatePresence mode="popLayout">
                      {open && (
                        <motion.span
                          // Held back until the rows have mostly landed, so names never cross in flight.
                          initial={{ opacity: 0, x: -6, filter: "blur(3px)" }}
                          animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                          exit={{ opacity: 0, filter: "blur(3px)", transition: reduceMotion ? instant : { duration: 0.06 } }}
                          transition={reduceMotion ? instant : { duration: 0.28, delay: 0.2 + i * 0.03, ease: EASE }}
                          className="flex min-w-0 flex-col"
                        >
                          <span className="truncate text-sm leading-tight font-medium text-neutral-900 dark:text-neutral-50">{p.name}</span>
                          {p.role && <span className="truncate text-xs leading-tight text-neutral-500 dark:text-neutral-400">{p.role}</span>}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.li>
                );
              })}
              {!open && extra > 0 && (
                <motion.li
                  key="more"
                  layout="position"
                  aria-hidden
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6, transition: reduceMotion ? instant : { duration: 0.12 } }}
                  transition={{ layout: spring(), default: spring(0.12) }}
                  style={{ width: size, height: size, marginLeft: -tuck, fontSize: size * 0.32, borderRadius: size / 2 }}
                  className="grid shrink-0 place-items-center bg-neutral-900 font-medium text-white tabular-nums ring-2 ring-white dark:bg-neutral-100 dark:text-neutral-900 dark:ring-neutral-900"
                >
                  +{extra}
                </motion.li>
              )}
            </AnimatePresence>
          </ul>
        </div>
      </LayoutGroup>
    </div>
  );
}
