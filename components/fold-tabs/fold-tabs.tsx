"use client";

import { IconChevronDown } from "@tabler/icons-react";
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

export type FoldTabsItem = {
  value: string;
  label: string;
  content: ReactNode;
};

export type FoldTabsProps = {
  items: FoldTabsItem[];
  /** Controlled active item. */
  value?: string;
  /** Active item on mount when uncontrolled. Defaults to the first. */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** "auto" folds to an accordion when the container is narrower than `breakpoint`. */
  mode?: "auto" | "tabs" | "accordion";
  /** Container width in px below which "auto" becomes an accordion. */
  breakpoint?: number;
  /** Length of the fold in seconds. */
  duration?: number;
  /** Corner radius of the track in px. Rows and the tab pill follow it. */
  radius?: number;
  className?: string;
};

const RAISED =
  "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)] dark:bg-white/[0.09] dark:shadow-none";
const PANEL_TEXT = "text-sm leading-6 text-muted-foreground";

// One tree for both layouts. The track, every header and the open panel keep
// their identity when the layout folds, so Motion animates each from where it
// was to where it goes. Everything that moves lives inside the track, which
// clips it: nothing pokes out of the box while it changes shape. Text is
// always in a layout="position" child, so it travels without stretching.
export function FoldTabs({
  items,
  value: valueProp,
  defaultValue,
  onValueChange,
  mode = "auto",
  breakpoint = 480,
  duration = 0.45,
  radius = 18,
  className,
}: FoldTabsProps) {
  const uid = useId();
  const reduce = useReducedMotion();
  const [inner, setInner] = useState(defaultValue ?? items[0]?.value);
  const value = valueProp ?? inner;
  // An accordion can close its only open row; tabs always show one. The
  // value stays put so unfolding back to tabs shows the same panel.
  const [open, setOpen] = useState(true);

  const root = useRef<HTMLDivElement>(null);
  // Only crossing the breakpoint re-renders; a resize inside one layout is
  // plain CSS reflow, so nothing lags behind a window being dragged.
  const [narrow, setNarrow] = useState(false);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const check = (w: number) => setNarrow(w < breakpoint);
    check(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([entry]) => check(entry.contentRect.width));
    ro.observe(el);
    // The first measurement places the layout without animating it.
    const raf = requestAnimationFrame(() => setReady(true));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [breakpoint]);

  const folded = mode === "accordion" || (mode === "auto" && narrow);

  // The render where the layout flips: the open panel arrives at full height
  // instead of growing from zero, so the fold is one motion.
  const [shown, setShown] = useState(folded);
  const [flipping, setFlipping] = useState(false);
  if (shown !== folded) {
    setShown(folded);
    setFlipping(true);
  }
  useEffect(() => {
    if (!flipping) return;
    const t = window.setTimeout(
      () => setFlipping(false),
      duration * 1000 + 100,
    );
    return () => window.clearTimeout(t);
  }, [flipping, duration]);

  // Keep focus on the same header when the layout flips.
  const focused = useRef<string | null>(null);
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const on = (e: FocusEvent) =>
      (focused.current = (e.target as HTMLElement).dataset.foldHead ?? null);
    const off = () => (focused.current = null);
    el.addEventListener("focusin", on);
    el.addEventListener("focusout", off);
    return () => {
      el.removeEventListener("focusin", on);
      el.removeEventListener("focusout", off);
    };
  }, []);
  useLayoutEffect(() => {
    const v = focused.current;
    if (v)
      root.current
        ?.querySelector<HTMLElement>(`[data-fold-head="${CSS.escape(v)}"]`)
        ?.focus({ preventScroll: true });
  }, [folded]);

  const select = (v: string) => {
    if (valueProp === undefined) setInner(v);
    onValueChange?.(v);
  };
  const toggle = (v: string) => {
    if (v === value) setOpen((o) => !o);
    else {
      select(v);
      setOpen(true);
    }
  };

  const ids = (v: string) => ({
    head: `${uid}-h-${v}`,
    panel: `${uid}-p-${v}`,
  });
  const active = items.find((i) => i.value === value) ?? items[0];

  const onKey = (e: KeyboardEvent<HTMLElement>, index: number) => {
    const keys = folded
      ? ["ArrowDown", "ArrowUp"]
      : ["ArrowRight", "ArrowLeft"];
    let to = -1;
    if (e.key === keys[0]) to = (index + 1) % items.length;
    else if (e.key === keys[1]) to = (index - 1 + items.length) % items.length;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = items.length - 1;
    if (to < 0) return;
    e.preventDefault();
    const v = items[to].value;
    root.current
      ?.querySelector<HTMLElement>(`[data-fold-head="${CSS.escape(v)}"]`)
      ?.focus();
    // Tabs follow focus; accordion rows only move it.
    if (!folded) select(v);
  };

  const spring =
    reduce || !ready
      ? { duration: 0 }
      : { type: "spring" as const, duration, bounce: 0 };
  // Layout is measured only when one of these changes, so unrelated parent
  // renders never start a layout animation.
  const dep = `${folded}|${active?.value}|${open}`;
  const inset = radius - 4;

  // Real height for the whole block, so the page below moves with the fold.
  const [contentRef, bounds] = useMeasure();

  return (
    <MotionConfig transition={spring}>
      <LayoutGroup id={uid}>
        <div ref={root} className={cn("w-full min-w-0", className)}>
          <motion.div
            initial={false}
            animate={{ height: bounds.height || "auto" }}
          >
            <div
              ref={contentRef}
              className={cn("flex flex-col", !folded && "gap-3")}
            >
              <motion.div
                layout
                layoutDependency={dep}
                role={folded ? undefined : "tablist"}
                aria-orientation={folded ? undefined : "horizontal"}
                style={{ borderRadius: radius }}
                className={cn(
                  "relative flex max-w-full overflow-hidden bg-[color-mix(in_oklab,var(--foreground)_4%,var(--background))] p-1",
                  folded ? "w-full flex-col gap-0.5" : "w-fit flex-row gap-1",
                )}
              >
                {items.map((item, i) => {
                  const selected = item.value === active?.value;
                  const expanded = folded && open && selected;
                  const raised = folded ? expanded : selected;
                  return (
                    <Fragment key={item.value}>
                      <motion.button
                        layout
                        layoutDependency={dep}
                        type="button"
                        id={ids(item.value).head}
                        data-fold-head={item.value}
                        role={folded ? undefined : "tab"}
                        aria-selected={folded ? undefined : selected}
                        aria-expanded={folded ? expanded : undefined}
                        aria-controls={ids(item.value).panel}
                        tabIndex={folded || selected ? 0 : -1}
                        onClick={() =>
                          folded ? toggle(item.value) : select(item.value)
                        }
                        onKeyDown={(e) => onKey(e, i)}
                        style={{ borderRadius: inset }}
                        className={cn(
                          // The pill travels inside the header it lands on; that header sits
                          // under its neighbours so the pill never covers their labels mid-flight.
                          "relative flex min-w-0 shrink cursor-pointer items-center text-left text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-foreground/20",
                          raised ? "z-0" : "z-[1]",
                          folded
                            ? "h-11 w-full justify-between gap-3 px-4"
                            : "h-9 px-4",
                          raised
                            ? "text-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {raised && (
                          <motion.span
                            layoutId="pill"
                            layoutDependency={dep}
                            aria-hidden
                            style={{ borderRadius: inset }}
                            className={cn("absolute inset-0", RAISED)}
                          />
                        )}
                        <motion.span
                          layout="position"
                          layoutDependency={dep}
                          className="relative min-w-0 truncate whitespace-nowrap"
                        >
                          {item.label}
                        </motion.span>
                        {folded && (
                          <motion.span
                            layout="position"
                            layoutDependency={dep}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1, scaleY: expanded ? -1 : 1 }}
                            transition={{
                              ...spring,
                              opacity: {
                                duration: 0.2,
                                delay: reduce ? 0 : duration * 0.4,
                              },
                            }}
                            className="relative grid shrink-0 place-items-center"
                          >
                            <IconChevronDown size={16} stroke={2} />
                          </motion.span>
                        )}
                      </motion.button>
                      {/* Mounted with the accordion and gone with it, so unfolding drops the
                          panel at once. It mounts allowing entrances during a fold, so the
                          content still fades in rather than being skipped as a first render. */}
                      {folded && (
                        <AnimatePresence initial={flipping}>
                          {expanded && (
                            <motion.div
                              key="panel"
                              id={ids(item.value).panel}
                              role="region"
                              aria-labelledby={ids(item.value).head}
                              initial={
                                flipping ? false : { height: 0, opacity: 0 }
                              }
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              // The track clips during a fold; clipping here too would cut
                              // the content while it travels in from the tab panel.
                              className={cn(
                                "relative",
                                !flipping && "overflow-hidden",
                              )}
                            >
                              <motion.div
                                // Shared with the tab panel only while folding; between rows
                                // each panel simply opens in place.
                                layoutId={flipping ? "panel" : undefined}
                                layout={flipping ? "position" : undefined}
                                layoutCrossfade={false}
                                layoutDependency={dep}
                                initial={flipping ? { opacity: 0 } : false}
                                animate={{ opacity: 1 }}
                                transition={{
                                  ...spring,
                                  opacity: {
                                    duration: 0.2,
                                    delay: reduce ? 0 : duration * 0.45,
                                  },
                                }}
                                className={cn(PANEL_TEXT, "px-4 pb-4 pt-3")}
                              >
                                {item.content}
                              </motion.div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      )}
                    </Fragment>
                  );
                })}
              </motion.div>
              {!folded && active && (
                <TabPanel
                  item={active}
                  ids={ids(active.value)}
                  dep={dep}
                  flipping={flipping}
                  reduce={!!reduce}
                  fadeDelay={duration * 0.45}
                />
              )}
            </div>
          </motion.div>
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}

