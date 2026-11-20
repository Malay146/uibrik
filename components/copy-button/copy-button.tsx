"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const SIZES = {
  sm: { height: 32, padX: 10, font: 13, icon: 16 },
  md: { height: 40, padX: 13, font: 14, icon: 18 },
  lg: { height: 48, padX: 16, font: 15, icon: 20 },
} as const;

// Neutral looks shared by the library's quiet buttons.
const VARIANTS = {
  soft: "bg-muted hover:bg-neutral-200/70 dark:hover:bg-neutral-800",
  ghost: "bg-transparent hover:bg-muted",
  outline: "bg-background shadow-[inset_0_0_0_1px_var(--border)] hover:bg-muted",
} as const;

export type CopyButtonProps = {
  /** Text written to the clipboard. */
  text?: string;
  label?: string;
  /** Shown once the text is copied. */
  copiedLabel?: string;
  /** Icon and label, or the icon alone (the label stays as its accessible name). */
  display?: "label" | "icon";
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  /** Colour the copied state's check and label, instead of keeping them neutral. */
  tintSuccess?: boolean;
  /** Colour of the copied state when tinted. */
  successColor?: string;
  /** Seconds before the button returns to its resting state. */
  resetAfter?: number;
  /** Corner radius in px. */
  radius?: number;
  /** Called after a successful copy. */
  onCopy?: (text: string) => void;
  className?: string;
};

// Clipboard API first; the textarea fallback covers insecure origins and
// embeds without clipboard permission.
async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

export function CopyButton({
  text = "npm install motion",
  label = "Copy",
  copiedLabel = "Copied",
  display = "label",
  variant = "soft",
  size = "md",
  tintSuccess = false,
  successColor = "#16a34a",
  resetAfter = 1.5,
  radius = 12,
  onCopy,
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The button eases between the two label widths instead of snapping.
  const [ref, { width }] = useMeasure();

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    if (!(await writeClipboard(text))) return;
    setCopied(true);
    onCopy?.(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), resetAfter * 1000);
  };

  const current = copied ? copiedLabel : label;
  const s = SIZES[size];
  const iconOnly = display === "icon";

  return (
    <motion.button
      type="button"
      onClick={copy}
      aria-label={iconOnly ? current : undefined}
      whileTap={{ scale: 0.96 }}
      animate={{ width: width || "auto" }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      style={{
        height: s.height,
        fontSize: s.font,
        borderRadius: radius,
        color: copied && tintSuccess ? successColor : undefined,
      }}
      className={cn(
        "relative cursor-pointer overflow-hidden font-medium tracking-tight text-foreground outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        VARIANTS[variant],
        className,
      )}
    >
      <span
        ref={ref}
        className="flex h-full w-max items-center gap-1.5"
        // Icon-only is a square: the icon centred in the button's height.
        style={iconOnly ? { width: s.height, justifyContent: "center" } : { paddingLeft: s.padX - 1, paddingRight: s.padX }}
      >
        <CopyIcon copied={copied} size={s.icon} />
        {!iconOnly && (
          // Clipped to one line, so the outgoing label rolls up and out of
          // view while the next one rolls in underneath it.
          <span className="relative overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={current}
                initial={{ y: "100%", opacity: 0, filter: "blur(2px)" }}
                animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                exit={{ y: "-100%", opacity: 0, filter: "blur(2px)" }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="block whitespace-nowrap"
              >
                {current}
              </motion.span>
            </AnimatePresence>
          </span>
        )}
      </span>
      <span aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ""}
      </span>
    </motion.button>
  );
}

// x and y here are transforms (offsets from the drawn position), not the rect
// attributes. The back sheet slides onto the front one, both fold away, and a check draws
// in where they met, so the icon explains what just happened.
function CopyIcon({ copied, size }: { copied: boolean; size: number }) {
  const t = { duration: 0.25, ease: EASE_OUT };
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 overflow-visible"
    >
      {/* Only the back sheet's exposed corner is drawn, so it never crosses the front one. */}
      <motion.path
        d="M16 8V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h2"
        initial={false}
        animate={copied ? { x: 5, y: 5, opacity: 0 } : { x: 0, y: 0, opacity: 0.5 }}
        transition={t}
      />
      <motion.rect
        x={8}
        y={8}
        width={13}
        height={13}
        rx={3}
        initial={false}
        animate={copied ? { x: -2.5, y: -2.5, opacity: 0, scale: 0.6 } : { x: 0, y: 0, opacity: 1, scale: 1 }}
        transition={t}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
      <motion.path
        d="M5.5 12.5l4.5 4.5 8.5-10"
        initial={false}
        animate={copied ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
        transition={copied ? { duration: 0.3, ease: EASE_OUT, delay: 0.12 } : { duration: 0.15 }}
      />
    </svg>
  );
}
