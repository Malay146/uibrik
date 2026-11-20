"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { cn } from "@/lib/utils";

// Morphing popover. A button that grows into a panel and folds back into the
// button. It's one surface throughout: its real width, height and corner
// radius spring between the button's size and the panel's, so nothing is ever
// scaled and text, borders and shadow stay crisp. The panel's content is laid
// out at full width from the start and revealed as the surface grows over it,
// fading in once there's room. The panel stays pinned to one corner of the
// button, and when its content changes size (a form swapped for a thank-you)
// the surface springs to the new height.
//
// Escape, a click outside or `close()` from the content folds it back. Focus
// moves into the panel on open and back to the button on close.

export type MorphingPopoverOrigin = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type MorphingPopoverProps = {
  /** Text of the button, and the panel's title. */
  label?: string;
  /** What's inside the panel. A function receives `close`. */
  children: ReactNode | ((close: () => void) => ReactNode);
  /** Corner of the button the panel stays pinned to as it grows. */
  origin?: MorphingPopoverOrigin;
  /** Width of the open panel, px. */
  width?: number;
  /** Seconds the morph takes. */
  duration?: number;
  /** Springiness of the morph, 0 to 0.5. */
  bounce?: number;
  /** Controlled open state. Pair with `onOpenChange`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Classes for the surface. */
  className?: string;
  /** Classes for the panel's content box (padded by default). */
  panelClassName?: string;
};

const BUTTON_RADIUS = 12;
const PANEL_RADIUS = 18;
const LABEL = "flex h-9 items-center whitespace-nowrap px-3.5 text-sm font-medium";

const PIN: Record<MorphingPopoverOrigin, string> = {
  "top-left": "left-0 top-0",
  "top-right": "right-0 top-0",
  "bottom-left": "bottom-0 left-0",
  "bottom-right": "bottom-0 right-0",
};

export function MorphingPopover({
  label = "Feedback",
  children,
  origin = "top-left",
  width = 340,
  duration = 0.5,
  bounce = 0.1,
  open: openProp,
  onOpenChange,
  className,
  panelClassName,
}: MorphingPopoverProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  // The panel stays mounted until the surface has folded back around it.
  const [mounted, setMounted] = useState(open);
  const [button, setButton] = useState({ w: 0, h: 36 });
  const [panelH, setPanelH] = useState(0);
  // Room between the pinned corner and the far edge of the screen.
  const [room, setRoom] = useState(Infinity);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const holder = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(open);

  if (open && !mounted) setMounted(true);

  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };
  const close = () => setOpen(false);

  // The button's own size, from the placeholder that holds its place.
  useLayoutEffect(() => {
    const el = holder.current;
    if (!el) return;
    const read = () => setButton({ w: el.offsetWidth, h: el.offsetHeight });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [label]);

  // The panel's height, read before paint on open so the first frame already
  // knows where it's going, then kept up to date as its content changes.
  useLayoutEffect(() => {
    const el = panel.current;
    if (!mounted || !el) return;
    const read = () => setPanelH(el.offsetHeight);
    const fit = () => {
      const r = root.current?.getBoundingClientRect();
      if (!r) return;
      setRoom(Math.floor(origin.endsWith("left") ? window.innerWidth - r.left - 16 : r.right - 16));
    };
    read();
    fit();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    window.addEventListener("resize", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [mounted, origin]);

  // Escape and clicks outside fold it back.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
    // setOpen changes every render; the listeners only need the latest open state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Focus follows the surface: into the panel on open, back to the button on
  // close, unless the user has already moved on to something else.
  useEffect(() => {
    if (open === wasOpen.current) return;
    wasOpen.current = open;
    if (open) {
      const el = panel.current;
      const target = el?.querySelector<HTMLElement>("[data-autofocus]") ?? el?.querySelector<HTMLElement>("input, textarea, select, button");
      (target ?? el)?.focus({ preventScroll: true });
    } else {
      const active = document.activeElement;
      if (!active || active === document.body || root.current?.contains(active)) trigger.current?.focus({ preventScroll: true });
    }
  }, [open]);

  // Never wider than the room beside the button, so it can't run off screen.
  const panelW = Math.max(button.w, Math.min(width, room));
  // Growing from a top corner, the button's label is already where the panel's
  // title goes, so one label stays put through the whole morph. From a bottom
  // corner the title is far away, so the two cross-fade instead.
  const still = origin.startsWith("top");
  const fade = { duration: 0.16, ease: "easeOut" } as const;

  return (
    <MotionConfig reducedMotion="user">
      <div ref={root} className="relative inline-flex">
        {/* Holds the button's place in the page, and gives its size. */}
        <span ref={holder} aria-hidden className={cn(LABEL, "invisible")}>
          {label}
        </span>

        <motion.div
          initial={false}
          animate={{
            // "auto" until measured, so the server-rendered button already has its size.
            width: open ? panelW : button.w || "auto",
            height: open ? panelH || button.h : button.h,
            borderRadius: open ? PANEL_RADIUS : BUTTON_RADIUS,
          }}
          transition={{ type: "spring", duration, bounce }}
          onAnimationComplete={() => {
            if (!open) setMounted(false);
          }}
          className={cn(
            "absolute overflow-hidden bg-background text-foreground transition-shadow duration-300",
            "has-[>button:focus-visible]:ring-2 has-[>button:focus-visible]:ring-neutral-400 has-[>button:focus-visible]:ring-offset-2 has-[>button:focus-visible]:ring-offset-background",
            open || mounted
              ? "z-50 shadow-[inset_0_0_0_1px_var(--border),0_8px_20px_-10px_rgb(0_0_0/0.22),0_2px_4px_-2px_rgb(0_0_0/0.06)] dark:shadow-[inset_0_0_0_1px_var(--border),0_8px_20px_-10px_rgb(0_0_0/0.7)]"
              : "shadow-[inset_0_0_0_1px_var(--border),0_1px_2px_rgb(0_0_0/0.05)]",
            PIN[origin],
            className,
          )}
        >
          {/* Laid out at the panel's full width from the start, so nothing
              reflows while the surface grows over it. */}
          {mounted && (
            <div
              ref={panel}
              role="dialog"
              aria-label={label}
              tabIndex={-1}
              inert={!open}
              className={cn("absolute outline-none", PIN[origin])}
              style={{ width: panelW }}
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: open ? 1 : 0 }}
                transition={open ? { ...fade, delay: duration * 0.3 } : { duration: 0.08 }}
              >
                {still ? <div aria-hidden className="h-9" /> : <div className={LABEL}>{label}</div>}
                <div className={cn("px-3.5 pb-3.5", panelClassName)}>{typeof children === "function" ? children(close) : children}</div>
              </motion.div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {!open && (
              <motion.button
                key="button"
                ref={trigger}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={false}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: still ? { duration: 0 } : { ...fade, delay: duration * 0.45 } }}
                exit={{ opacity: 0, transition: { duration: still ? 0 : 0.08 } }}
                onClick={() => setOpen(true)}
                className={cn(
                  LABEL,
                  "absolute cursor-pointer outline-none transition-colors duration-150 hover:bg-muted",
                  still && "text-transparent",
                  PIN[origin],
                )}
                style={{ borderRadius: BUTTON_RADIUS }}
              >
                {label}
              </motion.button>
            )}
          </AnimatePresence>

          {/* Above the button, so its hover fill sits behind the text. */}
          {still && (
            <span aria-hidden className={cn(LABEL, "pointer-events-none absolute", PIN[origin])}>
              {label}
            </span>
          )}
        </motion.div>
      </div>
    </MotionConfig>
  );
}
