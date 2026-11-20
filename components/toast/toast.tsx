"use client";

// Call `toast("Saved")` from anywhere; one <Toaster /> on the page shows them.
// New toasts slide in at the front and push older ones back into a short
// stack; hovering (or tabbing into) the stack fans it out and pauses the
// timers. Swipe one sideways to dismiss it. `toast.promise` keeps one toast
// through loading, then swaps its icon and text in place when it settles.

import {
  animate,
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const SPRING = { type: "spring", duration: 0.45, bounce: 0 } as const;

// ─── Store ────────────────────────────────────────────────────────────────────

export type ToastType = "default" | "success" | "error" | "info" | "loading";

export type ToastOptions = {
  /** Reuse an id to update that toast in place instead of adding one. */
  id?: number | string;
  description?: ReactNode;
  /** A single button, e.g. Undo. Pressing it also dismisses the toast. */
  action?: { label: string; onClick: () => void };
  /** Milliseconds on screen. Infinity keeps it until dismissed. */
  duration?: number;
};

type ToastData = Omit<ToastOptions, "id"> & {
  id: number | string;
  title: ReactNode;
  type: ToastType;
  /** Bumped on every update, so the timer restarts. */
  version: number;
};

let toasts: ToastData[] = [];
let nextId = 0;
const listeners = new Set<() => void>();
const EMPTY: ToastData[] = [];

const emit = () => listeners.forEach((l) => l());

function upsert(type: ToastType, title: ReactNode, opts: ToastOptions = {}) {
  const { id = ++nextId, ...rest } = opts;
  const existing = toasts.find((t) => t.id === id);
  if (existing) {
    toasts = toasts.map((t) => (t.id === id ? { ...t, ...rest, title, type, version: t.version + 1 } : t));
  } else {
    toasts = [{ ...rest, id, title, type, version: 0 }, ...toasts];
  }
  emit();
  return id;
}

function dismiss(id?: number | string) {
  toasts = id === undefined ? [] : toasts.filter((t) => t.id !== id);
  emit();
}

type PromiseMessages<T> = {
  loading: ReactNode;
  success: ReactNode | ((value: T) => ReactNode);
  error: ReactNode | ((error: unknown) => ReactNode);
};

/** Show a toast. Returns its id. */
export const toast = Object.assign(
  (title: ReactNode, opts?: ToastOptions) => upsert("default", title, opts),
  {
    success: (title: ReactNode, opts?: ToastOptions) => upsert("success", title, opts),
    error: (title: ReactNode, opts?: ToastOptions) => upsert("error", title, opts),
    info: (title: ReactNode, opts?: ToastOptions) => upsert("info", title, opts),
    loading: (title: ReactNode, opts?: ToastOptions) => upsert("loading", title, opts),
    /** One toast that follows the promise from loading to its result. */
    promise<T>(promise: Promise<T>, messages: PromiseMessages<T>, opts?: Omit<ToastOptions, "id">) {
      const id = upsert("loading", messages.loading, opts);
      promise.then(
        (v) => upsert("success", typeof messages.success === "function" ? messages.success(v) : messages.success, { ...opts, id }),
        (e) => upsert("error", typeof messages.error === "function" ? messages.error(e) : messages.error, { ...opts, id }),
      );
      return promise;
    },
    /** Dismiss one toast, or all of them. */
    dismiss,
  },
);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// ─── Toaster ──────────────────────────────────────────────────────────────────

export type ToasterPosition = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

export type ToasterProps = {
  position?: ToasterPosition;
  /** Keep the stack fanned out instead of only on hover. */
  expand?: boolean;
  /** Toasts drawn at once; older ones wait out of sight. */
  visibleToasts?: number;
  /** Default milliseconds on screen. */
  duration?: number;
  /** Space between toasts when fanned out, in px. */
  gap?: number;
  /** Show a close button on each toast. */
  closeButton?: boolean;
  className?: string;
};

const PEEK = 14;

export function Toaster({
  position = "bottom-right",
  expand = false,
  visibleToasts = 3,
  duration = 4000,
  gap = 12,
  closeButton = false,
  className,
}: ToasterProps) {
  const list = useSyncExternalStore(subscribe, () => toasts, () => EMPTY);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const setHeight = useCallback((id: number | string, h: number) => {
    setHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h }));
  }, []);

  const bottom = position.startsWith("bottom");
  // Nothing is hovered once the last one goes, even if no pointerleave fired.
  const open = list.length > 0 && (expand || hovered || focused);
  const shown = list.slice(0, visibleToasts);
  const front = heights[list[0]?.id] ?? 0;
  const fanned = shown.reduce((sum, t) => sum + (heights[t.id] ?? 0), 0) + gap * Math.max(0, shown.length - 1);

  return (
    <section
      aria-label="Notifications"
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed z-[100] w-[min(356px,calc(100vw-32px))]",
        bottom ? "bottom-4 sm:bottom-6" : "top-4 sm:top-6",
        position.endsWith("left") && "left-4 sm:left-6",
        position.endsWith("right") && "right-4 sm:right-6",
        position.endsWith("center") && "left-1/2 -translate-x-1/2",
        className,
      )}
    >
      <ol
        onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFocused(false)}
        className="pointer-events-auto relative"
        // The list spans the fanned-out stack, so moving between toasts keeps it open.
        style={{ height: open ? fanned : front }}
      >
        <AnimatePresence initial={false}>
          {list.map((t, i) => {
            const offset = list.slice(0, i).reduce((sum, o) => sum + (heights[o.id] ?? 0) + gap, 0);
            return (
              <ToastItem
                key={t.id}
                toast={t}
                index={i}
                bottom={bottom}
                open={open}
                hidden={i >= visibleToasts}
                y={(bottom ? -1 : 1) * (open ? offset : i * PEEK)}
                frontHeight={front}
                paused={open || hidden}
                duration={t.duration ?? (t.type === "loading" ? Infinity : duration)}
                closeButton={closeButton}
                onHeight={setHeight}
              />
            );
          })}
        </AnimatePresence>
      </ol>
    </section>
  );
}