// The panel's height follows its content, so switching tabs never jumps the
// page below. The old content fades out in place while the new one fades in.
function TabPanel({
  item,
  ids,
  dep,
  flipping,
  reduce,
  fadeDelay,
}: {
  item: FoldTabsItem;
  ids: { head: string; panel: string };
  dep: string;
  flipping: boolean;
  reduce: boolean;
  fadeDelay: number;
}) {
  const [ref, bounds] = useMeasure();
  return (
    <motion.div
      initial={false}
      animate={{ height: bounds.height || "auto" }}
      className={cn("relative", !flipping && "overflow-hidden")}
    >
      <div ref={ref}>
        <AnimatePresence initial={flipping} mode="popLayout">
          <motion.div
            key={item.value}
            layoutId={flipping ? "panel" : undefined}
            layout={flipping ? "position" : undefined}
            layoutCrossfade={false}
            layoutDependency={dep}
            id={ids.panel}
            role="tabpanel"
            aria-labelledby={ids.head}
            tabIndex={0}
            initial={
              flipping ? { opacity: 0 } : { opacity: 0, y: reduce ? 0 : 6 }
            }
            animate={{ opacity: 1, y: 0 }}
            transition={
              flipping
                ? { opacity: { duration: 0.2, delay: reduce ? 0 : fadeDelay } }
                : undefined
            }
            exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.12 } }}
            className={cn(
              PANEL_TEXT,
              "rounded-md px-4 py-1 outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
            )}
          >
            {item.content}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
