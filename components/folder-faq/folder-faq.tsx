"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "motion/react";
import { IconPlus } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// Folder FAQ. Questions are files in a drawer, seen from the front: each one's
// tab and the strip below it peek out above the folder in front. Opening one
// lifts it a little out of the stack and slides every folder in front of it
// down, so the answer is uncovered rather than unfolded.
//
// With `sheet`, the answer is printed on a page inside the folder: it rises a
// little as the folder opens and its foot stays tucked behind the folder in
// front, like paper pulled partway out of a file.
//
// Each folder is a tab and a body painted the same colour, with the outline
// drawn by drop-shadow filters so the two read as one silhouette, concave
// shoulders included.

const TAB_H = 28; // height of a tab, px

// Text sizes; the answer's line height also spaces the ruled lines.
const SIZES = {
  md: { tab: "text-[11px]", question: "text-[15px]", answer: "text-[15px]", line: 24, icon: 14, sheet: "px-3.5 pt-3" },
  lg: { tab: "text-xs", question: "text-lg", answer: "text-[17px]", line: 28, icon: 16, sheet: "px-5 pt-4" },
} as const;
const SHOULDER = 8; // radius of the curve where a tab meets its body, px
const FOLD = { duration: 0.45, ease: [0.32, 0.72, 0, 1] } as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const QUICK = { duration: 0.2, ease: EASE_OUT } as const;

export type FolderFaqItem = {
  question: string;
  answer: string;
  /** Text on the tab. Defaults to the folder's number. */
  label?: string;
};

export type FolderFaqProps = {
  items: readonly FolderFaqItem[];
  /** Folder open on mount, or -1 for none. */
  defaultOpen?: number;
  /** How much of each folder shows above the one in front of it, tab included, px. */
  peek?: number;
  /** Width of a tab, px. */
  tabWidth?: number;
  /** Where the tabs sit along the top edge. */
  tabLayout?: "cascade" | "alternate" | "left";
  /** How far the open folder rises out of the stack, px. */
  lift?: number;
  /** Corner radius of a folder, px. */
  radius?: number;
  /** Print the answer on a sheet of paper that rises out of the folder. */
  sheet?: boolean;
  /** Faint ruled lines on the sheet. */
  ruled?: boolean;
  /** Text size of tabs, questions and answers. */
  size?: keyof typeof SIZES;
  className?: string;
};

// 0 is the left edge, 1 the right.
const tabPosition = (i: number, layout: FolderFaqProps["tabLayout"]) =>
  layout === "left" ? 0 : layout === "alternate" ? i % 2 : (i % 3) / 2;

