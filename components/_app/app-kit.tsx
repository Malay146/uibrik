"use client";

// Everything the dashboard and app-screen blocks share, in one file: surfaces,
// buttons, fields, badges, avatars and the page header, so every screen reads
// as one product. Layered surfaces throughout: a raised shell carries a
// panel's title and actions, a recessed panel holds its content, and edges are
// inset shadows (edge-outer / edge-inner / edge-tile), never borders.
//
// Blocks lay themselves out with container queries (`@container` on the root,
// `@3xl:` and friends inside), so they adapt to the space they are given, not
// to the window: a dashboard in a narrow column stacks like it would on a phone.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { IconCheck, IconChevronDown, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// ─── Tokens ───────────────────────────────────────────────────────────────────

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const SPRING = { type: "spring", duration: 0.4, bounce: 0 } as const;

export const FOCUS =
  "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 dark:focus-visible:outline-zinc-500";

/** Raised outer shell: 24px corners, 6px gap to the panel inside. */
export const SHELL = "edge-outer rounded-3xl bg-muted/70 p-1.5 dark:bg-muted/60";
/** Recessed inner panel: 24 − 6 = 18px corners. */
export const PANEL = "edge-inner rounded-[18px] bg-background";
/** Raised tile inside a 6px-padded panel: 18 − 6 = 12px corners. */
export const TILE = "edge-tile rounded-xl bg-muted";
/** Put on a screen root (and its dialogs, which portal out) to drop every edge-* hairline and inset shadow inside it. */
export const FLAT = "[--edge-outer:none] [--edge-inner:none] [--edge-tile:none]";
/**
 * Flat frame for tool screens (editors, trackers, canvases) that read better as
 * one surface than as shell + panel: a hairline ring and a faint lift. Pair
 * with `RULE` dividers between its toolbar and content. In dark mode it lifts
 * `--background` a step so it never melts into a page of the same black;
 * everything inside that paints `bg-background` follows.
 */
export const FRAME =
  "rounded-2xl bg-background shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_9%,transparent),0_1px_3px_rgb(0_0_0/0.05)] dark:[--background:#121212] dark:shadow-[0_0_0_1px_rgb(255_255_255/0.08)]";
/** Hairline divider colour inside a FRAME, used with border-b / border-t. */
export const RULE = "border-foreground/[0.07] dark:border-white/[0.07]";
/** Column headers and small labels on a shell. */
export const LABEL = "text-xs font-medium uppercase tracking-wider text-muted-foreground";
/** Identifiers and literal values. */
export const CHIP = "rounded-md bg-muted px-2 py-0.5 font-mono text-[13px] text-foreground";

// ─── Status ───────────────────────────────────────────────────────────────────
// Status colours only ever mark state, always beside a label or icon.

export const TONES = {
  neutral: "bg-muted-foreground",
  good: "bg-emerald-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
  info: "bg-sky-500",
} as const;

export type Tone = keyof typeof TONES;

// ─── Panel ────────────────────────────────────────────────────────────────────

export type PanelProps = {
  title?: ReactNode;
  /** Muted, beside the title: a count, a range. */
  meta?: ReactNode;
  /** Right of the heading row: PanelButtons, a Segmented, a Button. */
  actions?: ReactNode;
  /** One muted line under the panel. */
  footer?: ReactNode;
  className?: string;
  panelClassName?: string;
  children: ReactNode;
};

/** The titled block every screen is built from. */
export function Panel({ title, meta, actions, footer, className, panelClassName, children }: PanelProps) {
  return (
    <section className={cn(SHELL, "flex min-w-0 flex-col", className)}>
      {(title || actions) && (
        <header className="flex min-h-11 items-center justify-between gap-3 pl-3 pr-1">
          <div className="flex min-w-0 items-baseline gap-2">
            {title && <h2 className="truncate text-sm font-medium text-foreground">{title}</h2>}
            {meta && <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">{meta}</span>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </header>
      )}
      <div className={cn(PANEL, "relative min-w-0 flex-1 overflow-hidden", panelClassName)}>{children}</div>
      {footer && <div className="min-h-9 px-3 pb-1.5 pt-2.5 text-[13px] text-muted-foreground">{footer}</div>}
    </section>
  );
}

/** Square icon button for a shell's heading row. */
export function PanelButton({
  label,
  className,
  children,
  ...props
}: { label: string; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-background hover:text-foreground disabled:pointer-events-none disabled:opacity-40",
        FOCUS,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ─── Page header ──────────────────────────────────────────────────────────────

/** Title, one line of context and the page's actions (one primary at most). */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────

const BUTTON = {
  primary: "bg-foreground text-background hover:bg-foreground/90",
  secondary: "edge-outer bg-background text-foreground hover:bg-muted",
  ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
  danger: "bg-red-600 text-white hover:bg-red-600/90",
} as const;

const BUTTON_SIZE = {
  sm: "h-8 gap-1.5 rounded-[10px] px-3 text-[13px]",
  md: "h-9 gap-2 rounded-xl px-3.5 text-sm",
} as const;

export type ButtonProps = {
  variant?: keyof typeof BUTTON;
  size?: keyof typeof BUTTON_SIZE;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant = "secondary", size = "md", className, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
        BUTTON[variant],
        BUTTON_SIZE[size],
        FOCUS,
        className,
      )}
      {...props}
    />
  );
}