// ─── One toast ────────────────────────────────────────────────────────────────

function ToastItem({
  toast: t,
  index,
  bottom,
  open,
  hidden,
  y,
  frontHeight,
  paused,
  duration,
  closeButton,
  onHeight,
}: {
  toast: ToastData;
  index: number;
  bottom: boolean;
  open: boolean;
  hidden: boolean;
  y: number;
  frontHeight: number;
  paused: boolean;
  duration: number;
  closeButton: boolean;
  onHeight: (id: number | string, h: number) => void;
}) {
  const reduce = useReducedMotion();
  const inner = useRef<HTMLDivElement>(null);
  const remaining = useRef(duration);
  const x = useMotionValue(0);
  const fade = useTransform(x, [-160, 0, 160], [0, 1, 0]);
  const behind = !open && index > 0;

  // Natural height, measured inside the clamp the stack applies to back toasts.
  useLayoutEffect(() => {
    const el = inner.current!;
    const ro = new ResizeObserver(() => onHeight(t.id, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [t.id, onHeight]);

  // An update (e.g. a promise settling) earns a fresh run of the clock.
  useEffect(() => {
    remaining.current = duration;
  }, [t.version, duration]);

  useEffect(() => {
    if (paused || duration === Infinity) return;
    const start = Date.now();
    const timer = setTimeout(() => dismiss(t.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - start;
    };
  }, [paused, duration, t.id, t.version]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 80 || Math.abs(info.velocity.x) > 500) {
      const dir = Math.sign(info.offset.x || info.velocity.x);
      animate(x, dir * 400, { duration: 0.2, ease: EASE_OUT }).then(() => dismiss(t.id));
    } else {
      animate(x, 0, SPRING);
    }
  };

  const enter = bottom ? 16 : -16;

  return (
    <motion.li
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: enter, scale: 0.98 }}
      animate={{
        opacity: hidden ? 0 : 1,
        y,
        scale: open ? 1 : 1 - index * 0.05,
        height: behind && frontHeight ? frontHeight : "auto",
      }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, transition: { duration: 0.2, ease: EASE_OUT } }}
      transition={reduce ? { duration: 0.15 } : SPRING}
      aria-hidden={hidden || undefined}
      className={cn("absolute inset-x-0", bottom ? "bottom-0 origin-bottom" : "top-0 origin-top", hidden && "pointer-events-none")}
      style={{ zIndex: 100 - index }}
    >
      <motion.div
        drag="x"
        dragMomentum={false}
        onDragEnd={onDragEnd}
        style={{ x, opacity: fade }}
        className={cn(
          "h-full touch-pan-y overflow-hidden rounded-2xl bg-background",
          "shadow-[inset_0_0_0_1px_var(--border),0_6px_20px_-4px_rgb(0_0_0/0.1),0_2px_4px_rgb(0_0_0/0.04)] dark:shadow-[inset_0_0_0_1px_var(--border),0_6px_20px_-4px_rgb(0_0_0/0.5)]",
        )}
      >
        <motion.div
          ref={inner}
          animate={{ opacity: behind ? 0 : 1 }}
          transition={{ duration: 0.2 }}
          className="flex items-start gap-3 p-4"
        >
          {t.type !== "default" && <ToastIcon type={t.type} />}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.p
                key={t.version}
                initial={{ opacity: 0, filter: "blur(2px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(2px)" }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
                className="text-sm font-medium leading-5 text-foreground"
              >
                {t.title}
              </motion.p>
            </AnimatePresence>
            {t.description && <p className="text-[13px] leading-5 text-muted-foreground">{t.description}</p>}
          </div>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.onClick();
                dismiss(t.id);
              }}
              className="-my-0.5 h-6 shrink-0 cursor-pointer rounded-lg bg-foreground px-2.5 text-xs font-medium text-background outline-none transition-colors duration-150 hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t.action.label}
            </button>
          )}
          {closeButton && (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="-mr-1 -mt-0.5 grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-neutral-400"
            >
              <svg aria-hidden width={12} height={12} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                <path d="M3 3l6 6M9 3l-6 6" />
              </svg>
            </button>
          )}
        </motion.div>
      </motion.div>
    </motion.li>
  );
}