export function FolderFaq({
  items,
  defaultOpen = 0,
  peek = 64,
  tabWidth = 132,
  tabLayout = "cascade",
  lift = 6,
  radius = 16,
  sheet = true,
  ruled = true,
  size = "md",
  className,
}: FolderFaqProps) {
  const t = SIZES[size];
  const id = useId();
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion ? { duration: 0 } : FOLD;
  const [open, setOpen] = useState(defaultOpen);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const answers = useRef<(HTMLDivElement | null)[]>([]);
  const [heights, setHeights] = useState<number[]>([]);

  // Answers stay laid out while closed, so their height is always known and an
  // opening folder slides the others exactly as far as it needs.
  useEffect(() => {
    const els = answers.current.slice(0, items.length);
    const ro = new ResizeObserver(() => setHeights(els.map((el) => el?.offsetHeight ?? 0)));
    els.forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, [items.length]);

  const n = items.length;
  const header = Math.max(peek - TAB_H, 32);
  const step = header + TAB_H;
  // A closed body reaches under the next folder's tab and rounded corners, so no
  // gap opens beside the tab.
  const closed = step + radius;
  // How far a sheet's foot reaches past its text, hidden behind the folder in
  // front. The front folder has nothing to tuck behind.
  const tuck = (i: number) => (sheet && i < n - 1 ? TAB_H + Math.round(radius / 2) : 0);
  const answerH = open >= 0 ? (heights[open] ?? 0) : 0;
  // How far the folders in front slide down: enough to uncover the text. A
  // sheet's tucked foot and the lift are already out of the way.
  const shift = open < 0 ? 0 : sheet ? Math.max(answerH - tuck(open) - lift, 0) : answerH;
  const top = (i: number) => lift + i * step + (open >= 0 && i > open ? shift : 0) - (i === open ? lift : 0);
  const height = (i: number) => {
    // The front folder has nothing in front to tuck under, so it ends below its question.
    if (i !== open) return i === n - 1 ? header + 16 : closed;
    if (i === n - 1) return sheet ? header + answerH : header + 16 + shift + lift;
    return closed + shift + lift;
  };
  const total = n ? top(n - 1) + TAB_H + height(n - 1) : 0;
  const tabRadius = Math.min(10, radius);

  const toggle = (i: number) => setOpen((o) => (o === i ? -1 : i));

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const to =
      e.key === "ArrowDown" ? (i + 1) % n
      : e.key === "ArrowUp" ? (i - 1 + n) % n
      : e.key === "Home" ? 0
      : e.key === "End" ? n - 1
      : -1;
    if (to < 0) return;
    e.preventDefault();
    buttons.current[to]?.focus();
  };

  return (
    <motion.div
      className={cn(
        "relative w-full",
        "[--folder:#f4f4f5] [--folder-deep:#e4e4e7] dark:[--folder:#1c1c1f] dark:[--folder-deep:#0f0f11]",
        "[--folder-edge:drop-shadow(0_0_0.5px_rgb(0_0_0/0.16))_drop-shadow(0_-1px_0_rgb(0_0_0/0.05))_drop-shadow(0_-6px_10px_rgb(0_0_0/0.04))]",
        "dark:[--folder-edge:drop-shadow(0_0_0.5px_rgb(255_255_255/0.1))_drop-shadow(0_-1px_0_rgb(255_255_255/0.07))_drop-shadow(0_-4px_10px_rgb(0_0_0/0.35))]",
        className,
      )}
      initial={false}
      animate={{ height: total }}
      transition={transition}
    >
      {items.map((item, i) => {
        const isOpen = i === open;
        const p = tabPosition(i, tabLayout);
        // Folders further back are a shade deeper, like a drawer receding.
        const depth = Math.min((n - 1 - i) * 14, 60);
        const fill = `color-mix(in oklab, var(--folder-deep) ${depth}%, var(--folder))`;
        const panel = `${id}-panel-${i}`;
        const trigger = `${id}-trigger-${i}`;

        return (
          <motion.div
            key={i}
            className="group absolute inset-x-0 top-0"
            style={{ zIndex: i, filter: "var(--folder-edge)" }}
            initial={false}
            animate={{ y: top(i) }}
            // A quick peek on hover, quicker than the fold so it feels like a response.
            whileHover={isOpen || reduceMotion ? undefined : { y: top(i) - 3, transition: QUICK }}
            transition={transition}
          >
            <div
              aria-hidden
              onClick={() => toggle(i)}
              className="absolute top-0 flex cursor-pointer items-center px-3.5"
              style={{
                height: TAB_H,
                width: tabWidth,
                left: `calc((100% - ${tabWidth}px) * ${p})`,
                borderRadius: `${tabRadius}px ${tabRadius}px 0 0`,
                background: fill,
              }}
            >
              <span
                className={cn(
                  "truncate font-mono font-medium uppercase tracking-wider transition-colors duration-300",
                  t.tab,
                  isOpen
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-400 group-hover:text-zinc-600 dark:text-zinc-500 dark:group-hover:text-zinc-300",
                )}
              >
                {item.label ?? String(i + 1).padStart(2, "0")}
              </span>
              {p > 0 && <Shoulder side="left" fill={fill} />}
              {p < 1 && <Shoulder side="right" fill={fill} />}
            </div>

            <motion.div
              className="overflow-hidden"
              style={{
                marginTop: TAB_H,
                background: fill,
                borderRadius: radius,
                borderTopLeftRadius: p === 0 ? 0 : radius,
                borderTopRightRadius: p === 1 ? 0 : radius,
              }}
              initial={false}
              animate={{ height: height(i) }}
              transition={transition}
            >
              <h3>
                <button
                  ref={(el) => {
                    buttons.current[i] = el;
                  }}
                  id={trigger}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panel}
                  onClick={() => toggle(i)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  className="flex w-full items-center gap-4 rounded-[inherit] px-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400 dark:focus-visible:ring-zinc-500"
                  style={{ height: header }}
                >
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate font-medium transition-colors duration-300",
                      t.question,
                      isOpen ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-600 dark:text-zinc-400",
                    )}
                  >
                    {item.question}
                  </span>
                  <motion.span
                    className="shrink-0 text-zinc-400 dark:text-zinc-500"
                    initial={false}
                    animate={{ rotate: isOpen ? 45 : 0 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.3, ease: EASE_OUT }}
                  >
                    <IconPlus size={t.icon} stroke={2.5} />
                  </motion.span>
                </button>
              </h3>
              <div
                ref={(el) => {
                  answers.current[i] = el;
                }}
                id={panel}
                role="region"
                aria-labelledby={trigger}
                inert={!isOpen}
                className={sheet ? cn("px-1.5", i === n - 1 && "pb-1.5") : "px-5 pb-3"}
              >
                {sheet ? (
                  <motion.div
                    className={cn(
                      "bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.05),0_-1px_3px_rgb(0_0_0/0.04)] dark:bg-zinc-950 dark:shadow-[0_0_0_1px_rgb(255_255_255/0.06),0_-1px_3px_rgb(0_0_0/0.4)]",
                      "[--rule:rgb(0_0_0/0.035)] dark:[--rule:rgb(255_255_255/0.045)]",
                      t.sheet,
                    )}
                    style={{
                      paddingBottom: 14 + tuck(i),
                      borderRadius: Math.max(radius - 6, 4),
                    }}
                    initial={false}
                    animate={isOpen ? { y: 0, opacity: 1 } : { y: 14, opacity: 0 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : isOpen
                          ? { duration: 0.45, ease: EASE_OUT, delay: 0.05 }
                          : { duration: 0.18, ease: "easeIn" }
                    }
                  >
                    <Answer
                      text={item.answer}
                      isOpen={isOpen}
                      reduceMotion={!!reduceMotion}
                      className={t.answer}
                      // One rule under each line, only where there's text.
                      style={{
                        lineHeight: `${t.line}px`,
                        backgroundImage: ruled
                          ? `repeating-linear-gradient(to bottom, transparent 0 ${t.line - 1}px, var(--rule) ${t.line - 1}px ${t.line}px)`
                          : undefined,
                      }}
                    />
                  </motion.div>
                ) : (
                  <Answer text={item.answer} isOpen={isOpen} reduceMotion={!!reduceMotion} className={cn("leading-relaxed", t.answer)} />
                )}
              </div>
            </motion.div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}

type AnswerProps = { text: string; isOpen: boolean; reduceMotion: boolean; className?: string; style?: CSSProperties };

function Answer({ text, isOpen, reduceMotion, className, style }: AnswerProps) {
  return (
    <motion.p
      className={cn("max-w-prose text-zinc-600 dark:text-zinc-400", className)}
      style={style}
      initial={false}
      animate={
        isOpen
          ? { opacity: 1, y: 0, filter: "blur(0px)" }
          : { opacity: 0, y: -4, filter: reduceMotion ? "blur(0px)" : "blur(4px)" }
      }
      // In after the folders have started to part; out quickly, before the
      // folder in front slides back over it.
      transition={
        reduceMotion
          ? { duration: 0 }
          : isOpen
            ? { duration: 0.35, ease: EASE_OUT, delay: 0.12 }
            : { duration: 0.15, ease: "easeIn" }
      }
    >
      {text}
    </motion.p>
  );
}

// The concave curve that joins a tab to the top edge of its body.
function Shoulder({ side, fill }: { side: "left" | "right"; fill: string }) {
  const corner = side === "left" ? "0 0" : "100% 0";
  const mask = `radial-gradient(circle at ${corner}, transparent ${SHOULDER - 0.5}px, #000 ${SHOULDER}px)`;
  return (
    <span
      className="absolute bottom-0"
      style={{
        [side === "left" ? "right" : "left"]: "100%",
        width: SHOULDER,
        height: SHOULDER,
        background: fill,
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    />
  );
}