// ─── Fields ───────────────────────────────────────────────────────────────────

const FIELD =
  // Inputs can't hold an ::after, so the recessed edge is a plain shadow here.
  "h-10 w-full rounded-xl bg-muted/40 shadow-[var(--edge-inner)] px-3.5 text-sm text-foreground placeholder:text-muted-foreground/70 transition-shadow";

/** Label above, hint or error below. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[13px] text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : (
        hint && <p className="text-[13px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

/** Text input. Wrap in `edge-inner` look; `invalid` adds a red ring. */
export function Input({ className, invalid, ...props }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        FIELD,
        "outline-none focus-visible:ring-2 focus-visible:ring-foreground/15",
        invalid && "ring-2 ring-red-500/40 focus-visible:ring-red-500/50",
        className,
      )}
      {...props}
    />
  );
}

/** Native select, styled like Input. */
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cn("relative", className)}>
      <select
        className={cn(FIELD, "cursor-pointer appearance-none pr-9 outline-none focus-visible:ring-2 focus-visible:ring-foreground/15")}
        {...props}
      >
        {children}
      </select>
      <IconChevronDown
        size={16}
        stroke={1.75}
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

/** On/off switch. Give it a `label` (read aloud) or point `aria-labelledby` at visible text. */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  className,
  ...aria
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50",
        checked ? "bg-foreground" : "bg-foreground/15",
        FOCUS,
        className,
      )}
      {...aria}
    >
      <motion.span
        className="size-5 rounded-full bg-background shadow-[0_1px_2px_rgb(0_0_0/0.2)]"
        initial={false}
        animate={{ x: checked ? 16 : 0 }}
        transition={reduce ? { duration: 0 } : SPRING}
      />
    </button>
  );
}

/** Square checkbox; `indeterminate` shows a dash (some rows selected). */
export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "grid size-4 shrink-0 cursor-pointer place-items-center rounded-[5px] transition-colors duration-150",
        on ? "bg-foreground text-background" : "bg-background shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--foreground)_25%,transparent)]",
        FOCUS,
        className,
      )}
    >
      {indeterminate ? (
        <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
          <path d="M2.5 6h7" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
        </svg>
      ) : (
        checked && (
          <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
            <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )
      )}
    </button>
  );
}

// ─── Badge, avatar, progress ──────────────────────────────────────────────────

/** A state with a coloured dot and a label: "Active", "Failed". */
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-muted px-2.5 text-xs font-medium text-foreground",
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", TONES[tone])} />
      {children}
    </span>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** Initials in a neutral circle, or a photo when `src` is set. */
export function Avatar({ name, src, size = 32, className }: { name: string; src?: string; size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 select-none place-items-center overflow-hidden rounded-full bg-muted font-medium text-muted-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_6%,transparent)]",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/** Thin bar from 0 to 1. Colour only when a tone matters (near a limit). */
export function Progress({
  value,
  tone,
  label,
  className,
}: {
  /** 0 to 1. */
  value: number;
  tone?: Tone;
  /** Read aloud. */
  label: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.07]", className)}
    >
      {/* Full width, cut back with clip-path: animating width re-lays out the page on every frame. */}
      <motion.div
        className={cn("h-full rounded-full", tone ? TONES[tone] : "bg-foreground")}
        initial={reduce ? false : { clipPath: "inset(0 100% 0 0 round 9999px)" }}
        animate={{ clipPath: `inset(0 ${100 - pct}% 0 0 round 9999px)` }}
        transition={{ duration: reduce ? 0 : 0.5, ease: EASE_OUT }}
      />
    </div>
  );
}

