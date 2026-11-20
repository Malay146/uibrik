"use client";

// A modal that grows out of the button that opened it and shrinks back into
// it. Focus is held inside, the page behind stops scrolling, and Escape or a
// click on the backdrop closes it. Opening a dialog from inside another one
// eases the first back, so the stack reads at a glance.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EASE_OUT, FOCUS, Portal, SURFACE, useDismiss, useFocusTrap, useLayer, useScrollLock } from "../_overlay/overlay";

const SIZES = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg" } as const;

export type DialogProps = {
  /** The button that opens the dialog. Leave out when fully controlled. */
  trigger?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** The body. A function receives `close`. */
  children?: ReactNode | ((close: () => void) => ReactNode);
  /** Buttons along the bottom. A function receives `close`. */
  footer?: ReactNode | ((close: () => void) => ReactNode);
  size?: keyof typeof SIZES;
  /** Close on Escape and backdrop click. Off for flows that must be finished. */
  dismissible?: boolean;
  /** Blur the page behind the backdrop. */
  blur?: boolean;
  /** Controlled open state. Pair with `onOpenChange`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Classes for the panel. */
  className?: string;
};

// Lets a dialog know a child dialog is open above it, so it can step back.
const ParentContext = createContext<((open: boolean) => void) | null>(null);

export function Dialog({
  trigger,
  title,
  description,
  children,
  footer,
  size = "md",
  dismissible = true,
  blur = true,
  open: openProp,
  onOpenChange,
  className,
}: DialogProps) {
  const reduce = useReducedMotion();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const [childOpen, setChildOpen] = useState(false);
  const notifyParent = useContext(ParentContext);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const from = useRef<{ x: number; y: number } | null>(null);
  const titleId = useId();
  const descId = useId();
  const layer = useLayer(open);

  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };
  const close = () => setOpen(false);

  useDismiss({ open, layer, onDismiss: close, outside: dismissible });
  useFocusTrap(panel, open, layer);
  useScrollLock(open);

  useEffect(() => {
    if (!notifyParent) return;
    notifyParent(open);
    return () => notifyParent(false);
  }, [open, notifyParent]);

  // Grow from the trigger: point the panel's transform origin at it. offsetLeft/Top
  // ignore transforms, so this reads the panel's resting place mid-animation.
  useLayoutEffect(() => {
    const p = panel.current;
    if (!open || !p || !from.current) return;
    p.style.transformOrigin = `${from.current.x - p.offsetLeft}px ${from.current.y - p.offsetTop}px`;
  }, [open]);

  const render = (n: DialogProps["children"]) => (typeof n === "function" ? n(close) : n);

  return (
    <>
      {trigger && (
        <span
          ref={triggerRef}
          className="contents"
          onClick={() => {
            // Remember where the trigger is, so the panel can grow out of it.
            const r = triggerRef.current?.firstElementChild?.getBoundingClientRect();
            from.current = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
            setOpen(true);
          }}
        >
          {trigger}
        </span>
      )}
      <Portal>
        <ParentContext.Provider value={setChildOpen}>
          <AnimatePresence>
            {open && (
              <div data-owner={layer.id} className="fixed inset-0 z-[150]">
                <motion.div
                  aria-hidden
                  // A dialog on top of another adds only a light veil; the one below already dims the page.
                  className={cn("absolute inset-0", notifyParent ? "bg-black/10" : "bg-black/30 dark:bg-black/60", blur && !notifyParent && "backdrop-blur-[2px]")}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: 0.18 } }}
                  transition={{ duration: 0.25 }}
                  onClick={() => dismissible && close()}
                />
                <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-y-auto p-4">
                  <motion.div
                    ref={panel}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={titleId}
                    aria-describedby={description ? descId : undefined}
                    tabIndex={-1}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
                    animate={childOpen && !reduce ? { opacity: 1, scale: 0.95, y: -10 } : { opacity: 1, scale: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.94, transition: { duration: 0.16, ease: EASE_OUT } }}
                    transition={{ type: "spring", duration: 0.35, bounce: 0 }}
                    className={cn(SURFACE, "pointer-events-auto relative w-full rounded-3xl p-6 outline-none", SIZES[size], className)}
                  >
                    {/* Dims the panel while a child dialog sits on top of it. */}
                    <motion.div
                      aria-hidden
                      className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] bg-background"
                      initial={false}
                      animate={{ opacity: childOpen ? 0.5 : 0 }}
                      transition={{ duration: 0.2 }}
                    />
                    <h2 id={titleId} className="pr-8 text-base font-semibold tracking-tight text-foreground">
                      {title}
                    </h2>
                    {description && (
                      <p id={descId} className="mt-1.5 text-sm leading-6 text-muted-foreground">
                        {description}
                      </p>
                    )}
                    {children && <div className="mt-5">{render(children)}</div>}
                    {footer && <div className="mt-6 flex justify-end gap-2">{render(footer)}</div>}
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={close}
                      className={cn(
                        "absolute right-4 top-4 grid size-8 cursor-pointer place-items-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground",
                        FOCUS,
                      )}
                    >
                      <svg aria-hidden width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                        <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
                      </svg>
                    </button>
                  </motion.div>
                </div>
              </div>
            )}
          </AnimatePresence>
        </ParentContext.Provider>
      </Portal>
    </>
  );
}

/** Button styles that match the dialog: one primary, one quiet, one destructive. */
export const dialogButton = {
  primary: cn("h-9 cursor-pointer rounded-xl bg-foreground px-4 text-sm font-medium text-background transition-colors duration-150 hover:bg-foreground/90", FOCUS),
  secondary: cn("h-9 cursor-pointer rounded-xl bg-background px-4 text-sm font-medium text-foreground shadow-[inset_0_0_0_1px_var(--border)] transition-colors duration-150 hover:bg-muted", FOCUS),
  danger: cn("h-9 cursor-pointer rounded-xl bg-red-600 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-red-600/90", FOCUS),
};
