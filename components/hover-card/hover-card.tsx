"use client";

// A preview card that opens while you rest on a link (a person, a repo, a
// page) and stays while you move into it, so its own links can be used. It
// waits before opening and before closing, so passing over a link does
// nothing. Keyboard focus opens it too.

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EASE_OUT, Portal, SURFACE, originFor, triggerBox, useAnchoredPosition, useDismiss, useLayer, type Align, type Side } from "../_overlay/overlay";

export type HoverCardProps = {
  /** The link or element that shows the card. */
  children: ReactNode;
  content: ReactNode;
  side?: Side;
  align?: Align;
  /** Gap between trigger and card in px. */
  offset?: number;
  /** Milliseconds of hover before it opens. */
  openDelay?: number;
  /** Milliseconds after leaving before it closes. */
  closeDelay?: number;
  /** Classes for the card. */
  className?: string;
};

export function HoverCard({
  children,
  content,
  side = "bottom",
  align = "center",
  offset = 8,
  openDelay = 450,
  closeDelay = 200,
  className,
}: HoverCardProps) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLSpanElement>(null);
  const floating = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const layer = useLayer(open);

  const later = (next: boolean) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), next ? openDelay : closeDelay);
  };
  const stay = () => clearTimeout(timer.current);

  useEffect(() => () => clearTimeout(timer.current), []);
  useDismiss({ open, layer, anchor: trigger, onDismiss: () => setOpen(false) });
  const placed = useAnchoredPosition({ open, floating, getAnchor: () => triggerBox(trigger), side, align, offset });

  const s = placed.side;
  const vertical = s === "top" || s === "bottom";

  return (
    <>
      <span
        ref={trigger}
        className="contents"
        onPointerEnter={(e) => e.pointerType === "mouse" && later(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && later(false)}
        onFocus={(e) => e.target.matches(":focus-visible") && later(true)}
        onBlur={() => later(false)}
      >
        {children}
      </span>
      <Portal>
        <AnimatePresence>
          {open && (
            <div
              ref={floating}
              data-owner={layer.id}
              className="fixed left-0 top-0 z-[200]"
              onPointerEnter={stay}
              onPointerLeave={() => later(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.97, [vertical ? "y" : "x"]: s === "top" || s === "left" ? 4 : -4 }}
                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
                transition={{ duration: 0.18, ease: EASE_OUT }}
                style={{ transformOrigin: originFor(s, align) }}
                className={cn(SURFACE, "w-72 p-4", className)}
              >
                {content}
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}
