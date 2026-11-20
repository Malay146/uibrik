"use client";

import { IconArrowsUpDown } from "@tabler/icons-react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  type AnimationPlaybackControls,
  type MotionStyle,
  type MotionValue,
} from "motion/react";
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";

export type SwapFieldsProps = {
  /** The two fields, in slot order. Each travels with its own content. */
  children: [ReactNode, ReactNode];
  /** Labels that belong to the slots, not the fields: they hand over mid-flight. */
  labels?: [string, string];
  /** A tint for each field, in the same order as children. It travels with the field. Empty stays neutral. */
  accents?: [string, string];
  /** Stack the fields or set them side by side. Side by side drops to a stack in narrow containers. */
  orientation?: "vertical" | "horizontal";
  /** Half-width of the ellipse the fields orbit on, in px. Narrow rows swing less. 0 slides them straight past each other. */
  arc?: number;
  /** Length of one swap in seconds. */
  duration?: number;
  /** Corner radius of each field in px. */
  radius?: number;
  /** Controlled: whether the fields are swapped. */
  swapped?: boolean;
  /** Swapped on mount when uncontrolled. */
  defaultSwapped?: boolean;
  onSwappedChange?: (swapped: boolean) => void;
  /** Accessible name for the swap button. */
  buttonLabel?: string;
  className?: string;
};

