"use client";

import { IconAlertTriangleFilled, IconCheck, IconCircleDashed, IconEye, IconPlayerPauseFilled } from "@tabler/icons-react";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export type StatusIcon = "dot" | "pulse" | "spinner" | ReactNode;

export type StatusDef = {
  label: string;
  color: string;
  /** "dot", "pulse" (a live dot), "spinner", or any icon. */
  icon?: StatusIcon;
  /** Shake once on arrival, for failures. */
  shake?: boolean;
};

export const DEFAULT_STATUSES = {
  draft: { label: "Draft", color: "#737373", icon: <IconCircleDashed /> },
  review: { label: "In review", color: "#8b5cf6", icon: <IconEye /> },
  building: { label: "Building", color: "#2f7cf6", icon: "spinner" },
  live: { label: "Live", color: "#16a35a", icon: "pulse" },
  done: { label: "Done", color: "#16a35a", icon: <IconCheck /> },
  paused: { label: "Paused", color: "#e8890c", icon: <IconPlayerPauseFilled /> },
  failed: { label: "Failed", color: "#dc2626", icon: <IconAlertTriangleFilled />, shake: true },
} satisfies Record<string, StatusDef>;

export type StatusBadgeProps<K extends string = keyof typeof DEFAULT_STATUSES> = {
  /** Key of the status to show. */
  status: K;
  /** Your own statuses; defaults to draft, review, building, live, done, paused and failed. */
  statuses?: Record<K, StatusDef>;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = {
  sm: { h: 22, px: 8, gap: 5, icon: 12, text: "text-xs" },
  md: { h: 28, px: 10, gap: 6, icon: 14, text: "text-[13px]" },
  lg: { h: 34, px: 13, gap: 7, icon: 16, text: "text-sm" },
};

function Glyph({ icon, size, reduce }: { icon: StatusIcon; size: number; reduce: boolean }) {
  if (icon === "dot" || icon === "pulse") {
    const d = Math.round(size * 0.5);
    return (
      <span className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        {icon === "pulse" && !reduce && (
          <motion.span
            className="absolute rounded-full bg-current"
            style={{ width: d, height: d }}
            animate={{ scale: [1, 2.6], opacity: [0.45, 0] }}
            transition={{ duration: 1.6, ease: "easeOut", repeat: Infinity }}
          />
        )}
        <span className="relative rounded-full bg-current" style={{ width: d, height: d }} />
      </span>
    );
  }
  if (icon === "spinner") {
    return (
      <motion.svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        animate={reduce ? undefined : { rotate: 360 }}
        transition={{ duration: 0.9, ease: "linear", repeat: Infinity }}
      >
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2} />
        <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </motion.svg>
    );
  }
  return (
    <span className="flex items-center justify-center [&>svg]:size-full [&>svg]:stroke-[2.25]" style={{ width: size, height: size }}>
      {icon}
    </span>
  );
}

/**
 * One pill that moves between statuses instead of being swapped out: the tint
 * eases to the new colour, the icon turns in, the label rolls, and the pill
 * glides to its new width. Failures shake once.
 */
export function StatusBadge<K extends string = keyof typeof DEFAULT_STATUSES>({ status, statuses, size = "md", className }: StatusBadgeProps<K>) {
  const reduce = !!useReducedMotion();
  const all = (statuses ?? DEFAULT_STATUSES) as Record<string, StatusDef>;
  const s = all[status] ?? { label: String(status), color: "#737373", icon: "dot" };
  const z = SIZES[size];
  const [ref, bounds] = useMeasure();
  const shake = useAnimationControls();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    if (s.shake) shake.start({ x: [0, -4, 4, -3, 3, 0], transition: { duration: 0.4, ease: "easeInOut", delay: 0.1 } });
    else shake.start({ scale: [1, 1.05, 1], transition: { duration: 0.35, ease: EASE_OUT } });
    // Only when the status changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <motion.span
      animate={shake}
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex select-none items-center overflow-hidden rounded-full font-medium tracking-tight transition-[background-color,color] duration-300 ease-out",
        "bg-[color-mix(in_oklab,var(--sb)_13%,transparent)] text-[color-mix(in_oklab,var(--sb)_82%,black)] dark:bg-[color-mix(in_oklab,var(--sb)_20%,transparent)] dark:text-[color-mix(in_oklab,var(--sb)_68%,white)]",
        z.text,
        className,
      )}
      style={{ "--sb": s.color, height: z.h } as CSSProperties}
    >
      {/* Eases to the width of the new content, so neighbours move smoothly. */}
      <motion.span
        className="relative flex h-full items-center"
        initial={false}
        animate={{ width: bounds.width || "auto" }}
        transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.4, bounce: 0.1 }}
      >
        <span ref={ref} className="flex h-full shrink-0 items-center whitespace-nowrap" style={{ paddingInline: z.px, gap: z.gap }}>
          <span className="relative flex" style={{ width: z.icon, height: z.icon }}>
            <AnimatePresence initial={false}>
              <motion.span
                key={String(status)}
                className="absolute inset-0 flex"
                initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
                transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.4, bounce: 0.25 }}
              >
                <Glyph icon={s.icon ?? "dot"} size={z.icon} reduce={reduce} />
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="relative flex h-full items-center">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={String(status)}
                className="block"
                initial={{ y: "70%", opacity: 0, filter: "blur(2px)" }}
                animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                exit={{ y: "-70%", opacity: 0, filter: "blur(2px)" }}
                transition={{ duration: reduce ? 0 : 0.26, ease: EASE_OUT }}
              >
                {s.label}
              </motion.span>
            </AnimatePresence>
          </span>
        </span>
      </motion.span>
    </motion.span>
  );
}