// Status gets colour only in its icon; the toast itself stays neutral.
const ICON_COLOR: Record<Exclude<ToastType, "default">, string> = {
  success: "text-green-600 dark:text-green-500",
  error: "text-red-600 dark:text-red-500",
  info: "text-foreground",
  loading: "text-muted-foreground",
};

function ToastIcon({ type }: { type: Exclude<ToastType, "default"> }) {
  return (
    <span className="relative mt-0.5 grid size-4 shrink-0 place-items-center">
      {/* Old and new icons share one grid cell while they cross-fade.
          popLayout can't pop an svg out of flow (no offsetTop), so it would
          stack them in two rows and the new icon would jump up afterwards. */}
      <AnimatePresence initial={false}>
        <motion.svg
          key={type}
          aria-hidden
          width={16}
          height={16}
          viewBox="0 0 16 16"
          fill="none"
          // Colour rides on the svg, not the wrapper, so the outgoing icon
          // keeps its own colour while it fades instead of snapping to the new one.
          className={cn("col-start-1 row-start-1", ICON_COLOR[type])}
          initial={{ opacity: 0, scale: 0.5, filter: "blur(2px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, scale: 0.5, filter: "blur(2px)" }}
          transition={{ duration: 0.25, ease: EASE_OUT }}
        >
          {type === "loading" ? (
            <g className="origin-center animate-spin [transform-box:fill-box]">
              <circle cx={8} cy={8} r={6.25} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1.5} />
              <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
            </g>
          ) : (
            <>
              <circle cx={8} cy={8} r={8} fill="currentColor" />
              {type === "success" && (
                // Drawn on once the disc has mostly landed. Opacity hides the
                // round-cap dot a zero-length stroke would otherwise show.
                <motion.path
                  d="M4.9 8.2 7 10.3 11.1 5.9"
                  stroke="var(--background)"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{
                    pathLength: { duration: 0.3, delay: 0.12, ease: EASE_OUT },
                    opacity: { duration: 0.01, delay: 0.12 },
                  }}
                />
              )}
              {type === "error" && <path d="M8 4.5v4M8 11.2v.05" stroke="var(--background)" strokeWidth={1.6} strokeLinecap="round" />}
              {type === "info" && <path d="M8 7.5v4M8 4.8v.05" stroke="var(--background)" strokeWidth={1.6} strokeLinecap="round" />}
            </>
          )}
        </motion.svg>
      </AnimatePresence>
    </span>
  );
}
