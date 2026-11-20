"use client";

// An email field with its button inside. Submitting shrinks the button to a
// spinner, then the whole field settles into a confirmation in the same
// footprint, so the page around it never moves. A thrown error shows under
// the field (out of flow, for the same reason) and the email stays put for
// another try.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId, useRef, useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const SPRING = { type: "spring", duration: 0.4, bounce: 0 } as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "loading" | "done";

export type WaitlistInputProps = {
  placeholder?: string;
  buttonLabel?: string;
  /** Shown once joined. `{email}` is replaced with the address. */
  successMessage?: string;
  /**
   * Called with the email. Return a promise to show the loading state;
   * throw (or reject) with a message to show it under the field.
   */
  onSubmit?: (email: string) => void | Promise<void>;
  /** Corner radius of the field in px. The button follows it. */
  radius?: number;
  className?: string;
};

export function WaitlistInput({
  placeholder = "you@company.com",
  buttonLabel = "Join waitlist",
  successMessage = "You're on the list. We'll write to {email}.",
  onSubmit,
  radius = 14,
  className,
}: WaitlistInputProps) {
  const reduce = useReducedMotion();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (status !== "idle") return;
    const value = email.trim();
    if (!EMAIL.test(value)) {
      setError("Enter a valid email address.");
      input.current?.focus();
      return;
    }
    setError(null);
    setStatus("loading");
    try {
      await onSubmit?.(value);
      setStatus("done");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : String(err || "Something went wrong. Try again."));
      input.current?.focus();
    }
  };

  const fade = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: 6, filter: "blur(4px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        exit: { opacity: 0, y: -6, filter: "blur(4px)" },
      };

  return (
    <form noValidate onSubmit={submit} className={cn("relative w-full max-w-sm", className)}>
      <div
        className={cn(
          "relative flex h-12 items-center bg-background p-1 transition-shadow duration-200",
          status === "done"
            ? "shadow-[inset_0_0_0_1px_var(--border)]"
            : error
              ? "shadow-[inset_0_0_0_1px_rgb(239_68_68/0.6),0_0_0_3px_rgb(239_68_68/0.12)]"
              : "shadow-[inset_0_0_0_1px_var(--border),0_1px_2px_rgb(0_0_0/0.04)] focus-within:shadow-[inset_0_0_0_1px_rgb(163_163_163),0_0_0_3px_rgb(163_163_163/0.18)]",
        )}
        style={{ borderRadius: radius }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {status === "done" ? (
            <motion.p
              key="done"
              role="status"
              {...fade}
              transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.05 }}
              className="flex min-w-0 flex-1 items-center gap-2.5 px-3 text-sm text-foreground"
            >
              <Check />
              <span className="truncate">{successMessage.replace("{email}", email.trim())}</span>
            </motion.p>
          ) : (
            <motion.div
              key="form"
              {...fade}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              className="flex min-w-0 flex-1 items-center gap-1"
            >
              <label htmlFor={id} className="sr-only">
                Email
              </label>
              <input
                ref={input}
                id={id}
                type="email"
                inputMode="email"
                autoComplete="email"
                spellCheck={false}
                placeholder={placeholder}
                value={email}
                readOnly={status === "loading"}
                aria-invalid={!!error || undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
              />
              <motion.button
                layout
                type="submit"
                disabled={status === "loading"}
                aria-busy={status === "loading"}
                transition={SPRING}
                whileTap={{ scale: 0.97 }}
                className="relative flex h-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden bg-foreground px-4 text-sm font-medium text-background outline-none transition-colors duration-150 hover:bg-foreground/90 focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-default"
                style={{ borderRadius: Math.max(0, radius - 4) }}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {status === "loading" ? (
                    <motion.span
                      key="spin"
                      initial={{ opacity: 0, scale: 0.6 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.6 }}
                      transition={{ duration: 0.2, ease: EASE_OUT }}
                      className="block"
                    >
                      <Spinner />
                      <span className="sr-only">Joining</span>
                    </motion.span>
                  ) : (
                    <motion.span
                      key="label"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="block whitespace-nowrap"
                    >
                      {buttonLabel}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            id={`${id}-error`}
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
            // Out of flow, so the page below never shifts when it appears.
            className="absolute inset-x-0 top-full px-1 pt-2 text-[13px] text-red-600 dark:text-red-400"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}

// A filled circle whose tick draws in after it appears.
function Check() {
  return (
    <motion.svg
      aria-hidden
      width={18}
      height={18}
      viewBox="0 0 18 18"
      className="shrink-0"
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.1 }}
    >
      <circle cx={9} cy={9} r={9} className="fill-foreground" />
      <motion.path
        d="M5.5 9.2 7.8 11.5 12.5 6.5"
        fill="none"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-background"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.25 }}
      />
    </motion.svg>
  );
}

function Spinner() {
  return (
    <svg aria-hidden width={16} height={16} viewBox="0 0 16 16" fill="none" className="animate-spin">
      <circle cx={8} cy={8} r={6.25} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1.5} />
      <path d="M14.25 8A6.25 6.25 0 0 0 8 1.75" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}
