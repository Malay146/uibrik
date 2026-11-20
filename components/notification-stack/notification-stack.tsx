"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
  type Variants,
} from "motion/react";
import { cn } from "@/lib/utils";

// Notification stack. Notifications pile up as panes of frosted glass, the
// newest in front and older ones tucked behind it, each a little smaller and
// fainter. Hovering (or tabbing in) fans the pile into a list. Swiping one
// sideways blurs and fades it as it goes; let go past the threshold and it
// flies off, otherwise it springs back.
//
// Fades live on the glass itself, never on a wrapper: an ancestor with
// opacity below 1 becomes the glass's backdrop root, and the frost goes clear.

const H = 72; // height of one notification, px
const SPRING = { type: "spring", duration: 0.45, bounce: 0 } as const;
const SWIPE = 90; // px past which a release dismisses
const FLICK = 500; // px/s past which a release dismisses

export type Notification = {
  id: string | number;
  title: string;
  body?: string;
  /** Square glyph on the left, e.g. an app icon. */
  icon?: ReactNode;
  /** Right-aligned, e.g. "now" or "2m". */
  time?: string;
};

export type NotificationStackProps = {
  notifications: readonly Notification[];
  /** Called when a notification is swiped away or its close button pressed. */
  onDismiss?: (id: Notification["id"]) => void;
  /** Notifications peeking out behind the front one. */
  visible?: number;
  /** How far each one behind peeks out, px. */
  peek?: number;
  /** Gap between notifications when fanned out, px. */
  gap?: number;
  /** Backdrop blur of the glass, px. */
  blur?: number;
  /** Fan the stack out even without hover. */
  expanded?: boolean;
  className?: string;
};

type Pose = { i: number; open: boolean; visible: number; peek: number; gap: number };

const pose: Variants = {
  stack: ({ i, open, peek, gap }: Pose) => (open ? { y: -i * (H + gap), scale: 1 } : { y: -i * peek, scale: 1 - i * 0.05 }),
  enter: { y: 24, scale: 0.96 },
  // `custom` on AnimatePresence carries the swipe direction to the leaving one.
  leave: (dir: number) => ({
    x: dir * 260,
    opacity: 0,
    filter: "blur(8px)",
    transition: { duration: 0.3, ease: [0.23, 1, 0.32, 1] },
  }),
};

