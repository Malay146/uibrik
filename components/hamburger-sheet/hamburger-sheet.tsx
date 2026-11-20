"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const PAD = 6;
const ROW_GAP = 2;
const LINE_THICKNESS = 2;

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

export type HamburgerSheetItem = {
  label: string;
  icon?: ReactNode;
  /** Shown faintly at the end of the row, e.g. a shortcut or count. */
  hint?: string;
  href?: string;
  onSelect?: () => void;
};

export type HamburgerSheetProps = {
  items: HamburgerSheetItem[];
  /** Optional heading beside the close button. */
  title?: string;
  /** Controlled open state. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Which way the sheet opens from the button: start opens rightward, end opens leftward. */
  align?: "start" | "end";
  /** Width of the open sheet in px. Never wider than the screen allows. */
  width?: number;
  /** Size of the closed button in px. Also the height of the sheet's header. */
  size?: number;
  /** Height of each row in px. */
  rowHeight?: number;
  /** Seconds between one row settling in and the next. */
  stagger?: number;
  /** Length of the morph in seconds. */
  duration?: number;
  /** Corner radius of the open sheet in px. */
  radius?: number;
  /** Close after an item is picked. */
  closeOnSelect?: boolean;
  /** Accessible name for the button. */
  label?: string;
  className?: string;
};

