"use client";

import NumberFlow from "@number-flow/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const SIZES = {
  sm: { height: 32, padX: 12, font: 13, icon: 14 },
  md: { height: 40, padX: 15, font: 14, icon: 16 },
  lg: { height: 48, padX: 18, font: 15, icon: 18 },
} as const;

export type FollowButtonProps = {
  /** Controlled state. */
  following?: boolean;
  /** State on mount when uncontrolled. */
  defaultFollowing?: boolean;
  onFollowingChange?: (following: boolean) => void;
  label?: string;
  followingLabel?: string;
  /** Shown while hovering a followed button, as a warning before unfollowing. */
  unfollowLabel?: string;
  /** Followers besides you, shown beside the button; it ticks up by one while you follow. Leave out to hide. */
  count?: number;
  /** Word after the count. */
  countLabel?: string;
  /** Colour of the unfollow warning. */
  dangerColor?: string;
  size?: keyof typeof SIZES;
  className?: string;
};

type Face = "follow" | "following" | "unfollow";

export function FollowButton({
  following: followingProp,
  defaultFollowing = false,
  onFollowingChange,
  label = "Follow",
  followingLabel = "Following",
  unfollowLabel = "Unfollow",
  count,
  countLabel = "followers",
  dangerColor = "#dc2626",
  size = "md",
  className,
}: FollowButtonProps) {
  const reduce = useReducedMotion();
  const [inner, setInner] = useState(defaultFollowing);
  const following = followingProp ?? inner;
  const [hover, setHover] = useState(false);
  // Hover only turns into Unfollow after the pointer has left once, so the
  // button doesn't threaten to undo the follow you just clicked.
  const [armed, setArmed] = useState(false);
  const [ref, { width }] = useMeasure();
  const s = SIZES[size];

  const face: Face = !following ? "follow" : hover && armed ? "unfollow" : "following";
  const text = face === "follow" ? label : face === "following" ? followingLabel : unfollowLabel;

  const toggle = () => {
    const next = !following;
    if (followingProp === undefined) setInner(next);
    setArmed(false);
    onFollowingChange?.(next);
  };

  const shown = count === undefined ? undefined : count + (following ? 1 : 0);

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <motion.button
        type="button"
        aria-pressed={following}
        onClick={toggle}
        onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
        onPointerLeave={() => {
          setHover(false);
          setArmed(true);
        }}
        whileTap={{ scale: 0.96 }}
        initial={false}
        animate={{ width: width || "auto" }}
        transition={{ duration: reduce ? 0 : 0.3, ease: EASE_OUT }}
        style={{
          height: s.height,
          fontSize: s.font,
          color: face === "unfollow" ? dangerColor : undefined,
          backgroundColor: face === "unfollow" ? `color-mix(in srgb, ${dangerColor} 10%, transparent)` : undefined,
        }}
        className={cn(
          "relative cursor-pointer overflow-hidden rounded-full font-medium tracking-tight outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          following
            ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100"
            : "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200",
        )}
      >
        <span ref={ref} className="flex h-full w-max items-center gap-1.5" style={{ paddingLeft: s.padX - 2, paddingRight: s.padX }}>
          <Glyph face={face} size={s.icon} />
          <span className="relative overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={text}
                className="block whitespace-nowrap"
                initial={{ y: "100%", opacity: 0, filter: "blur(2px)" }}
                animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                exit={{ y: "-100%", opacity: 0, filter: "blur(2px)" }}
                transition={{ duration: reduce ? 0 : 0.28, ease: EASE_OUT }}
              >
                {text}
              </motion.span>
            </AnimatePresence>
          </span>
        </span>
      </motion.button>
      {shown !== undefined && (
        <span className="text-sm tracking-tight text-neutral-500 tabular-nums dark:text-neutral-400">
          <NumberFlow value={shown} className="font-medium text-neutral-900 dark:text-neutral-100" />{" "}
          {countLabel}
        </span>
      )}
    </div>
  );
}

// A person with a badge: the plus fades out as a check draws in, and while
// hovering a followed button the plus comes back turned 45° into a cross.
function Glyph({ face, size }: { face: Face; size: number }) {
  const reduce = useReducedMotion();
  const t = { duration: reduce ? 0 : 0.3, ease: EASE_OUT };
  const plus = face !== "following";
  return (
    <svg viewBox="0 0 24 24" width={size + 2} height={size + 2} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="10" cy="7.5" r="3.6" />
      <path d="M3.5 20.5v-1.2a4.6 4.6 0 0 1 4.6 -4.6h3.6" />
      <motion.g
        style={{ originX: "18.5px", originY: "17.5px", transformBox: "view-box" }}
        initial={false}
        animate={{ rotate: face === "unfollow" ? 45 : 0, opacity: plus ? 1 : 0, scale: plus ? 1 : 0.5 }}
        transition={t}
      >
        <path d="M18.5 14v7" />
        <path d="M15 17.5h7" />
      </motion.g>
      <motion.path
        d="M15 17.6l2.4 2.4l4.4 -4.6"
        initial={false}
        animate={{ pathLength: plus ? 0 : 1, opacity: plus ? 0 : 1 }}
        transition={{ pathLength: { ...t, delay: plus || reduce ? 0 : 0.1 }, opacity: { duration: reduce ? 0 : 0.05, delay: plus || reduce ? 0 : 0.1 } }}
      />
    </svg>
  );
}
