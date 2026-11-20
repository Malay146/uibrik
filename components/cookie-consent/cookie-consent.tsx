"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";

// Cookie consent. The card slides up a moment after the page loads, unless
// the visitor has already chosen. "Customize" grows the card in place to show
// each category with its own switch, rows easing in one after another, and
// the buttons change to fit. The choice is saved to localStorage and passed
// to `onConsent`; reopening the card later (open it yourself, e.g. from a
// footer link) goes straight to the categories with the saved choice.

export type CookieCategory = {
  id: string;
  label: string;
  description?: string;
  /** Always on and can't be switched off, e.g. strictly necessary cookies. */
  required?: boolean;
  /** Switched on before the visitor changes anything. Default false. */
  defaultOn?: boolean;
};

export type CookiePreferences = Record<string, boolean>;

export type CookieConsentProps = {
  /** Shown (controlled). Pair with `onOpenChange`. Uncontrolled, it shows itself when there's no saved choice. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Called with every category's state once the visitor chooses. */
  onConsent?: (preferences: CookiePreferences) => void;
  categories?: readonly CookieCategory[];
  /** localStorage key for the choice; null to keep nothing (the card shows every visit). */
  storageKey?: string | null;
  /** Milliseconds after mount before the card shows itself. */
  delay?: number;
  position?: "bottom-left" | "bottom-right" | "bottom";
  /** "fixed" pins it to the window; "absolute" to the nearest positioned parent. */
  strategy?: "fixed" | "absolute";
  title?: ReactNode;
  message?: ReactNode;
  /** Link to the cookie or privacy policy, shown after the message. */
  policyHref?: string;
  policyLabel?: string;
  /** Seconds the card takes to move and grow. */
  duration?: number;
  className?: string;
};

export const DEFAULT_COOKIE_CATEGORIES: CookieCategory[] = [
  { id: "necessary", label: "Necessary", description: "Sign-in, security and your cookie choice.", required: true },
  { id: "preferences", label: "Preferences", description: "Language, theme and other settings." },
  { id: "analytics", label: "Analytics", description: "Anonymous usage that helps us improve." },
  { id: "marketing", label: "Marketing", description: "Ads and offers based on your interests." },
];

/** The saved choice, or null if the visitor hasn't chosen yet. Safe to call on the server. */
export function getCookieConsent(storageKey = "cookie-consent"): CookiePreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data.preferences === "object" ? (data.preferences as CookiePreferences) : null;
  } catch {
    return null;
  }
}

function save(storageKey: string | null, preferences: CookiePreferences) {
  if (!storageKey) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ preferences, at: new Date().toISOString() }));
  } catch {
    // Private mode or storage blocked: the choice still applies for this visit.
  }
}

function Switch({ on, disabled, onChange, label, describedBy }: { on: boolean; disabled?: boolean; onChange: (on: boolean) => void; label: string; describedBy?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-5 w-8 shrink-0 cursor-pointer rounded-full outline-none transition-[background-color,opacity] duration-200",
        "before:absolute before:-inset-x-1.5 before:-inset-y-2.5 before:content-['']",
        "focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-default disabled:opacity-50",
        on ? "bg-neutral-900 dark:bg-white" : "bg-black/[0.12] dark:bg-white/[0.16]",
      )}
    >
      <motion.span
        aria-hidden
        className="absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] dark:bg-neutral-900"
        initial={false}
        animate={{ x: on ? 12 : 0 }}
        transition={{ type: "spring", duration: 0.3, bounce: 0 }}
      />
    </button>
  );
}

/** Two labels in one spot, so the button is always as wide as the longer and never jumps. */
function Swap({ a, b, showB }: { a: string; b: string; showB: boolean }) {
  const t = { duration: 0.18, ease: [0.23, 1, 0.32, 1] } as const;
  return (
    <span className="grid">
      <motion.span aria-hidden={showB} className="col-start-1 row-start-1" initial={false} animate={{ opacity: showB ? 0 : 1, y: showB ? -4 : 0 }} transition={t}>
        {a}
      </motion.span>
      <motion.span aria-hidden={!showB} className="col-start-1 row-start-1" initial={false} animate={{ opacity: showB ? 1 : 0, y: showB ? 0 : 4 }} transition={t}>
        {b}
      </motion.span>
    </span>
  );
}