export function SwapFields({
  children,
  labels = ["From", "To"],
  accents,
  orientation = "vertical",
  arc = 88,
  duration = 0.6,
  radius = 28,
  swapped: swappedProp,
  defaultSwapped = false,
  onSwappedChange,
  buttonLabel = "Swap",
  className,
}: SwapFieldsProps) {
  const reduce = useReducedMotion();
  const [inner, setInner] = useState(defaultSwapped);
  const swapped = swappedProp ?? inner;

  // `order` is what the DOM shows; flights run between two orders and commit
  // at the end, so tab order and screen readers always match what is seen.
  const [order, setOrder] = useState(swapped);
  const [turns, setTurns] = useState(0);
  // One value drives the whole flight. Reversing a swap mid-air animates it
  // back toward 0 and keeps its velocity, so nothing jumps.
  const progress = useMotionValue(0);
  // The order the fields' styles are computed for. It flips with progress
  // jumping back to 0, ahead of the DOM swap, so the render that swaps the
  // DOM already reads resting styles for the new order.
  const styled = useMotionValue(order);
  const path = useMotionValue<Path>(STILL);
  const flight = useRef<AnimationPlaybackControls | null>(null);
  const flightId = useRef(0);
  const row = useRef<HTMLDivElement>(null);
  const target = useRef(swapped);
  // The order the DOM holds right now. `fly` reads it here, not from its
  // closure, since the controlled effect can call it from a stale render.
  const shown = useRef(order);

  const fly = (to: boolean) => {
    target.current = to;
    setTurns((t) => t + 1);
    flight.current?.stop();
    if (reduce) {
      flightId.current += 1;
      progress.jump(0);
      setOrder(to);
      return;
    }
    const goal = to === shown.current ? 0 : 1;
    // Layout boxes ignore transforms, so this is right even mid-flight.
    // DOM order is slot order, so the fields are read straight from the row.
    const [a, b] = row.current?.querySelectorAll<HTMLElement>(":scope > [data-swap-field]") ?? [];
    if (a && b) {
      const ax = a.offsetLeft, ay = a.offsetTop, bx = b.offsetLeft, by = b.offsetTop;
      const vx = bx - ax, vy = by - ay;
      const len = Math.hypot(vx, vy) || 1;
      path.jump({
        // Each field lands exactly on the box the other leaves, even when
        // their sizes differ: the first one's far edge meets the second's.
        a: [bx + b.offsetWidth - a.offsetWidth - ax, by + b.offsetHeight - a.offsetHeight - ay],
        b: [ax - bx, ay - by],
        n: [-vy / len, vx / len],
        // On a narrow screen the swing shrinks so the fields stay on the page.
        arc: Math.min(arc, (row.current?.clientWidth ?? 0) * 0.22),
      });
    }
    // Keep momentum only when it already heads to the goal. Carried the
    // other way it pushes progress past 0 or 1, where the arc flips side.
    const v = progress.getVelocity();
    const self = (flightId.current += 1);
    flight.current = animate(progress, goal, {
      type: "spring",
      duration,
      bounce: 0,
      velocity: Math.sign(v) === Math.sign(goal - progress.get()) ? v : 0,
      onComplete: () => {
        // A stopped flight can still report completion; only the latest counts.
        if (goal !== 1 || self !== flightId.current) return;
        // Styles first, then the DOM, in one synchronous step: no frame can
        // show either one without the other, and no click can land between.
        shown.current = to;
        styled.set(to);
        progress.jump(0);
        flushSync(() => setOrder(to));
      },
    });
  };

  // Covers the swaps that skip the flight (reduced motion). After a flight
  // these already hold, so nothing moves.
  useLayoutEffect(() => {
    shown.current = order;
    styled.set(order);
    progress.jump(0);
  }, [order, progress, styled]);

  // Follow a controlled value, whoever changed it.
  useEffect(() => {
    if (swappedProp !== undefined && swappedProp !== target.current) fly(swappedProp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swappedProp]);

  const toggle = () => {
    const next = !swapped;
    if (swappedProp === undefined) {
      setInner(next);
      fly(next);
    }
    onSwappedChange?.(next);
  };

  const keys = order ? [1, 0] : [0, 1];
  const horizontal = orientation === "horizontal";

  // The gap between the fields doubles as the button's anchor, so it stays on
  // the seam when one field grows taller than the other. It keeps its key as
  // the fields trade places around it, so focus stays on the button.
  const seam = (
    <div key="seam" className={cn("relative z-20 h-1.5 shrink-0", horizontal && "@min-[30rem]:h-auto @min-[30rem]:w-1.5")}>
      <motion.button
        type="button"
        aria-label={buttonLabel}
        onClick={toggle}
        whileHover={reduce ? undefined : { scale: 1.06 }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: "spring", duration: 0.3, bounce: 0 }}
        className="absolute left-1/2 top-1/2 -ml-[22px] -mt-[22px] grid size-11 cursor-pointer place-items-center rounded-full bg-foreground text-background shadow-[0_0_0_5px_var(--background)] outline-none transition-colors duration-150 hover:bg-foreground/85 focus-visible:shadow-[0_0_0_5px_var(--background),0_0_0_8px_color-mix(in_oklab,var(--foreground)_18%,transparent)]"
      >
        <span className={cn("grid place-items-center", horizontal && "@min-[30rem]:rotate-90")}>
          <motion.span
            initial={false}
            animate={{ rotate: turns * 180 }}
            transition={reduce ? { duration: 0 } : { type: "spring", duration, bounce: 0 }}
            className="grid place-items-center"
          >
            <IconArrowsUpDown size={18} stroke={2} />
          </motion.span>
        </span>
      </motion.button>
    </div>
  );

  return (
    <div className={cn("@container w-full", className)}>
      <div ref={row} className={cn("relative flex flex-col", horizontal && "@min-[30rem]:flex-row")}>
        {keys.map((key, slot) => (
          <Field
            key={key}
            index={key}
            styled={styled}
            progress={progress}
            path={path}
            label={labels[slot]}
            nextLabel={labels[1 - slot]}
            accent={accents?.[key]}
            radius={radius}
          >
            {children[key]}
          </Field>
        )).flatMap((f, slot) => (slot === 0 ? [f, seam] : [f]))}
      </div>
    </div>
  );
}

/** Where each slot's field travels in one swap, and which way is "out". */
type Path = { a: [number, number]; b: [number, number]; n: [number, number]; arc: number };
const STILL: Path = { a: [0, 0], b: [0, 0], n: [0, 0], arc: 0 };

type FieldProps = {
  /** Which child this field holds, so it can tell its slot from `styled`. */
  index: number;
  styled: MotionValue<boolean>;
  progress: MotionValue<number>;
  path: MotionValue<Path>;
  label: string;
  nextLabel: string;
  accent?: string;
  radius: number;
  children: ReactNode;
};

// Clamped, so a spring settling a hair past either end never swings the
// field out on the wrong side.
const clamp = (p: number) => Math.min(1, Math.max(0, p));
const lift = (p: number) => Math.sin(clamp(p) * Math.PI);
const ramp = (p: number, from: number, to: number) => clamp((p - from) / (to - from));