/** Keyboard key. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-grid h-5 min-w-5 place-items-center rounded-md bg-background px-1 font-sans text-[11px] font-medium text-muted-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_10%,transparent)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

/** Nothing here yet: what this place is for and the one thing to do next. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon && <div className={cn(TILE, "mb-4 grid size-11 place-items-center text-muted-foreground")}>{icon}</div>}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-72 text-[13px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

/** Underline-free page tabs: the active one gets a raised tile behind it, or a flat fill when `flat`. */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  label,
  flat,
  className,
}: {
  options: readonly { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  /** Flat muted fill for the active tab, for screens without layered surfaces. */
  flat?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const id = useId();
  return (
    <div role="tablist" aria-label={label} className={cn("flex items-center gap-1 overflow-x-auto", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium transition-colors duration-150",
              on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              FOCUS,
            )}
          >
            {on && (
              <motion.span
                layoutId={id}
                className={cn("absolute inset-0 rounded-[10px]", flat ? "bg-muted" : "bg-background edge-outer")}
                transition={reduce ? { duration: 0 } : SPRING}
              />
            )}
            {/* z-10: the sliding pill belongs to the newly selected tab, which can come later in the
                DOM, so without it the pill paints over earlier labels as it passes */}
            <span className="relative z-10">{o.label}</span>
            {o.count !== undefined && <span className="relative z-10 tabular-nums text-muted-foreground">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** "2h ago", "3d ago" from minutes. Sample data stores minutes-ago so server and client agree. */
export function ago(minutes: number) {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${Math.round(minutes)}m ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`;
  return `${Math.round(minutes / (60 * 24))}d ago`;
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

// Open dialogs, newest last: only the top one answers Escape and Tab.
const stack: object[] = [];
const noop = () => () => {};

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog: a layered shell over a dimmed backdrop. Escape and the
 * backdrop close it, Tab stays inside, focus returns to the opener on close.
 * `footer` holds the actions (one primary at most). `side` makes it a sheet
 * that slides in from the right, for details and longer forms.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  side = false,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  side?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  // The portal needs document, so render nothing on the server.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  // Callers pass inline handlers; reading the latest through a ref keeps the
  // effect below from re-running (and moving focus) on every render.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const token = {};
    stack.push(token);
    const opener = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      const first = ref.current?.querySelector<HTMLElement>("[data-autofocus]") ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? ref.current)?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const [first, last] = [items[0]!, items[items.length - 1]!];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(token), 1);
      opener?.focus?.();
    };
  }, [open]);

  if (!mounted) return null;
  // An ease that starts gently: a front-loaded curve lands most of the backdrop's dim in the first frame,
  // which reads as a flash.
  const t = { duration: reduce ? 0 : 0.22, ease: [0.4, 0, 0.2, 1] as const };
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cn("fixed inset-0 z-50 flex p-4", side ? "justify-end" : "items-center justify-center")}>
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-black/30 backdrop-blur-[2px] dark:bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={t}
            onClick={onClose}
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            className={cn(
              SHELL,
              "relative flex max-h-full w-full flex-col bg-muted outline-none dark:bg-muted",
              side ? "h-full max-w-md" : "max-w-md",
              className,
            )}
            initial={side ? { opacity: 0, transform: `translateX(${reduce ? 0 : 24}px)` } : { opacity: 0, transform: reduce ? "none" : "translateY(8px) scale(0.98)" }}
            animate={side ? { opacity: 1, transform: "translateX(0px)" } : { opacity: 1, transform: "translateY(0px) scale(1)" }}
            exit={side ? { opacity: 0, transform: `translateX(${reduce ? 0 : 24}px)` } : { opacity: 0, transform: reduce ? "none" : "translateY(4px) scale(0.98)" }}
            transition={t}
          >
            <header className="flex items-start justify-between gap-3 pb-3 pl-4 pr-1 pt-3">
              <div className="min-w-0 pt-1">
                <h2 id={titleId} className="text-[15px] font-semibold text-foreground">
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="mt-1 text-[13px] text-muted-foreground">
                    {description}
                  </p>
                )}
              </div>
              <PanelButton label="Close" onClick={onClose}>
                <IconX size={16} stroke={1.75} />
              </PanelButton>
            </header>
            {children && (
              <div className={cn(PANEL, "min-h-0 flex-1 overflow-hidden")}>
                <div className="scrollbar-soft h-full overflow-y-auto p-4">{children}</div>
              </div>
            )}
            {footer && <div className="flex flex-wrap items-center justify-end gap-2 px-1.5 pb-1.5 pt-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastItem = { id: number; message: ReactNode; tone?: Tone };
const ToastContext = createContext<((message: ReactNode, tone?: Tone) => void) | null>(null);

/**
 * Wrap a screen in <Toaster> and call `useToast()(message)` to confirm an
 * action ("Invite sent", "Key copied"). Toasts stack bottom-centre, clear of
 * side sheets' footers, and leave on
 * their own after 3.5s. Outside a Toaster the call does nothing. A screen
 * with its own bottom bar sets `--toast-offset` on <html> to lift them above it.
 */
export function Toaster({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(0);
  const push = useCallback((message: ReactNode, tone?: Tone) => {
    const id = ++next.current;
    setItems((list) => [...list.slice(-2), { id, message, tone }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-[calc(1rem+var(--toast-offset,0px))] left-1/2 z-[60] flex w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 flex-col items-center gap-2">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout={!reduce}
              initial={{ opacity: 0, transform: `translateY(${reduce ? 0 : 8}px)` }}
              animate={{ opacity: 1, transform: "translateY(0px)" }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              transition={{ duration: reduce ? 0 : 0.25, ease: EASE_OUT }}
              className="pointer-events-auto flex items-center gap-2.5 rounded-2xl bg-foreground py-2.5 pl-3 pr-4 text-[13px] font-medium text-background shadow-[0_8px_24px_rgb(0_0_0/0.18)]"
            >
              {t.tone && t.tone !== "neutral" ? (
                <span aria-hidden className={cn("size-1.5 rounded-full", TONES[t.tone])} />
              ) : (
                <IconCheck size={15} stroke={2} aria-hidden />
              )}
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext) ?? (() => {});
}
