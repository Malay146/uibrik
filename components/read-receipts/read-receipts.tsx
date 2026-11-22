"use client";

import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export type ReceiptStatus = "sending" | "sent" | "delivered" | "read";

const ORDER: ReceiptStatus[] = ["sending", "sent", "delivered", "read"];

const LABELS: Record<ReceiptStatus, string> = {
  sending: "Sending",
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
};

export type ReadReceiptsProps = {
  /** The message in the bubble. */
  message?: string;
  /** Time shown beside the ticks. */
  time?: string;
  /** Controlled status. */
  status?: ReceiptStatus;
  /** Status on mount when uncontrolled. */
  defaultStatus?: ReceiptStatus;
  /** Step through sending, sent, delivered and read on its own when uncontrolled. Click the bubble to play it again. */
  simulate?: boolean;
  /** Seconds between steps while simulating. */
  stepDelay?: number;
  /** Colour of the ticks once read. */
  readColor?: string;
  /** Show the status word under the bubble. */
  showLabel?: boolean;
  /** Corner radius of the bubble in px. */
  radius?: number;
  onStatusChange?: (status: ReceiptStatus) => void;
  className?: string;
};

export function ReadReceipts({
  message = "On my way, see you at the station.",
  time = "9:41",
  status: statusProp,
  defaultStatus = "sending",
  simulate = true,
  stepDelay = 0.9,
  readColor = "#2f7cf6",
  showLabel = true,
  radius = 20,
  onStatusChange,
  className,
}: ReadReceiptsProps) {
  const [inner, setInner] = useState<ReceiptStatus>(defaultStatus);
  const [run, setRun] = useState(0);
  const status = statusProp ?? inner;
  const controlled = statusProp !== undefined;
  const onChange = useRef(onStatusChange);
  useEffect(() => {
    onChange.current = onStatusChange;
  });

  // Uncontrolled: walk the steps one at a time from where it starts.
  useEffect(() => {
    if (controlled || !simulate) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const start = run === 0 ? ORDER.indexOf(defaultStatus) : 0;
    for (let i = start + 1; i < ORDER.length; i++) {
      timers.push(
        setTimeout(() => {
          setInner(ORDER[i]);
          onChange.current?.(ORDER[i]);
        }, (i - start) * stepDelay * 1000),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [controlled, simulate, stepDelay, defaultStatus, run]);

  const replay = () => {
    if (controlled || !simulate) return;
    setInner("sending");
    onStatusChange?.("sending");
    setRun((r) => r + 1);
  };

  return (
    <div className={cn("flex w-full max-w-[320px] flex-col items-end gap-1.5", className)}>
      <button
        type="button"
        onClick={replay}
        aria-label={`${message}. ${LABELS[status]} ${time}`}
        tabIndex={!controlled && simulate ? 0 : -1}
        className="max-w-full cursor-default rounded-[var(--r)] rounded-br-md bg-neutral-100 px-3.5 pb-2 pt-2.5 text-left text-[15px] leading-snug tracking-tight text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:bg-neutral-900 dark:text-neutral-100"
        style={{ ["--r" as string]: `${radius}px` }}
      >
        <span>{message}</span>
        {/* Sits on the last line's end, like the time in any messenger. */}
        <span className="float-right ml-3 mt-1.5 flex translate-y-0.5 items-center gap-1 text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
          {time}
          <Ticks status={status} readColor={readColor} />
        </span>
      </button>
      {showLabel && <StatusLabel status={status} />}
    </div>
  );
}

function Ticks({ status, readColor }: { status: ReceiptStatus; readColor: string }) {
  const reduce = useReducedMotion();
  const step = ORDER.indexOf(status);
  const draw = (on: boolean, delay = 0) => ({
    initial: false as const,
    animate: { pathLength: on ? 1 : 0, opacity: on ? 1 : 0 },
    transition: reduce
      ? { duration: 0 }
      : { pathLength: { duration: 0.28, ease: EASE_OUT, delay }, opacity: { duration: 0.08, delay } },
  });

  return (
    <span className="relative inline-flex h-3 w-[18px] items-center justify-center">
      <AnimatePresence initial={false}>
        {status === "sending" && (
          <motion.svg
            key="clock"
            viewBox="0 0 14 14"
            className="absolute size-[13px]"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5, rotate: 45 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* A small wall clock: face, a fixed hour hand and a sweeping minute hand. */}
            <circle cx="7" cy="7" r="5.6" />
            <path d="M7 7 L7 4.7" />
            <ClockHand reduce={!!reduce} />
            <circle cx="7" cy="7" r="0.7" fill="currentColor" stroke="none" />
          </motion.svg>
        )}
      </AnimatePresence>
      <motion.svg
        viewBox="0 0 18 12"
        className="absolute h-3 w-[18px]"
        fill="none"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ stroke: step === 3 ? readColor : "currentColor" }}
        transition={{ duration: reduce ? 0 : 0.3, ease: EASE_OUT }}
      >
        <motion.path d="M1.5 6.4 L4.6 9.5 L10.6 2.5" {...draw(step >= 1, 0.06)} />
        <motion.path d="M7.6 8.8 L8.3 9.5 L14.3 2.5" {...draw(step >= 2)} />
      </motion.svg>
    </span>
  );
}

function StatusLabel({ status }: { status: ReceiptStatus }) {
  return (
    <span className="relative h-4 overflow-hidden pr-1 text-xs font-medium tracking-tight text-neutral-500 dark:text-neutral-400" aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={status}
          className="block whitespace-nowrap"
          initial={{ y: "100%", opacity: 0, filter: "blur(2px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
          exit={{ y: "-100%", opacity: 0, filter: "blur(2px)" }}
          transition={{ duration: 0.28, ease: EASE_OUT }}
        >
          {LABELS[status]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// One sweep per second, like a clock that's waiting. Started from an effect:
// inside AnimatePresence initial={false} an animate prop would never loop.
function ClockHand({ reduce }: { reduce: boolean }) {
  const controls = useAnimationControls();
  useEffect(() => {
    if (reduce) return;
    controls.start({ rotate: [90, 450], transition: { duration: 1.2, ease: "linear", repeat: Infinity } });
    return () => controls.stop();
  }, [controls, reduce]);
  return <motion.path d="M7 7 L7 3.6" style={{ originX: "7px", originY: "7px", transformBox: "view-box" }} animate={controls} />;
}