export function HamburgerSheet({
  items,
  title,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  align = "end",
  width = 240,
  size = 40,
  rowHeight = 40,
  stagger = 0.03,
  duration = 0.45,
  radius = 16,
  closeOnSelect = true,
  label = "Menu",
  className,
}: HamburgerSheetProps) {
  const reduce = useReducedMotion();
  const id = useId();
  const [inner, setInner] = useState(defaultOpen);
  const open = openProp ?? inner;
  const [sheetWidth, setSheetWidth] = useState(width);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const rows = useRef<(HTMLElement | null)[]>([]);
  const focusFirst = useRef(false);

  const n = items.length;
  const openW = Math.max(sheetWidth, size * 2);
  const openH = size + n * (rowHeight + ROW_GAP) - ROW_GAP + PAD;
  const closedRadius = Math.round(size * 0.3);

  // One value, 0 closed to 1 open, drives the shape, its colours and the icon.
  // It runs on a spring, so reversing mid-way carries the speed it had.
  const progress = useMotionValue(open ? 1 : 0);
  useEffect(() => {
    if (reduce) {
      progress.jump(open ? 1 : 0);
      return;
    }
    const ctl = animate(progress, open ? 1 : 0, {
      type: "spring",
      visualDuration: open ? duration : duration * 0.8,
      bounce: 0,
      // Closing waits a beat for the rows to clear, so no half-faded text gets
      // sliced by the shrinking edge.
      delay: open ? 0 : 0.07,
    });
    return () => ctl.stop();
  }, [open, reduce, duration, progress]);

  // Geometry lives in motion values too, so a new width or size reaches the
  // box on the next frame without re-rendering anything.
  const geoW = useMotionValue(openW);
  const geoH = useMotionValue(openH);
  const geoSize = useMotionValue(size);
  const geoR0 = useMotionValue(closedRadius);
  const geoR1 = useMotionValue(radius);
  useEffect(() => {
    geoW.set(openW);
    geoH.set(openH);
    geoSize.set(size);
    geoR0.set(closedRadius);
    geoR1.set(radius);
  }, [openW, openH, size, closedRadius, radius, geoW, geoH, geoSize, geoR0, geoR1]);

  const setOpen = (next: boolean) => {
    // Fit the sheet to the screen at the moment it opens, so it never runs off a phone.
    if (next) setSheetWidth(Math.min(width, window.innerWidth - 32));
    if (openProp === undefined) setInner(next);
    onOpenChange?.(next);
  };

  // Click away or Escape closes it. Escape is heard on the document: Safari
  // never focuses a clicked button, so focus may not be inside at all.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      const inside = root.current?.contains(document.activeElement);
      setOpen(false);
      if (inside) toggle.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open && focusFirst.current) rows.current[0]?.focus({ preventScroll: true });
    focusFirst.current = false;
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    e.preventDefault();
    const at = rows.current.indexOf(document.activeElement as HTMLElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    const next = at < 0 ? (step > 0 ? 0 : n - 1) : (at + step + n) % n;
    rows.current[next]?.focus();
  };

  // The sheet is a real box growing out of the button's corner. Its content
  // is laid out at full size inside and only revealed, so nothing ever stretches.
  const lerp = (a: number, b: number) => a + (b - a) * clamp01(progress.get());
  const boxW = useTransform(() => lerp(geoSize.get(), geoW.get()));
  const boxH = useTransform(() => lerp(geoSize.get(), geoH.get()));
  const boxR = useTransform(() => lerp(geoR0.get(), geoR1.get()));
  // Real colours that mix along the way, not layers fading over each other:
  // the button's grey turns into the sheet, and a border and shadow come up with it.
  const surface = useTransform(
    progress,
    (p) => `color-mix(in oklab, var(--muted) ${Math.round((1 - clamp01(p)) * 100)}%, var(--sheet))`,
  );
  const shadow = useTransform(progress, (p) => {
    const q = clamp01(p);
    const pct = Math.round(q * 100);
    return `0 0 0 ${q > 0.02 ? 1 : 0}px color-mix(in oklab, var(--border) ${pct}%, transparent), 0 ${(14 * q).toFixed(1)}px ${(36 * q).toFixed(1)}px -10px rgb(0 0 0 / ${(0.2 * q).toFixed(3)})`;
  });

  const edge = align === "end" ? { right: 0 } : { left: 0 };

  return (
    <div
      ref={root}
      onKeyDown={onKeyDown}
      style={{ width: size, height: size }}
      className={cn(
        "relative inline-block shrink-0 [--sheet:var(--background)] dark:[--sheet:var(--color-neutral-900)]",
        open && "z-50",
        className,
      )}
    >
      {/* Border and shadow live on a twin of the box, so the clip below never cuts them. */}
      <motion.div
        aria-hidden
        style={{ ...edge, top: 0, width: boxW, height: boxH, borderRadius: boxR, boxShadow: shadow }}
        className="pointer-events-none absolute"
      />
      {/* The mask makes every browser clip animating children to the rounded
          corners; overflow and radius alone let them bleed in WebKit. */}
      <motion.div
        style={{ ...edge, top: 0, width: boxW, height: boxH, borderRadius: boxR, backgroundColor: surface }}
        className={cn(
          "absolute overflow-hidden [mask-image:linear-gradient(#000,#000)]",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <div style={{ ...edge, top: 0, width: openW, height: openH }} className="absolute">
          {title && (
            <motion.div
              aria-hidden={!open}
              initial={false}
              animate={{ opacity: open ? 1 : 0, y: open ? 0 : -4 }}
              transition={
                reduce ? { duration: 0 } : { duration: open ? 0.3 : 0.1, ease: "easeOut", delay: open ? 0.06 : 0 }
              }
              style={{
                height: size,
                ...(align === "end"
                  ? { paddingLeft: PAD + 12, paddingRight: size }
                  : { paddingLeft: size, paddingRight: PAD + 12 }),
              }}
              className="flex items-center truncate text-sm font-medium text-foreground"
            >
              {title}
            </motion.div>
          )}

          <div
            id={id}
            role="menu"
            aria-label={label}
            aria-hidden={!open}
            style={{ top: size, paddingInline: PAD, gap: ROW_GAP }}
            className="absolute inset-x-0 flex flex-col"
          >
            {items.map((item, i) => {
              const Row = item.href ? motion.a : motion.button;
              return (
                <Row
                  key={i}
                  ref={(el: HTMLElement | null) => {
                    rows.current[i] = el;
                  }}
                  role="menuitem"
                  {...(item.href ? { href: item.href } : { type: "button" as const })}
                  inert={!open}
                  tabIndex={open ? 0 : -1}
                  onClick={() => {
                    item.onSelect?.();
                    if (closeOnSelect) setOpen(false);
                  }}
                  // Rows settle in one after another as the sheet opens over
                  // them, and leave together, quickly, before it folds away.
                  initial={false}
                  animate={{ opacity: open ? 1 : 0, y: open ? 0 : -6 }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : open
                        ? { duration: 0.32, ease: [0.25, 1, 0.5, 1], delay: 0.05 + i * stagger }
                        : { duration: 0.09, ease: "easeIn" }
                  }
                  style={{ height: rowHeight, borderRadius: Math.max(radius - PAD, 6) }}
                  className="flex w-full shrink-0 cursor-pointer items-center gap-3 px-3 text-left text-sm text-foreground outline-none transition-[background-color] duration-150 hover:bg-[color-mix(in_oklab,var(--sheet),var(--foreground)_6%)] focus-visible:bg-[color-mix(in_oklab,var(--sheet),var(--foreground)_9%)]"
                >
                  {item.icon && <span className="grid shrink-0 text-muted-foreground">{item.icon}</span>}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.hint && <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span>}
                </Row>
              );
            })}
          </div>
        </div>
      </motion.div>

      <button
        ref={toggle}
        type="button"
        aria-label={open ? `Close ${label.toLowerCase()}` : label}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (!open && (e.key === "Enter" || e.key === " " || e.key === "ArrowDown")) focusFirst.current = true;
          if (!open && e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        style={{ width: size, height: size, borderRadius: closedRadius, ...edge }}
        className="group/toggle absolute top-0 z-10 grid cursor-pointer place-items-center outline-none focus-visible:ring-2 focus-visible:ring-neutral-400"
      >
        <BurgerIcon progress={progress} width={Math.round(size * 0.45)} gap={Math.round(size * 0.15)} />
      </button>
    </div>
  );
}

/** Three lines that are also the close mark: the outer two meet and cross, the middle one draws in. */
function BurgerIcon({ progress, width, gap }: { progress: MotionValue<number>; width: number; gap: number }) {
  // The lines meet first and the turn picks up as they land, so the halfway
  // frame is a tight "=" turning into a cross, never a chevron.
  const meet = (p: number) => {
    const t = clamp01(p / 0.5);
    return 1 - (1 - t) * (1 - t);
  };
  const turn = (p: number) => {
    const t = clamp01((p - 0.3) / 0.7);
    return t * t * (3 - 2 * t);
  };
  const topY = useTransform(progress, (p) => -gap * (1 - meet(p)));
  const bottomY = useTransform(progress, (p) => gap * (1 - meet(p)));
  const topRotate = useTransform(progress, (p) => 45 * turn(p));
  const bottomRotate = useTransform(progress, (p) => -45 * turn(p));
  const middle = useTransform(progress, (p) => 1 - clamp01(p / 0.4));

  const line =
    "col-start-1 row-start-1 rounded-full bg-neutral-600 transition-[background-color] duration-150 group-hover/toggle:bg-foreground dark:bg-neutral-300";
  return (
    <span aria-hidden className="grid place-items-center">
      <motion.span style={{ width, height: LINE_THICKNESS, y: topY, rotate: topRotate }} className={line} />
      <motion.span style={{ width, height: LINE_THICKNESS, scaleX: middle, opacity: middle }} className={line} />
      <motion.span style={{ width, height: LINE_THICKNESS, y: bottomY, rotate: bottomRotate }} className={line} />
    </span>
  );
}
