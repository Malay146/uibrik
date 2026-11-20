"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

// ─── Geometry ─────────────────────────────────────────────────────────────────
const TRACK_W = 44;
const TRACK_H = 26;
const PAD = 2;
const KNOB = TRACK_H - PAD * 2;
// Pointer travel before a press counts as a drag rather than a tap.
const DRAG_SLOP = 3;

const SPRING = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 } as const;
const INSTANT = { duration: 0 } as const;
// Off track: a tint of the text colour, so it reads in light and dark alike.
const TRACK_OFF = "color-mix(in srgb, var(--foreground) 14%, transparent)";

export type ToggleItem = {
  id: string;
  label: string;
  description?: string;
  defaultChecked?: boolean;
  /** Rows this one pauses while it's on, e.g. a focus mode muting alerts. */
  overrides?: string[];
};

const DEFAULT_ITEMS: ToggleItem[] = [
  { id: "push", label: "Push notifications", description: "Mentions and replies", defaultChecked: true },
  { id: "digest", label: "Weekly digest", description: "A summary every Monday" },
  { id: "sounds", label: "Sounds", description: "Play a chime on new messages", defaultChecked: true },
  { id: "focus", label: "Focus mode", description: "Pauses alerts and sounds", overrides: ["push", "sounds"] },
];

export type TactileTogglesProps = {
  title?: string;
  items?: ToggleItem[];
  /** Colour of the switch when on, and of the wash that crosses the row. */
  accent?: string;
  /** Sweep a faint tint across the row when a switch turns on. */
  wash?: boolean;
  /** How far the knob stretches while pressed, in px. */
  squish?: number;
  onChange?: (id: string, checked: boolean) => void;
  className?: string;
};

