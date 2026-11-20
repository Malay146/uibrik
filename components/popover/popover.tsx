"use client";

// A panel anchored to a button, for small forms and pickers. It grows out of
// the button, flips to the other side when there's no room, and its arrow
// keeps pointing at the button even when the panel is nudged to stay on
// screen. Focus moves inside on open and returns to the button on close.

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  EASE_OUT,
  Portal,
  SURFACE,
  originFor,
  triggerBox,
  useAnchoredPosition,
  useDismiss,
  useFocusTrap,
  useLayer,
  type Align,
  type Side,
} from "../_overlay/overlay";

export type PopoverProps = {
  /** The button that opens the popover. */
  children: ReactNode;
  /** What's inside. A function receives `close`. */
  content: ReactNode | ((close: () => void) => ReactNode);
  side?: Side;
  align?: Align;
  /** Gap between button and panel in px. */
  offset?: number;
  /** Draw a small arrow pointing at the button. */
  arrow?: boolean;
  /** Controlled open state. Pair with `onOpenChange`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Accessible name for the panel. */
  label?: string;
  /** Classes for the panel's content box (padded by default). */
  className?: string;
};

// Arrow notch: 16px wide, 8px tall, plus 1px that overlaps the panel edge.
const ARROW_W = 16;
const ARROW_H = 9;

export function Popover({
  children,
  content,
  side = "bottom",
  align = "center",
  offset = 10,
  arrow = true,
  open: openProp,
  onOpenChange,
  label,
  className,
}: PopoverProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const trigger = useRef<HTMLSpanElement>(null);
  const floating = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const layer = useLayer(open);

  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };
  const close = () => setOpen(false);

  useDismiss({ open, layer, anchor: trigger, onDismiss: close });
  useFocusTrap(panel, open, layer);
  const placed = useAnchoredPosition({ open, floating, getAnchor: () => triggerBox(trigger), side, align, offset });

  useEffect(() => {
    const el = trigger.current?.firstElementChild;
    if (!el) return;
    el.setAttribute("aria-haspopup", "dialog");
    el.setAttribute("aria-expanded", String(open));
  }, [open]);

  const s = placed.side;
  const vertical = s === "top" || s === "bottom";
  const enter = { [vertical ? "y" : "x"]: s === "top" || s === "left" ? 6 : -6 };

  return (
    <>
      <span ref={trigger} className="contents" onClick={() => setOpen(!open)}>
        {children}
      </span>
      <Portal>
        <AnimatePresence>
          {open && (
            <div ref={floating} data-owner={layer.id} className="fixed left-0 top-0 z-[200]">
              <motion.div
                ref={panel}
                role="dialog"
                aria-label={label}
                tabIndex={-1}
                initial={{ opacity: 0, scale: 0.96, ...enter }}
                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
                transition={{ duration: 0.18, ease: EASE_OUT }}
                style={{ transformOrigin: originFor(s, align, arrow ? placed.arrow : undefined) }}
                className={cn(SURFACE, "relative outline-none")}
              >
                <div className={cn("relative p-4", className)}>{typeof content === "function" ? content(close) : content}</div>
                {arrow && <Arrow side={s} at={placed.arrow} />}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}

// A notch on the panel edge, where the button's centre meets it. Only its two
// sloped sides are stroked; its filled base sits over the panel's edge line,
// so the arrow and panel read as one shape. Drawn pointing up, then turned.
function Arrow({ side, at }: { side: Side; at: number }) {
  const vertical = side === "top" || side === "bottom";
  const rotate = { bottom: 0, top: 180, right: -90, left: 90 }[side];
  // Centre of the notch: half its height outside the edge, less the 1px overlap.
  const out = `${-(ARROW_H / 2 - 1)}px`;
  const beyond = `calc(100% + ${ARROW_H / 2 - 1}px)`;
  const along = `clamp(${14 + ARROW_W / 2}px, ${at}px, calc(100% - ${14 + ARROW_W / 2}px))`;
  return (
    <svg
      aria-hidden
      width={ARROW_W}
      height={ARROW_H}
      viewBox={`0 0 ${ARROW_W} ${ARROW_H}`}
      className="pointer-events-none absolute overflow-visible"
      style={{
        left: vertical ? along : side === "right" ? out : beyond,
        top: vertical ? (side === "bottom" ? out : beyond) : along,
        transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
      }}
    >
      <path d={`M0 ${ARROW_H} L${ARROW_W / 2} 1 L${ARROW_W} ${ARROW_H} Z`} className="fill-background" />
      <path
        d={`M0 ${ARROW_H - 1} L${ARROW_W / 2} 1 L${ARROW_W} ${ARROW_H - 1}`}
        fill="none"
        strokeWidth={1}
        strokeLinejoin="round"
        style={{ stroke: "var(--border)" }}
      />
    </svg>
  );
}
