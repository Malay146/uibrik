"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { AnimatePresence, animate, motion, motionValue, type MotionValue } from "motion/react";
import {
  IconBookFilled,
  IconCalendarFilled,
  IconCameraFilled,
  IconClockFilled,
  IconCloudFilled,
  IconListCheckFilled,
  IconMailFilled,
  IconMapPinFilled,
  IconMessageCircleFilled,
  IconMinus,
  IconPhotoFilled,
  IconSettingsFilled,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// Jiggle grid. A home-screen grid you rearrange like on a phone. Press and hold
// a tile (or press Edit) and every tile starts to wobble; drag one and it
// follows your finger exactly while the others spring out of its way to make
// room, then it drops into the gap. Tiles can be removed, and the rest close
// up. Keyboard: Edit, then arrow keys move the focused tile and Delete removes it.

export type JiggleItem = { id: string; label: string; icon?: ReactNode };

export type JiggleGridProps = {
  items?: JiggleItem[];
  /** Controlled order of ids. Pair with `onChange`. */
  value?: string[];
  /** Order to begin with. Defaults to the order of `items`. */
  defaultValue?: string[];
  /** Called with the new order after every move or removal. */
  onChange?: (ids: string[]) => void;
  /** Controlled edit mode. Pair with `onEditingChange`. */
  editing?: boolean;
  defaultEditing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  /** Called when a tile is pressed outside edit mode. */
  onSelect?: (item: JiggleItem) => void;
  /** Show a remove button on each tile while editing. */
  removable?: boolean;
  /** Show the Edit / Done button above the grid. */
  toolbar?: boolean;
  /** Icon tile size, px. */
  tileSize?: number;
  /** How far tiles rock while editing, degrees. */
  jiggle?: number;
  /** How long a press takes to start editing, ms. */
  holdDelay?: number;
  /** Springiness of tiles making room. 0 settles without overshoot. */
  bounce?: number;
  /** Corner radius of a tile, px. */
  radius?: number;
  className?: string;
};

const ICON = { size: 24 };

export const SAMPLE_APPS: JiggleItem[] = [
  { id: "messages", label: "Messages", icon: <IconMessageCircleFilled {...ICON} /> },
  { id: "calendar", label: "Calendar", icon: <IconCalendarFilled {...ICON} /> },
  { id: "photos", label: "Photos", icon: <IconPhotoFilled {...ICON} /> },
  { id: "camera", label: "Camera", icon: <IconCameraFilled {...ICON} /> },
  { id: "mail", label: "Mail", icon: <IconMailFilled {...ICON} /> },
  { id: "reminders", label: "Reminders", icon: <IconListCheckFilled {...ICON} /> },
  { id: "maps", label: "Maps", icon: <IconMapPinFilled {...ICON} /> },
  { id: "clock", label: "Clock", icon: <IconClockFilled {...ICON} /> },
  { id: "weather", label: "Weather", icon: <IconCloudFilled {...ICON} /> },
  { id: "books", label: "Books", icon: <IconBookFilled {...ICON} /> },
  { id: "settings", label: "Settings", icon: <IconSettingsFilled {...ICON} /> },
];

const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const LABEL_H = 26;
const ROW_GAP = 14;
const MIN_CELL = 84;

type Drag = {
  id: string;
  pointer: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  active: boolean; // moved far enough (or held long enough) to be a drag
  timer: number;
};

export function JiggleGrid({
  items = SAMPLE_APPS,
  value,
  defaultValue,
  onChange,
  editing: editingProp,
  defaultEditing = false,
  onEditingChange,
  onSelect,
  removable = true,
  toolbar = true,
  tileSize = 60,
  jiggle = 2,
  holdDelay = 450,
  bounce = 0.2,
  radius = 16,
  className,
}: JiggleGridProps) {
  const uid = useId().replace(/:/g, "");
  const byId = new Map(items.map((i) => [i.id, i]));
  const [ownOrder, setOwnOrder] = useState(() => defaultValue ?? items.map((i) => i.id));
  const order = (value ?? ownOrder).filter((k) => byId.has(k));
  const [ownEditing, setOwnEditing] = useState(defaultEditing);
  const editing = editingProp ?? ownEditing;
  const [dragId, setDragId] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const rootRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const cols = Math.max(3, Math.min(8, Math.floor((width || 360) / MIN_CELL)));
  const cellW = (width || 360) / cols;
  const cellH = tileSize + LABEL_H + ROW_GAP;
  const rows = Math.max(1, Math.ceil(order.length / cols));
  const slot = (i: number) => ({ x: (i % cols) * cellW + (cellW - tileSize) / 2, y: Math.floor(i / cols) * cellH });

  // One pair of motion values per tile, kept across renders.
  const [mvs] = useState(() => new Map<string, { x: MotionValue<number>; y: MotionValue<number> }>());
  const mv = (k: string, i: number) => {
    let v = mvs.get(k);
    if (!v) {
      const s = slot(i);
      v = { x: motionValue(s.x), y: motionValue(s.y) };
      mvs.set(k, v);
    }
    return v;
  };

  const drag = useRef<Drag | null>(null);
  const orderRef = useRef(order);
  const tileRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    orderRef.current = order;
  });

  const setEditing = (on: boolean) => {
    if (editingProp === undefined) setOwnEditing(on);
    onEditingChange?.(on);
  };
  const commit = (next: string[]) => {
    if (value === undefined) setOwnOrder(next);
    onChange?.(next);
  };

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Every tile that isn't in someone's hand springs to its slot.
  const orderKey = order.join("|");
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const spring = reduce ? { duration: 0 } : { type: "spring" as const, duration: 0.45, bounce };
    orderKey.split("|").forEach((k, i) => {
      if (!k || k === dragId) return;
      const v = mvs.get(k);
      if (!v) return;
      const s = slot(i);
      if (Math.abs(v.x.get() - s.x) < 0.5 && Math.abs(v.y.get() - s.y) < 0.5) return;
      animate(v.x, s.x, spring);
      animate(v.y, s.y, spring);
    });
    // slot() depends only on these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey, dragId, cols, cellW, cellH, tileSize, bounce, mvs]);

  // Leave edit mode with Escape or a press outside. The Edit / Done button counts
  // as inside, so its own click is what toggles it.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setEditing(false);
    };
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setEditing(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  });

  const begin = (d: Drag) => {
    d.active = true;
    setDragId(d.id);
    if (!editing) setEditing(true);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>, k: string) => {
    if (e.button !== 0 || drag.current) return;
    const v = mvs.get(k);
    if (!v) return;
    const d: Drag = { id: k, pointer: e.pointerId, startX: e.clientX, startY: e.clientY, originX: v.x.get(), originY: v.y.get(), active: false, timer: 0 };
    drag.current = d;
    // Outside edit mode, holding still starts it and picks the tile up.
    if (!editing) d.timer = window.setTimeout(() => begin(d), holdDelay);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointer) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (Math.hypot(dx, dy) < 6) return;
      // Moving before the hold completes is a scroll or a slip, not a drag.
      if (!editing) {
        window.clearTimeout(d.timer);
        drag.current = null;
        return;
      }
      begin(d);
    }
    const v = mvs.get(d.id)!;
    const x = d.originX + dx;
    const y = d.originY + dy;
    v.x.set(x);
    v.y.set(y);
    // The slot under the tile's centre is where it goes.
    const cur = orderRef.current;
    const col = Math.max(0, Math.min(cols - 1, Math.floor((x + tileSize / 2) / cellW)));
    const row = Math.max(0, Math.floor((y + tileSize / 2 + ROW_GAP / 2) / cellH));
    const to = Math.min(cur.length - 1, row * cols + col);
    const from = cur.indexOf(d.id);
    if (to !== from && from >= 0) {
      const next = [...cur];
      next.splice(from, 1);
      next.splice(to, 0, d.id);
      orderRef.current = next;
      commit(next);
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointer) return;
    window.clearTimeout(d.timer);
    drag.current = null;
    if (d.active) {
      const item = byId.get(d.id);
      const i = orderRef.current.indexOf(d.id);
      if (item) setAnnounce(`${item.label}, position ${i + 1} of ${orderRef.current.length}`);
      setDragId(null);
    } else if (!editing && e.type === "pointerup") {
      const item = byId.get(d.id);
      if (item) onSelect?.(item);
    }
  };

  const remove = (k: string) => {
    const next = orderRef.current.filter((x) => x !== k);
    orderRef.current = next;
    commit(next);
    const item = byId.get(k);
    if (item) setAnnounce(`${item.label} removed`);
    mvs.delete(k);
    if (!next.length) setEditing(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, k: string) => {
    if (!editing) return;
    const cur = orderRef.current;
    const from = cur.indexOf(k);
    if ((e.key === "Delete" || e.key === "Backspace") && removable) {
      e.preventDefault();
      const nextFocus = cur[from + 1] ?? cur[from - 1];
      remove(k);
      if (nextFocus) requestAnimationFrame(() => tileRefs.current.get(nextFocus)?.focus());
      return;
    }
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
    if (!(e.key in step)) return;
    e.preventDefault();
    const to = Math.max(0, Math.min(cur.length - 1, from + step[e.key]));
    if (to === from) return;
    const next = [...cur];
    next.splice(from, 1);
    next.splice(to, 0, k);
    orderRef.current = next;
    commit(next);
    const item = byId.get(k);
    if (item) setAnnounce(`${item.label}, position ${to + 1} of ${next.length}`);
  };

  return (
    <div ref={wrapRef} className={cn("flex w-full flex-col gap-4", className)}>
      {/* Rocks between two angles, with each tile on its own rhythm so they never move in step. */}
      <style>{`@keyframes jiggle-${uid}{0%{transform:rotate(calc(var(--j)*-1)) translateY(0)}50%{transform:rotate(0deg) translateY(-0.5px)}100%{transform:rotate(var(--j)) translateY(0)}}`}</style>
      {toolbar && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className={cn(
              "h-9 cursor-pointer rounded-full px-4 text-sm font-medium transition-colors duration-150",
              editing ? "bg-foreground text-background" : "bg-muted text-foreground hover:bg-muted/70",
              FOCUS,
            )}
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>
      )}
      <div
        ref={rootRef}
        role="list"
        aria-label={editing ? "Apps, editing. Arrow keys move, Delete removes." : "Apps"}
        className="relative w-full select-none"
        style={{ height: rows * cellH - ROW_GAP }}
      >
        <AnimatePresence initial={false}>
          {/* Tiles wait for the first measure so they start in their real slots. */}
          {width > 0 && order.map((k, i) => {
            const item = byId.get(k)!;
            const v = mv(k, i);
            const held = dragId === k;
            const seed = (k.length * 37 + k.charCodeAt(0) * 13) % 100;
            return (
              <motion.div
                key={k}
                role="listitem"
                className="absolute top-0 left-0 flex flex-col items-center gap-1.5"
                style={{ x: v.x, y: v.y, width: tileSize, zIndex: held ? 2 : 1 }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: held ? 1.12 : 1 }}
                exit={{ opacity: 0, scale: 0.4, transition: { duration: 0.18, ease: [0.23, 1, 0.32, 1] } }}
                transition={{ type: "spring", duration: 0.3, bounce: 0.25 }}
              >
                <div
                  className="relative motion-reduce:!animate-none"
                  style={
                    editing && !held
                      ? ({
                          "--j": `${jiggle}deg`,
                          animation: `jiggle-${uid} ${0.24 + (seed % 7) * 0.012}s ease-in-out ${-(seed % 10) * 0.05}s infinite alternate`,
                        } as CSSProperties)
                      : undefined
                  }
                >
                  <button
                    ref={(el) => {
                      if (el) tileRefs.current.set(k, el);
                      else tileRefs.current.delete(k);
                    }}
                    type="button"
                    aria-label={item.label}
                    aria-roledescription={editing ? "movable app" : undefined}
                    onPointerDown={(e) => onPointerDown(e, k)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onKeyDown={(e) => onKeyDown(e, k)}
                    onClick={(e) => {
                      // Pointer presses are handled on release; this is for Enter and Space.
                      if (e.detail === 0 && !editing) onSelect?.(item);
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                    className={cn(
                      "grid cursor-pointer place-items-center bg-background text-foreground transition-shadow duration-200 [-webkit-touch-callout:none]",
                      editing ? "touch-none" : "touch-manipulation",
                      held
                        ? "shadow-[0_12px_28px_rgb(0_0_0/0.18),0_0_0_1px_var(--border)]"
                        : "shadow-[0_1px_2px_rgb(0_0_0/0.06),0_0_0_1px_var(--border)]",
                      FOCUS,
                    )}
                    style={{ width: tileSize, height: tileSize, borderRadius: radius }}
                  >
                    {item.icon}
                  </button>
                  <AnimatePresence>
                    {editing && removable && !held && (
                      <motion.button
                        type="button"
                        aria-label={`Remove ${item.label}`}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => remove(k)}
                        initial={{ opacity: 0, scale: 0.4 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.4 }}
                        transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                        // A 40px hit area around a 20px badge.
                        className="absolute -top-[18px] -left-[18px] grid size-10 cursor-pointer place-items-center outline-none [&:focus-visible>span]:ring-2 [&:focus-visible>span]:ring-neutral-400"
                      >
                        <span className="grid size-5 place-items-center rounded-full bg-neutral-500 text-white shadow-sm dark:bg-neutral-400 dark:text-neutral-900">
                          <IconMinus size={12} stroke={2.5} />
                        </span>
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
                <span className="w-[calc(100%+20px)] truncate text-center text-xs text-muted-foreground">{item.label}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      <span aria-live="polite" className="sr-only">
        {announce}
      </span>
    </div>
  );
}
