"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import useMeasure from "react-use-measure";
import {
  IconBug,
  IconCalendarEvent,
  IconChartPie,
  IconFileInvoice,
  IconGitPullRequest,
  IconLayoutBoard,
  IconListCheck,
  IconMail,
  IconPalette,
  IconReceipt,
  IconRocket,
  IconTypography,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// Filter grid. Tabs over a grid of tiles, where a tile can belong to several
// tabs. Switching tabs slides the highlight across; tiles in both tabs glide
// to their new places, tiles that leave blur and shrink away, and tiles that
// join grow in one after another. The grid's height eases to fit, so whatever
// sits below it moves smoothly too.

export type FilterTab = { id: string; label: string };

export type FilterItem = {
  id: string;
  title: string;
  description?: string;
  /** Ids of the tabs this tile shows under. */
  tags: string[];
  icon?: ReactNode;
};

export type FilterGridProps = {
  tabs?: FilterTab[];
  items?: FilterItem[];
  /** Show how many tiles each tab holds. */
  counts?: boolean;
  /** Narrowest a column gets before the grid drops one, px. */
  minColumnWidth?: number;
  /** Space between tiles, px. */
  gap?: number;
  /** Corner radius of a tile, px. */
  radius?: number;
  /** Seconds a move takes. */
  duration?: number;
  /** Springiness of a move, 0 to 0.5. */
  bounce?: number;
  /** Delay between tiles growing in, ms. */
  stagger?: number;
  /** Controlled tab id. Pair with `onChange`. */
  value?: string;
  /** Tab selected to begin with. Defaults to the first. */
  defaultValue?: string;
  onChange?: (tab: string) => void;
  /** Makes tiles buttons. */
  onSelect?: (item: FilterItem) => void;
  /** Names the tabs for screen readers. */
  label?: string;
  className?: string;
};

const ICON = { size: 18, stroke: 1.75 };

export const SAMPLE_TABS: FilterTab[] = [
  { id: "popular", label: "Popular" },
  { id: "new", label: "New" },
  { id: "free", label: "Free" },
];

export const SAMPLE_ITEMS: FilterItem[] = [
  { id: "moodboard", title: "Moodboard", description: "References and colours", tags: ["popular", "free"], icon: <IconPalette {...ICON} /> },
  { id: "launch", title: "Launch plan", description: "Owners and dates", tags: ["popular", "new"], icon: <IconRocket {...ICON} /> },
  { id: "bugs", title: "Bug tracker", description: "Triage and assign", tags: ["popular"], icon: <IconBug {...ICON} /> },
  { id: "sprint", title: "Sprint planner", description: "Two weeks of work", tags: ["popular", "free"], icon: <IconListCheck {...ICON} /> },
  { id: "content", title: "Content calendar", description: "Posts by week", tags: ["new", "free"], icon: <IconCalendarEvent {...ICON} /> },
  { id: "budget", title: "Budget", description: "Spend against targets", tags: ["popular"], icon: <IconChartPie {...ICON} /> },
  { id: "wireframes", title: "Wireframe kit", description: "Quick layouts", tags: ["new"], icon: <IconLayoutBoard {...ICON} /> },
  { id: "review", title: "Code review", description: "Pull request checklist", tags: ["new", "free"], icon: <IconGitPullRequest {...ICON} /> },
  { id: "invoice", title: "Invoice", description: "Bill a client", tags: ["popular", "free"], icon: <IconFileInvoice {...ICON} /> },
  { id: "newsletter", title: "Newsletter", description: "A monthly email", tags: ["new"], icon: <IconMail {...ICON} /> },
  { id: "type", title: "Type scale", description: "Sizes and weights", tags: ["free"], icon: <IconTypography {...ICON} /> },
  { id: "expenses", title: "Expenses", description: "Receipts and totals", tags: ["new", "popular"], icon: <IconReceipt {...ICON} /> },
];

const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

export function FilterGrid({
  tabs = SAMPLE_TABS,
  items = SAMPLE_ITEMS,
  counts = true,
  minColumnWidth = 200,
  gap = 10,
  radius = 16,
  duration = 0.55,
  bounce = 0.12,
  stagger = 35,
  value,
  defaultValue,
  onChange,
  onSelect,
  label = "Filter",
  className,
}: FilterGridProps) {
  const id = useId();
  const [chosen, setChosen] = useState(defaultValue ?? tabs[0]?.id);
  const [inner, { height }] = useMeasure();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  let active = value ?? chosen;
  if (!tabs.some((t) => t.id === active)) active = tabs[0]?.id;

  // Remember the tab we came from: tiles it already showed keep their place,
  // and only newcomers are staggered in.
  const [current, setCurrent] = useState(active);
  const [from, setFrom] = useState(active);
  if (current !== active) {
    setFrom(current);
    setCurrent(active);
  }
  const shown = useMemo(() => items.filter((i) => i.tags.includes(active)), [items, active]);
  const delays = new Map<string, number>();
  let k = 0;
  for (const item of shown) if (!item.tags.includes(from)) delays.set(item.id, k++ * (stagger / 1000));

  const choose = (tab: string) => {
    if (value === undefined) setChosen(tab);
    onChange?.(tab);
  };

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const to = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : step ? (i + step + tabs.length) % tabs.length : -1;
    if (to < 0) return;
    e.preventDefault();
    choose(tabs[to].id);
    tabRefs.current[to]?.focus();
  };

  return (
    <MotionConfig transition={{ type: "spring", duration, bounce }} reducedMotion="user">
      <div className={cn("flex w-full flex-col gap-4", className)}>
        <LayoutGroup id={id}>
          <div role="tablist" aria-label={label} className="flex w-fit gap-0.5 rounded-full bg-muted p-1">
            {tabs.map((tab, i) => {
              const on = tab.id === active;
              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  type="button"
                  role="tab"
                  id={`${id}-tab-${tab.id}`}
                  aria-selected={on}
                  aria-controls={`${id}-panel`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => choose(tab.id)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  className={cn(
                    "relative h-8 cursor-pointer rounded-full px-3.5 text-sm font-medium transition-colors duration-200",
                    on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    FOCUS,
                  )}
                >
                  {on && (
                    <motion.span
                      layoutId="tab"
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-background shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_var(--border)]"
                    />
                  )}
                  <span className="relative flex items-center gap-1.5">
                    {tab.label}
                    {counts && <span className="tabular-nums opacity-50">{items.filter((it) => it.tags.includes(tab.id)).length}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>

        {/* The outer box eases to the grid's height; the grid inside lays out at full size. */}
        <motion.div initial={false} animate={{ height: height || "auto" }}>
          <div ref={inner}>
            <ul
              id={`${id}-panel`}
              role="tabpanel"
              aria-labelledby={`${id}-tab-${active}`}
              className="relative grid"
              style={{ gap, gridTemplateColumns: `repeat(auto-fill, minmax(min(${minColumnWidth}px, 100%), 1fr))` }}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                {shown.map((item) => (
                  <motion.li
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.85, filter: "blur(6px)" }}
                    animate={{
                      opacity: 1,
                      scale: 1,
                      filter: "blur(0px)",
                      transition: { type: "spring", duration, bounce, delay: delays.get(item.id) ?? 0 },
                    }}
                    exit={{ opacity: 0, scale: 0.85, filter: "blur(6px)", transition: { duration: 0.2, ease: EASE_OUT } }}
                  >
                    <Tile item={item} radius={radius} onSelect={onSelect} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        </motion.div>
      </div>
    </MotionConfig>
  );
}

function Tile({ item, radius, onSelect }: { item: FilterItem; radius: number; onSelect?: (item: FilterItem) => void }) {
  const body = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground">{item.icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
        {item.description && <span className="truncate text-[13px] text-muted-foreground">{item.description}</span>}
      </span>
    </>
  );
  // Every tile is one height, whatever its text, so rows line up as tiles move.
  const shell = "flex h-[68px] w-full items-center gap-3 bg-background px-3.5 text-left shadow-[inset_0_0_0_1px_var(--border)]";
  return onSelect ? (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={cn(shell, "cursor-pointer transition-colors duration-150 hover:bg-muted/60", FOCUS)}
      style={{ borderRadius: radius }}
    >
      {body}
    </button>
  ) : (
    <div className={shell} style={{ borderRadius: radius }}>
      {body}
    </div>
  );
}