export function TactileToggles({
  title = "Notifications",
  items = DEFAULT_ITEMS,
  accent = "#22c55e",
  wash = true,
  squish = 6,
  onChange,
  className,
}: TactileTogglesProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((i) => [i.id, !!i.defaultChecked])),
  );
  const reduce = !!useReducedMotion();

  const set = (id: string, next: boolean) => {
    setChecked((c) => ({ ...c, [id]: next }));
    onChange?.(id, next);
  };
  const pausedBy = (id: string) => items.find((o) => o.overrides?.includes(id) && checked[o.id]);

  return (
    <div className={cn("w-full max-w-sm rounded-[22px] bg-muted p-1.5 edge-outer", className)}>
      <div className="px-3.5 pb-2.5 pt-2 text-sm font-medium text-muted-foreground">{title}</div>
      <div className="overflow-hidden rounded-2xl bg-background edge-inner">
        {items.map((item, i) => (
          <Row
            key={item.id}
            item={item}
            first={i === 0}
            checked={!!checked[item.id]}
            pausedBy={pausedBy(item.id)?.label}
            accent={accent}
            wash={wash && !reduce}
            squish={squish}
            onSet={(next) => set(item.id, next)}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  item,
  first,
  checked,
  pausedBy,
  accent,
  wash,
  squish,
  onSet,
}: {
  item: ToggleItem;
  first: boolean;
  checked: boolean;
  /** Label of the row pausing this one, if any. */
  pausedBy?: string;
  accent: string;
  wash: boolean;
  squish: number;
  onSet: (next: boolean) => void;
}) {
  // Pressing anywhere on the row squishes the knob, not just the switch.
  const [pressed, setPressed] = useState(false);
  // Bumped each time the switch turns on, so the wash replays from the start.
  // Turning off is the quiet direction and gets no wash.
  const [washes, setWashes] = useState(0);

  const paused = !!pausedBy;
  const descriptionId = useId();

  return (
    <label
      className={cn(
        "relative flex select-none items-center gap-4 px-4 py-3.5",
        paused ? "cursor-default" : "cursor-pointer",
        !first && "border-t border-border",
      )}
      onPointerDown={() => !paused && setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
    >
      {wash && washes > 0 && (
        <motion.span
          key={washes}
          aria-hidden
          className="pointer-events-none absolute inset-0 origin-right"
          style={{ background: `linear-gradient(to left, ${accent}, transparent)` }}
          initial={{ scaleX: 0, opacity: 0.16 }}
          animate={{ scaleX: 1, opacity: [0.16, 0.12, 0] }}
          transition={{ scaleX: { duration: 0.35, ease: [0.23, 1, 0.32, 1] }, opacity: { duration: 0.6, times: [0, 0.5, 1] } }}
        />
      )}

      <motion.span
        className="relative min-w-0 flex-1"
        initial={false}
        animate={{ opacity: paused ? 0.45 : 1 }}
        transition={{ duration: 0.2 }}
      >
        <span className="block text-[15px] font-medium text-foreground">{item.label}</span>
        <Crossfade id={paused ? "paused" : "description"} domId={descriptionId} className="mt-0.5 text-[13px] text-muted-foreground">
          {paused ? `Paused by ${pausedBy}` : item.description}
        </Crossfade>
      </motion.span>

      <TactileSwitch
        checked={checked}
        onCheckedChange={(next) => {
          if (next) setWashes((n) => n + 1);
          onSet(next);
        }}
        accent={accent}
        squish={squish}
        pressed={pressed}
        disabled={paused}
        aria-label={item.label}
        aria-describedby={descriptionId}
      />
    </label>
  );
}

export type TactileSwitchProps = {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  /** Track colour when on. */
  accent?: string;
  /** Knob colour. Set a dark one when the accent is pale, so the knob doesn't vanish into it. */
  knob?: string;
  /** How far the knob stretches while pressed, in px. */
  squish?: number;
  /** Holds the knob squished from outside, e.g. while its row is pressed. */
  pressed?: boolean;
  /** Keeps the knob where it is but drops the colour: remembered, not active. */
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
};

/** One switch from the list: squishes under the finger and drags like the real thing. */
export function TactileSwitch({
  checked,
  onCheckedChange,
  accent = "#22c55e",
  knob = "#fff",
  squish: squishProp = 6,
  pressed: pressedFromOutside = false,
  disabled = false,
  className,
  ...aria
}: TactileSwitchProps) {
  const reduce = !!useReducedMotion();
  const squish = reduce ? 0 : squishProp;
  const [pressedHere, setPressedHere] = useState(false);
  const pressed = !disabled && (pressedHere || pressedFromOutside);
  // Knob position while it's being dragged; null when it's at rest.
  const [dragX, setDragX] = useState<number | null>(null);
  const drag = useRef<{ startX: number; from: number; moved: boolean } | null>(null);
  // A drag ends in a click on the switch; that click must not flip it again.
  const swallowClick = useRef(false);

  const flip = (next: boolean) => {
    if (next !== checked) onCheckedChange(next);
  };

  // The knob grows toward the middle while pressed, so it stays pinned to
  // whichever end it rests on: on the right it has to shift left as it widens.
  const knobW = KNOB + (pressed ? squish : 0);
  const travel = TRACK_W - PAD * 2 - knobW;
  const knobX = dragX ?? (checked ? travel : 0);
  // Mid-drag the track already shows the side the knob will land on.
  const on = dragX === null ? checked : dragX > travel / 2;

  const release = () => {
    const d = drag.current;
    drag.current = null;
    setPressedHere(false);
    if (d?.moved && dragX !== null) {
      swallowClick.current = true;
      flip(dragX > travel / 2);
    }
    setDragX(null);
  };

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      {...aria}
      disabled={disabled}
      onClick={() => {
        if (swallowClick.current) {
          swallowClick.current = false;
          return;
        }
        flip(!checked);
      }}
      onPointerDown={(e) => {
        if (disabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setPressedHere(true);
        drag.current = { startX: e.clientX, from: checked ? TRACK_W - PAD * 2 - KNOB - squish : 0, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.startX;
        if (!d.moved && Math.abs(dx) < DRAG_SLOP) return;
        d.moved = true;
        setDragX(Math.min(travel, Math.max(0, d.from + dx)));
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={(e) => e.key === " " && setPressedHere(true)}
      onKeyUp={() => setPressedHere(false)}
      className={cn(
        "relative shrink-0 cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-default",
        className,
      )}
      style={{ width: TRACK_W, height: TRACK_H, padding: PAD }}
    >
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full"
        initial={false}
        animate={{ backgroundColor: on && !disabled ? accent : TRACK_OFF }}
        transition={{ duration: 0.2 }}
      />
      <motion.span
        aria-hidden
        className="relative block rounded-full shadow-[0_1px_3px_rgb(0_0_0/0.2),0_0_0_0.5px_rgb(0_0_0/0.06)] dark:shadow-[0_1px_3px_rgb(0_0_0/0.5)]"
        style={{ height: KNOB }}
        initial={false}
        animate={{ width: knobW, x: knobX, backgroundColor: knob }}
        // Under the finger the knob tracks exactly; let go and it springs home.
        transition={{ ...(reduce || dragX !== null ? INSTANT : SPRING), backgroundColor: { duration: 0.2 } }}
      />
    </motion.button>
  );
}

/** Text that crossfades in place when `id` changes. */
function Crossfade({ id, domId, className, children }: { id: string; domId?: string; className?: string; children: ReactNode }) {
  return (
    <span id={domId} className="grid">
      <AnimatePresence initial={false}>
        <motion.span
          key={id}
          className={cn("col-start-1 row-start-1 block", className)}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -3 }}
          transition={{ duration: 0.18 }}
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