export function CookieConsent({
  open: openProp,
  onOpenChange,
  onConsent,
  categories = DEFAULT_COOKIE_CATEGORIES,
  storageKey = "cookie-consent",
  delay = 600,
  position = "bottom-left",
  strategy = "fixed",
  title = "We use cookies",
  message = "We use cookies to keep the site working and, with your consent, to understand how it's used.",
  policyHref,
  policyLabel = "Cookie policy",
  duration = 0.45,
  className,
}: CookieConsentProps) {
  const uid = useId();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const [view, setView] = useState<"summary" | "customize">("summary");
  const defaults = () => Object.fromEntries(categories.map((c) => [c.id, !!(c.required || c.defaultOn)]));
  const [prefs, setPrefs] = useState<CookiePreferences>(defaults);
  const [content, bounds] = useMeasure();
  const spring = { type: "spring", duration, bounce: 0 } as const;

  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };

  // Uncontrolled: show after `delay` unless a choice is saved.
  const auto = useRef({ openProp, delay, storageKey });
  useEffect(() => {
    const { openProp: controlled, delay: wait, storageKey: key } = auto.current;
    if (controlled !== undefined) return;
    if (key && getCookieConsent(key)) return;
    const t = window.setTimeout(() => setOpenState(true), wait);
    return () => window.clearTimeout(t);
  }, []);

  // Each time it opens: a returning visitor goes straight to their saved categories.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      const saved = storageKey ? getCookieConsent(storageKey) : null;
      setPrefs({ ...defaults(), ...(saved ?? {}) });
      setView(saved ? "customize" : "summary");
    }
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, storageKey]);

  const decide = (choice: CookiePreferences) => {
    const final = Object.fromEntries(categories.map((c) => [c.id, c.required ? true : !!choice[c.id]]));
    save(storageKey, final);
    onConsent?.(final);
    setOpen(false);
  };
  const all = (on: boolean) => Object.fromEntries(categories.map((c) => [c.id, on || !!c.required]));

  const customize = view === "customize";
  const place = position === "bottom" ? "mx-auto" : position === "bottom-right" ? "ml-auto" : "mr-auto";
  const ghost =
    "h-9 cursor-pointer rounded-[10px] px-3 text-[13px] font-medium text-muted-foreground outline-none transition-[color,background-color,scale] duration-150 ease-out hover:bg-black/[0.05] hover:text-foreground active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-neutral-400 dark:hover:bg-white/[0.07]";
  const secondary =
    "h-9 cursor-pointer rounded-[10px] border border-black/[0.08] bg-white px-3.5 text-[13px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-[background-color,scale] duration-150 ease-out hover:bg-neutral-50 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-neutral-400 dark:border-white/10 dark:bg-white/[0.06] dark:shadow-none dark:hover:bg-white/[0.1]";
  const primary =
    "h-9 cursor-pointer rounded-[10px] bg-neutral-900 px-3.5 text-[13px] font-medium text-white outline-none transition-[background-color,scale] duration-150 ease-out hover:bg-neutral-800 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200";

  return (
    <MotionConfig reducedMotion="user">
      <div className={cn("pointer-events-none inset-x-0 bottom-0 z-50", strategy === "fixed" ? "fixed" : "absolute")}>
        <AnimatePresence>
          {open && (
            <motion.section
              role="region"
              aria-labelledby={`${uid}-title`}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0, height: bounds.height || "auto" }}
              exit={{ opacity: 0, y: 16, transition: { duration: 0.2, ease: [0.23, 1, 0.32, 1] } }}
              transition={{ ...spring, height: bounds.height ? spring : { duration: 0 } }}
              className={cn(
                "pointer-events-auto absolute inset-x-3 bottom-3 max-w-[400px] overflow-hidden rounded-[20px] bg-white text-foreground shadow-[0_0_0_1px_rgba(0,0,0,0.07),0_16px_40px_-12px_rgba(0,0,0,0.22),0_2px_6px_rgba(0,0,0,0.05)] dark:bg-neutral-900 dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_16px_40px_-12px_rgba(0,0,0,0.7)]",
                place,
                className,
              )}
            >
              <div ref={content} className="flex flex-col gap-4 p-4">
                <div className="flex flex-col gap-1 px-0.5">
                  <h2 id={`${uid}-title`} className="text-sm font-medium">
                    {title}
                  </h2>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {message}
                    {policyHref && (
                      <>
                        {" "}
                        <a href={policyHref} className="font-medium text-foreground underline decoration-black/20 underline-offset-2 hover:decoration-black/60 dark:decoration-white/25 dark:hover:decoration-white/60">
                          {policyLabel}
                        </a>
                      </>
                    )}
                  </p>
                </div>

                <AnimatePresence initial={false}>
                  {customize && (
                    <motion.ul
                      key="categories"
                      initial="hidden"
                      animate="shown"
                      exit="hidden"
                      variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.035, delayChildren: duration * 0.15 } } }}
                      className="flex flex-col rounded-[14px] bg-black/[0.03] p-1 dark:bg-white/[0.04]"
                    >
                      {categories.map((c) => (
                        <motion.li
                          key={c.id}
                          variants={{ hidden: { opacity: 0, y: 6, transition: { duration: 0.12 } }, shown: { opacity: 1, y: 0, transition: spring } }}
                          className="flex items-center gap-4 rounded-[10px] px-3 py-2.5"
                        >
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="flex items-center gap-2 text-[13px] font-medium">
                              {c.label}
                              {c.required && <span className="text-[12px] font-normal text-muted-foreground">Always on</span>}
                            </span>
                            {c.description && (
                              <span id={`${uid}-${c.id}`} className="text-[12.5px] leading-snug text-muted-foreground">
                                {c.description}
                              </span>
                            )}
                          </div>
                          <Switch
                            on={c.required ? true : !!prefs[c.id]}
                            disabled={c.required}
                            label={c.label}
                            describedBy={c.description ? `${uid}-${c.id}` : undefined}
                            onChange={(on) => setPrefs((p) => ({ ...p, [c.id]: on }))}
                          />
                        </motion.li>
                      ))}
                    </motion.ul>
                  )}
                </AnimatePresence>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button type="button" onClick={() => setView(customize ? "summary" : "customize")} aria-expanded={customize} className={cn(ghost, "mr-auto -ml-1")}>
                    <Swap a="Customize" b="Back" showB={customize} />
                  </button>
                  <button type="button" onClick={() => decide(customize ? all(true) : all(false))} className={secondary}>
                    <Swap a="Reject all" b="Accept all" showB={customize} />
                  </button>
                  <button type="button" onClick={() => decide(customize ? prefs : all(true))} className={primary}>
                    <Swap a="Accept all" b="Save choices" showB={customize} />
                  </button>
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
