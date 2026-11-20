"use client";

import { IconChevronRight, IconDots } from "@tabler/icons-react";
import { motion, useReducedMotion } from "motion/react";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ElementType,
  type MouseEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

// Critically damped, so a fold that reverses mid-way keeps its velocity and
// settles without overshoot.
const FOLD = { type: "spring", duration: 0.4, bounce: 0 } as const;
const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const HOVER_OPEN = 80;
const HOVER_CLOSE = 320;

export type BreadcrumbItem = {
  label: string;
  href?: string;
  icon?: ReactNode;
};

export type CollapsingBreadcrumbProps = {
  /** The trail, from the root to the current page. The last item is the current page. */
  items: BreadcrumbItem[];
  /** What unfolds the hidden items. Click always works; hover adds a pointer shortcut. */
  expandOn?: "hover" | "click";
  /** Most items shown while folded, ellipsis aside. 0 fits as many as the width allows. */
  maxVisible?: number;
  separator?: "chevron" | "slash";
  /** Element for links, e.g. Next.js Link. */
  linkAs?: ElementType;
  /** Accessible name for the nav. */
  label?: string;
  className?: string;
};

export function CollapsingBreadcrumb({
  items,
  expandOn = "hover",
  maxVisible = 0,
  separator = "chevron",
  linkAs: Link = "a",
  label = "Breadcrumb",
  className,
}: CollapsingBreadcrumbProps) {
  const reduce = useReducedMotion();
  const navRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState<number[] | null>(null);
  const [room, setRoom] = useState(0);
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState({ start: false, end: false });
  const listRef = useRef<HTMLOListElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Every crumb is laid out once off-screen at its natural width. Folding
  // animates between 0 and that width, so labels are clipped, never squeezed.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const box = measureRef.current;
    if (!nav || !box) return;
    const read = () => {
      setRoom(nav.clientWidth);
      setWidths(Array.from(box.children, (c) => Math.ceil(c.getBoundingClientRect().width)));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(nav);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  // A new trail starts folded.
  const trail = items.map((i) => i.label).join("\u0000");
  const [lastTrail, setLastTrail] = useState(trail);
  if (trail !== lastTrail) {
    setLastTrail(trail);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!navRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  useEffect(() => {
    if (!open) listRef.current?.scrollTo({ left: 0, behavior: reduce ? "auto" : "smooth" });
  }, [open, reduce]);

  const n = items.length;
  // The last measured child is the ellipsis.
  const ellipsis = widths?.[n] ?? 0;
  let hidden = 0;
  if (widths && n > 2) {
    const total = widths.slice(0, n).reduce((a, b) => a + b, 0);
    // Fold from just after the root, keeping the crumbs nearest the current page.
    let used = total;
    while (hidden < n - 2 && used + (hidden ? ellipsis : 0) > room) used -= widths[1 + hidden++];
    if (maxVisible > 0) hidden = Math.max(hidden, Math.min(n - 2, n - Math.max(maxVisible, 2)));
  }
  const folded = hidden > 0 && !open;
  // Unfolded, a long trail can outgrow its box. It scrolls sideways then, with
  // the edges fading, so the current page stays reachable instead of clipped.
  const overflows = open && !!widths && widths.slice(0, n).reduce((a, b) => a + b, 0) > room;
  const fadeStart = overflows && scrolled.start;
  const fadeEnd = overflows && !scrolled.end;

  const schedule = (next: boolean, delay: number) => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(next), delay);
  };

  const toggle = (e: MouseEvent) => {
    clearTimeout(hoverTimer.current);
    setOpen((o) => !o);
    // From the keyboard, focus follows into the first crumb that unfolds.
    if (!open && e.detail === 0)
      requestAnimationFrame(() => navRef.current?.querySelector<HTMLElement>("ol [data-first] a")?.focus());
  };

  const sep =
    separator === "chevron" ? (
      <IconChevronRight aria-hidden size={14} stroke={1.75} className="mx-1 shrink-0 text-muted-foreground/60" />
    ) : (
      <span aria-hidden className="mx-1.5 shrink-0 text-muted-foreground/50">
        /
      </span>
    );

  const crumb = (item: BreadcrumbItem, i: number) => {
    const current = i === n - 1;
    const body = (
      <>
        {item.icon && <span className="grid size-4 shrink-0 place-items-center [&>svg]:size-4">{item.icon}</span>}
        <span className={cn(current && "truncate")}>{item.label}</span>
      </>
    );
    const base =
      "flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-neutral-400";
    if (current || !item.href)
      return (
        <span aria-current={current ? "page" : undefined} className={cn(base, current ? "font-medium text-foreground" : "text-muted-foreground")}>
          {body}
        </span>
      );
    return (
      <Link
        href={item.href}
        className={cn(base, "text-muted-foreground transition-colors duration-150 hover:text-foreground")}
      >
        {body}
      </Link>
    );
  };

  const reveal = (shown: boolean, order: number) =>
    reduce
      ? { duration: 0 }
      : { ...FOLD, delay: shown && open ? order * 0.03 : 0 };

  return (
    <nav
      ref={navRef}
      aria-label={label}
      className={cn("relative w-full min-w-0", className)}
      onPointerLeave={(e) => {
        if (expandOn === "hover" && e.pointerType === "mouse" && open) schedule(false, HOVER_CLOSE);
      }}
      onPointerEnter={() => clearTimeout(hoverTimer.current)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) setOpen(false);
      }}
    >
      {/* Natural widths, one child per crumb plus the ellipsis. */}
      <div ref={measureRef} aria-hidden inert className="pointer-events-none invisible absolute left-0 top-0 flex">
        {items.map((item, i) => (
          <div key={i} className="flex w-max items-center whitespace-nowrap">
            {i > 0 && sep}
            {crumb(item, i)}
          </div>
        ))}
        <div className="flex w-max items-center">
          {sep}
          <span className="size-7" />
        </div>
      </div>

      <ol
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setScrolled({ start: el.scrollLeft > 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
        }}
        style={{
          maskImage:
            fadeStart || fadeEnd
              ? `linear-gradient(to right, ${fadeStart ? "transparent, black 24px" : "black"}, ${fadeEnd ? "black calc(100% - 32px), transparent" : "black"})`
              : undefined,
        }}
        className="flex min-w-0 items-center overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => {
          const isHidden = i >= 1 && i <= hidden;
          const shown = !isHidden || open;
          const last = i === n - 1;
          return (
            <Fragment key={i}>
              {last ? (
                <li className={cn("flex items-center", open ? "shrink-0" : "min-w-0")}>
                  {i > 0 && sep}
                  {crumb(item, i)}
                </li>
              ) : (
                <motion.li
                  initial={false}
                  animate={{ width: shown ? (widths?.[i] ?? "auto") : 0 }}
                  transition={reveal(shown, i)}
                  aria-hidden={!shown}
                  inert={!shown}
                  data-first={i === 1 || undefined}
                  className="shrink-0 overflow-hidden"
                >
                  <motion.div
                    initial={false}
                    animate={{ opacity: shown ? 1 : 0, x: shown ? 0 : -6 }}
                    transition={reduce ? { duration: 0 } : { duration: shown ? 0.3 : 0.15, ease: EASE_OUT, delay: shown && open ? i * 0.03 + 0.05 : 0 }}
                    className="flex w-max items-center"
                  >
                    {i > 0 && sep}
                    {crumb(item, i)}
                  </motion.div>
                </motion.li>
              )}
              {i === 0 && n > 2 && (
                <motion.li
                  initial={false}
                  animate={{ width: folded ? ellipsis : 0, opacity: folded ? 1 : 0 }}
                  transition={reduce ? { duration: 0 } : FOLD}
                  aria-hidden={!folded}
                  inert={!folded}
                  className="shrink-0 overflow-hidden"
                >
                  <div className="flex w-max items-center">
                    {sep}
                    <button
                      type="button"
                      aria-expanded={open}
                      aria-label={`Show ${hidden} more`}
                      onClick={toggle}
                      onPointerEnter={(e) => {
                        if (expandOn === "hover" && e.pointerType === "mouse") schedule(true, HOVER_OPEN);
                      }}
                      onPointerLeave={(e) => {
                        if (expandOn === "hover" && e.pointerType === "mouse" && !open) clearTimeout(hoverTimer.current);
                      }}
                      className="grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-neutral-400"
                    >
                      <IconDots size={16} stroke={1.75} />
                    </button>
                  </div>
                </motion.li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
