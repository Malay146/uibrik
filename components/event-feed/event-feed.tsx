"use client";

// A live feed card: every few seconds a new event drops in at the top with a
// brief highlight, the rest slide down, and the oldest fades out past the
// bottom edge. Times count up as they age. It only runs while on screen;
// reduced motion shows a still list.

import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const SPRING = { type: "spring", duration: 0.5, bounce: 0 } as const;
const ROW = 60;

export type FeedEvent = {
  /** Who or what, e.g. a customer name. */
  title: string;
  /** Second line, e.g. the plan or source. */
  detail?: string;
  /** Right-hand value, e.g. an amount. */
  value?: string;
  /** Avatar image URL. Falls back to initials. */
  avatar?: string;
};

export type EventFeedProps = {
  /** Events to cycle through, in order. */
  events?: readonly FeedEvent[];
  /** Header title. */
  title?: string;
  /** Seconds between new events. */
  interval?: number;
  /** Rows on show. */
  visible?: number;
  className?: string;
};

// Photos from unsplash.com (Unsplash License), self-hosted: IxacjtwPdGM,
// WzGC8xSyqfg, RiDxDgHg7pw, _5_CBVCLBsY, VeZtb-ySct4, b5zPZ8_7vhw, AJOuSb3xt0k.
const avatar = (id: string) => `https://uibrik.com/registry/event-feed/${id}.webp`;

export const DEFAULT_EVENTS: readonly FeedEvent[] = [
  { title: "Maria Santos", detail: "Pro plan · Visa 4242", value: "+$49.00", avatar: avatar("maria") },
  { title: "Lukas Weber", detail: "Team plan · Apple Pay", value: "+$199.00", avatar: avatar("lukas") },
  { title: "Elena Novak", detail: "Pro plan · Mastercard 8210", value: "+$49.00", avatar: avatar("elena") },
  { title: "Daniel Brooks", detail: "Add-on seats · Visa 1881", value: "+$24.00", avatar: avatar("daniel") },
  { title: "Nia Mensah", detail: "Pro plan · PayPal", value: "+$49.00", avatar: avatar("nia") },
  { title: "Theo Laurent", detail: "Enterprise · Invoice", value: "+$1,200.00", avatar: avatar("theo") },
  { title: "Sofia Reyes", detail: "Pro plan · Visa 0071", value: "+$49.00", avatar: avatar("sofia") },
];

/** `at` is in seconds on the feed's own clock, which starts at 0 on mount. */
type Item = FeedEvent & { id: number; at: number };

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

function ago(s: number) {
  if (s < 3) return "now";
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m`;
}

export function EventFeed({
  events = DEFAULT_EVENTS,
  title = "Payments",
  interval = 2.4,
  visible = 4,
  className,
}: EventFeedProps) {
  const reduce = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const inView = useInView(root, { amount: 0.3 });
  const next = useRef(0);
  // Seeded with a few older events, so the card is full from the start.
  const [items, setItems] = useState<Item[]>(() =>
    Array.from({ length: Math.min(visible, events.length) }, (_, i) => {
      const e = events[(events.length - 1 - i + events.length) % events.length];
      return { ...e, id: -1 - i, at: -(i + 1) * 17 };
    }),
  );
  // Whole seconds since mount; a plain counter keeps server and client in step.
  const [now, setNow] = useState(0);
  const clock = useRef(0);

  useEffect(() => {
    if (reduce || !inView || events.length === 0) return;
    let t: ReturnType<typeof setTimeout>;
    const push = () => {
      const i = next.current++;
      const e = events[i % events.length];
      setItems((list) => [{ ...e, id: i, at: clock.current }, ...list].slice(0, visible + 1));
      t = setTimeout(push, interval * 1000);
    };
    t = setTimeout(push, 900);
    const tick = setInterval(() => setNow(++clock.current), 1000);
    return () => {
      clearTimeout(t);
      clearInterval(tick);
    };
  }, [reduce, inView, events, interval, visible]);

  return (
    <div
      ref={root}
      className={cn(
        "w-full max-w-sm overflow-hidden rounded-3xl bg-background",
        "shadow-[inset_0_0_0_1px_var(--border),0_1px_2px_rgb(0_0_0/0.04),0_12px_32px_-12px_rgb(0_0_0/0.12)]",
        className,
      )}
    >
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-green-500" />
          Live
        </span>
      </div>

      <ul
        aria-live="polite"
        className="relative overflow-hidden px-2 pb-2"
        // The last row fades out instead of being cut off.
        style={{
          height: visible * ROW + 8,
          maskImage: `linear-gradient(to bottom, #000 calc(100% - ${ROW}px), transparent)`,
          WebkitMaskImage: `linear-gradient(to bottom, #000 calc(100% - ${ROW}px), transparent)`,
        }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {items.map((item) => {
            const age = now - item.at;
            return (
              <motion.li
                key={item.id}
                layout={!reduce}
                initial={{ opacity: 0, y: -12, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                transition={{ ...SPRING, opacity: { duration: 0.3, ease: EASE_OUT }, filter: { duration: 0.3, ease: EASE_OUT } }}
                className="relative flex items-center gap-3 rounded-2xl px-3"
                style={{ height: ROW }}
              >
                {/* A soft wash that fades once the row has landed. */}
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-2xl bg-muted"
                  initial={{ opacity: item.id >= 0 ? 1 : 0 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 1.4, ease: "easeOut", delay: 0.4 }}
                />
                {item.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.avatar}
                    alt=""
                    width={36}
                    height={36}
                    decoding="async"
                    className="relative size-9 shrink-0 rounded-full bg-muted object-cover outline outline-1 -outline-offset-1 outline-black/[0.06] dark:outline-white/[0.08]"
                  />
                ) : (
                  <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-foreground">
                    {initials(item.title)}
                  </span>
                )}
                <span className="relative min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{item.title}</span>
                  {item.detail && <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>}
                </span>
                <span className="relative flex flex-col items-end">
                  {item.value && <span className="text-sm font-medium tabular-nums text-foreground">{item.value}</span>}
                  <span className={cn("text-xs tabular-nums", age < 3 ? "text-green-600 dark:text-green-500" : "text-muted-foreground")}>
                    {ago(age)}
                  </span>
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