function Item({
  n,
  i,
  open,
  visible,
  peek,
  gap,
  blur,
  dismiss,
}: {
  n: Notification;
  i: number;
  open: boolean;
  visible: number;
  peek: number;
  gap: number;
  blur: number;
  dismiss: (dir: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const front = i === 0;

  // Older ones dim as they sink into the pile; past `visible` they're gone.
  const shown = open ? 1 : i <= visible ? 1 - i * 0.12 : 0;
  const fade = useMotionValue(0);
  useEffect(() => {
    const controls = animate(fade, shown, reduceMotion ? { duration: 0 } : SPRING);
    return () => controls.stop();
  }, [fade, shown, reduceMotion]);

  // The further it's dragged, the more it fades and blurs, as a preview of letting go.
  const opacity = useTransform(() => fade.get() * (1 - Math.min(0.8, Math.abs(x.get()) / 275)));
  const filter = useTransform(x, (v) => (v === 0 ? "none" : `blur(${Math.min(6, Math.abs(v) / 30)}px)`));

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) > SWIPE || Math.abs(info.velocity.x) > FLICK) dismiss(Math.sign(info.offset.x) || 1);
  };

  return (
    <motion.li
      layout="position"
      custom={{ i, open, visible, peek, gap } satisfies Pose}
      variants={pose}
      initial="enter"
      animate="stack"
      exit="leave"
      transition={reduceMotion ? { duration: 0 } : SPRING}
      className="absolute inset-x-0 bottom-0 origin-top list-none"
      style={{ height: H, zIndex: 100 - i }}
      aria-hidden={!open && !front ? true : undefined}
    >
      <motion.div
        drag={open || front ? "x" : false}
        dragSnapToOrigin
        dragElastic={0.6}
        onDragEnd={onDragEnd}
        style={{ x, opacity, filter, backdropFilter: `blur(${blur}px) saturate(1.6)`, WebkitBackdropFilter: `blur(${blur}px) saturate(1.6)` }}
        className={cn(
          "group flex h-full cursor-grab touch-pan-y items-center gap-3 rounded-[20px] px-3.5 select-none active:cursor-grabbing",
          "bg-white/55 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.5),inset_0_1px_0_rgb(255_255_255/0.7),0_8px_24px_-8px_rgb(0_0_0/0.18)]",
          "dark:bg-neutral-900/50 dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.08),inset_0_1px_0_rgb(255_255_255/0.1),0_8px_24px_-8px_rgb(0_0_0/0.5)]",
        )}
      >
        {/* Tucked behind the front one, only the glass edge shows, not the words. */}
        <span className={cn("flex min-w-0 flex-1 items-center gap-3 transition-opacity duration-200", !open && !front && "opacity-0")}>
          {n.icon && <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-[11px]">{n.icon}</span>}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-semibold tracking-[-0.01em] text-neutral-900 dark:text-neutral-50">{n.title}</span>
              {n.time && <span className="shrink-0 text-xs text-neutral-600 dark:text-neutral-400">{n.time}</span>}
            </span>
            {n.body && <span className="truncate text-sm text-neutral-700 dark:text-neutral-300">{n.body}</span>}
          </span>
        </span>
        <button
          type="button"
          aria-label={`Dismiss ${n.title}`}
          tabIndex={open || front ? 0 : -1}
          onClick={() => dismiss(1)}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute -top-1.5 -left-1.5 grid size-5 cursor-pointer place-items-center rounded-full bg-white/80 text-neutral-600 opacity-0 shadow-[0_1px_3px_rgb(0_0_0/0.15)] backdrop-blur-md transition-opacity duration-150 outline-none group-hover:opacity-100 focus-visible:opacity-100 dark:bg-neutral-800/80 dark:text-neutral-300"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden>
            <path d="M1 1l6 6M7 1L1 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </motion.div>
    </motion.li>
  );
}

export function NotificationStack({
  notifications,
  onDismiss,
  visible = 2,
  peek = 12,
  gap = 10,
  blur = 24,
  expanded = false,
  className,
}: NotificationStackProps) {
  const reduceMotion = useReducedMotion();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [dir, setDir] = useState(1);
  const count = notifications.length;
  const list = useRef<HTMLOListElement>(null);

  // An emptied list collapses to nothing under the pointer and takes the
  // focused close button with it, and neither fires a leave or a blur. Without
  // this the next notification would arrive fanned out.
  const [lastCount, setLastCount] = useState(count);
  if (lastCount !== count) {
    setLastCount(count);
    if (count === 0) {
      setHover(false);
      setFocus(false);
    }
  }
  // Dismissing the focused one removes focus silently too.
  useEffect(() => {
    if (!list.current?.contains(document.activeElement)) setFocus(false);
  }, [count]);

  const open = expanded || hover || focus;

  // Tall enough for whatever is showing, so the fanned list stays hoverable.
  const height = count === 0 ? 0 : open ? count * H + (count - 1) * gap : H + Math.min(count - 1, visible) * peek;

  return (
    <motion.ol
      ref={list}
      aria-label="Notifications"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFocus(false)}
      animate={{ height }}
      transition={reduceMotion ? { duration: 0 } : SPRING}
      className={cn("relative w-[min(360px,100%)]", className)}
    >
      <AnimatePresence initial={false} custom={dir}>
        {notifications.map((n, i) => (
          <Item
            key={n.id}
            n={n}
            i={i}
            open={open}
            visible={visible}
            peek={peek}
            gap={gap}
            blur={blur}
            dismiss={(d) => {
              setDir(d);
              onDismiss?.(n.id);
            }}
          />
        ))}
      </AnimatePresence>
    </motion.ol>
  );
}