function Field({ index, styled, progress, path, label, nextLabel, accent, radius, children }: FieldProps) {
  const id = useId();
  // Which way this field travels: the one in the first slot goes +1. Read
  // from a motion value, not a prop, so it flips with the reset and never a
  // render later.
  const sideOf = () => ((styled.get() ? 1 - index : index) === 0 ? 1 : -1);

  // The two fields orbit their shared centre on one ellipse: the gap between
  // them is its long axis and `arc` its half-width. Each takes an opposite
  // half, one out to the left and one out to the right, like a card shuffle.
  const offset = (axis: 0 | 1) => {
    const a = clamp(progress.get()) * Math.PI;
    const d = sideOf();
    const p = path.get();
    const move = d > 0 ? p.a : p.b;
    const along = (1 - Math.cos(a)) / 2;
    const out = Math.sin(a) * p.arc * d;
    return along * move[axis] + out * p.n[axis];
  };
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useMotionValue(0);
  const scale = useMotionValue(1);
  const opacity = useMotionValue(1);
  const zIndex = useMotionValue(sideOf() > 0 ? 10 : 0);
  const labelOut = useMotionValue(1);
  const labelIn = useMotionValue(0);
  const labelOutY = useMotionValue(0);
  const labelInY = useMotionValue(5);

  // Every style is set the moment its inputs change, not on Motion's next
  // frame (as useTransform would). When the swap commits, React re-renders
  // and Motion re-applies each element's latest values straight away; lazy
  // values would still hold the end of the flight there, throwing both
  // fields past their new slots for one frame.
  useLayoutEffect(() => {
    const apply = () => {
      const p = progress.get();
      const d = sideOf();
      const l = lift(p);
      x.set(offset(0));
      y.set(offset(1));
      // Both fields read as travelling: each tilts into its own curve, and
      // depth stays a hint (the back one only a touch smaller and lighter),
      // so neither swing gets lost behind the other.
      rotate.set(-d * l * 2.5);
      scale.set(1 + d * l * 0.015);
      opacity.set(d > 0 ? 1 : 1 - l * 0.12);
      zIndex.set(d > 0 ? 10 : 0);
      const out = ramp(p, 0.25, 0.6);
      const into = ramp(p, 0.4, 0.75);
      labelOut.set(1 - out);
      labelOutY.set(-5 * out);
      labelIn.set(into);
      labelInY.set(5 - 5 * into);
    };
    apply();
    const off = [progress, styled, path].map((v) => v.on("change", apply));
    return () => off.forEach((o) => o());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A quiet fill with no outline anywhere. Both steps mix the text colour into
  // the page, so they hold up in light and dark, and anything set on the page
  // colour inside a field (a currency chip) stays clear of it. Focus deepens
  // the fill a step rather than adding a ring.
  const ink = accent ?? "var(--foreground)";
  const tint = {
    "--fill": `color-mix(in oklab, ${ink} ${accent ? 8 : 4}%, var(--background))`,
    "--fill-focus": `color-mix(in oklab, ${ink} ${accent ? 13 : 7}%, var(--background))`,
  };

  return (
    <motion.div
      data-swap-field
      style={{ x, y, rotate, scale, opacity, zIndex, borderRadius: radius, ...tint } as MotionStyle}
      className="relative min-w-0 flex-1 bg-(--fill) transition-colors duration-200 has-focus-visible:bg-(--fill-focus)"
    >
      <label htmlFor={id} className="block cursor-text px-6 pb-[22px] pt-5">
        <span className="relative block h-4 text-[13px] font-medium leading-4 text-muted-foreground">
          <motion.span style={{ opacity: labelOut, y: labelOutY }} className="absolute inset-0">
            {label}
          </motion.span>
          <motion.span aria-hidden style={{ opacity: labelIn, y: labelInY }} className="absolute inset-0">
            {nextLabel}
          </motion.span>
        </span>
        <FieldId.Provider value={id}>{children}</FieldId.Provider>
      </label>
    </motion.div>
  );
}

const FieldId = createContext<string | undefined>(undefined);

/** A bare input styled for a swap field. Picks up the field's label on its own. */
export const SwapFieldInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function SwapFieldInput({ className, ...props }, ref) {
    const id = useContext(FieldId);
    return (
      <input
        ref={ref}
        id={id}
        {...props}
        className={cn(
          "mt-1.5 block w-full min-w-0 truncate bg-transparent text-base font-medium tracking-tight text-foreground outline-none placeholder:text-muted-foreground/70",
          className,
        )}
      />
    );
  },
);
