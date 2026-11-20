"use client";

import { IconCheckFilled, IconCircleCheckFilled, IconLoader2, IconPencilFilled, IconXFilled } from "@tabler/icons-react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  type AnimationPlaybackControls,
} from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", duration: 0.42, bounce: 0 } as const;

// One type scale for both states, so the text never moves or resizes when the
// label turns into an input.
const SIZES = {
  sm: { text: "text-sm", height: 32, pad: 8, icon: 14, button: 28 },
  md: { text: "text-[15px]", height: 36, pad: 10, icon: 15, button: 32 },
  lg: { text: "text-2xl font-semibold tracking-[-0.02em]", height: 48, pad: 12, icon: 18, button: 36 },
} as const;

export type InlineEditProps = {
  /** Controlled value. */
  value?: string;
  /** Starting value when uncontrolled. */
  defaultValue?: string;
  /**
   * Called with the new value on save. Return a promise to hold the field in a
   * saving state; a rejected promise shakes the field and keeps it open.
   */
  onChange?: (value: string) => void | Promise<unknown>;
  /** Accessible name, e.g. "Project name". */
  label: string;
  /** Shown, muted, when the value is empty. */
  placeholder?: string;
  size?: keyof typeof SIZES;
  /** Width the field opens to at least while editing, in px. */
  minWidth?: number;
  /** What clicking away does: keep the draft or throw it out. */
  blurBehavior?: "save" | "cancel";
  /** Select the whole value when editing starts, instead of placing the caret at the end. */
  selectOnEdit?: boolean;
  /** Refuse to save an empty value. */
  required?: boolean;
  maxLength?: number;
  disabled?: boolean;
  /** Corner radius in px. */
  radius?: number;
  className?: string;
};

export function InlineEdit({
  value: valueProp,
  defaultValue = "",
  onChange,
  label,
  placeholder = "Empty",
  size = "md",
  minWidth = 180,
  blurBehavior = "save",
  selectOnEdit = true,
  required = false,
  maxLength,
  disabled = false,
  radius = 10,
  className,
}: InlineEditProps) {
  const reduce = useReducedMotion();
  const s = SIZES[size];
  const [inner, setInner] = useState(defaultValue);
  const value = valueProp ?? inner;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, setPending] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [saved, setSaved] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLDivElement>(null);
  const sizer = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const refocus = useRef(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // The field's width is a motion value fed from a hidden copy of the text.
  // It springs when the mode changes and follows typing exactly; a keystroke
  // during the spring re-aims it, so the two never fight.
  // "auto" until the first measure, so server HTML already has the right size.
  const width = useMotionValue<number | "auto">("auto");
  const measured = useRef(false);
  const morph = useRef<AnimationPlaybackControls | null>(null);
  const morphing = useRef(false);
  const lastMode = useRef(editing);

  const iconRoom = s.icon + 8;
  const targetWidth = () => {
    const text = sizer.current?.getBoundingClientRect().width ?? 0;
    return editing ? Math.max(text + 2, minWidth) + s.pad * 2 : text + s.pad * 2 + iconRoom;
  };

  const sync = () => {
    const to = targetWidth();
    const modeChanged = lastMode.current !== editing;
    lastMode.current = editing;
    if (!measured.current || reduce) {
      width.jump(to);
      measured.current = true;
      return;
    }
    if (modeChanged || morphing.current) {
      morph.current?.stop();
      morphing.current = true;
      morph.current = animate(width, to, { ...SPRING, onComplete: () => (morphing.current = false) });
    } else {
      width.jump(to);
    }
  };

  useLayoutEffect(sync);

  // Web fonts can land after the first measure.
  useEffect(() => {
    const el = sizer.current;
    if (!el) return;
    const ro = new ResizeObserver(() => sync());
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, size, minWidth]);

  useLayoutEffect(() => {
    if (editing) {
      const el = input.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      if (selectOnEdit) el.select();
      else el.setSelectionRange(el.value.length, el.value.length);
    } else if (refocus.current) {
      refocus.current = false;
      trigger.current?.focus({ preventScroll: true });
    }
  }, [editing, selectOnEdit]);

  useEffect(() => () => clearTimeout(savedTimer.current), []);

  const open = () => {
    if (disabled) return;
    setDraft(value);
    setInvalid(false);
    setSaved(false);
    setEditing(true);
  };

  const close = (returnFocus: boolean) => {
    refocus.current = returnFocus;
    setPending(false);
    setEditing(false);
  };

  const reject = () => {
    setInvalid(true);
    input.current?.focus({ preventScroll: true });
    if (field.current && !reduce) animate(field.current, { x: [0, -6, 6, -4, 4, -2, 0] }, { duration: 0.4 });
  };

  const save = async (returnFocus: boolean) => {
    if (pending) return;
    const next = draft.trim();
    if (next === value) return close(returnFocus);
    if (required && !next) return reject();
    const result = onChange?.(next);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      setPending(true);
      try {
        await result;
      } catch {
        setPending(false);
        return reject();
      }
    }
    if (valueProp === undefined) setInner(next);
    close(returnFocus);
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1400);
  };

  const cancel = (returnFocus: boolean) => {
    setDraft(value);
    close(returnFocus);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel(true);
    }
  };

  const onBlur = (e: FocusEvent) => {
    if (pending || root.current?.contains(e.relatedTarget as Node | null)) return;
    if (blurBehavior === "save") save(false);
    else cancel(false);
  };

  const shown = editing ? draft : value;
  const buttonsWidth = s.button * 2 + 4 + 6;
  // Keep focus in the input while the buttons are pressed: Safari never
  // focuses a clicked button, so blur would otherwise see nowhere to go.
  const keepFocus = (e: PointerEvent) => e.preventDefault();

  return (
    <div ref={root} className={cn("inline-flex max-w-full items-center", className)}>
      <motion.div
        ref={field}
        style={{ width, height: s.height, borderRadius: radius }}
        className={cn(
          "group/edit relative min-w-0 shrink overflow-hidden transition-[background-color,box-shadow] duration-150",
          editing
            ? invalid
              ? "bg-background shadow-[inset_0_0_0_1px_rgb(239_68_68/0.7),0_0_0_3px_rgb(239_68_68/0.15)]"
              : "bg-background shadow-[inset_0_0_0_1px_var(--border),0_0_0_3px_color-mix(in_oklab,var(--border)_50%,transparent)]"
            : cn(!disabled && "hover:bg-muted/70 has-[:focus-visible]:bg-muted/70"),
        )}
      >
        <span
          ref={sizer}
          aria-hidden
          className={cn("invisible absolute left-0 top-0 whitespace-pre", s.text)}
        >
          {shown || placeholder}
        </span>

        {editing ? (
          <input
            ref={input}
            value={draft}
            aria-label={label}
            aria-invalid={invalid || undefined}
            placeholder={placeholder}
            maxLength={maxLength}
            readOnly={pending}
            onChange={(e) => {
              setDraft(e.target.value);
              setInvalid(false);
            }}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
            style={{ paddingInline: s.pad }}
            className={cn(
              "block h-full w-full min-w-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground/60",
              s.text,
            )}
          />
        ) : (
          <>
            <span
              aria-hidden
              style={{ paddingLeft: s.pad, paddingRight: s.pad + iconRoom }}
              className={cn(
                "flex h-full items-center truncate whitespace-pre",
                s.text,
                value ? "text-foreground" : "text-muted-foreground/60",
              )}
            >
              <span className="truncate">{value || placeholder}</span>
            </span>
            <button
              ref={trigger}
              type="button"
              disabled={disabled}
              onClick={open}
              aria-label={`${label}: ${value || placeholder}. Edit`}
              className="absolute inset-0 cursor-text rounded-[inherit] outline-none disabled:cursor-default"
            />
            <span
              aria-hidden
              style={{ right: s.pad }}
              className="pointer-events-none absolute top-1/2 grid -translate-y-1/2 place-items-center"
            >
              <AnimatePresence initial={false} mode="popLayout">
                {saved ? (
                  <motion.span
                    key="saved"
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: "spring", duration: 0.35, bounce: 0.3 }}
                    className="grid text-emerald-600 dark:text-emerald-400"
                  >
                    <IconCircleCheckFilled size={s.icon} />
                  </motion.span>
                ) : (
                  !disabled && (
                    <motion.span
                      key="pencil"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="grid text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/edit:opacity-100 group-has-[:focus-visible]/edit:opacity-100 [@media(hover:none)]:opacity-60"
                    >
                      <IconPencilFilled size={s.icon} />
                    </motion.span>
                  )
                )}
              </AnimatePresence>
            </span>
          </>
        )}
      </motion.div>

      <AnimatePresence initial={false}>
        {editing && (
          <motion.div
            key="actions"
            initial={{ width: 0 }}
            animate={{ width: buttonsWidth }}
            exit={{ width: 0 }}
            transition={reduce ? { duration: 0 } : SPRING}
            className="flex shrink-0 items-center justify-end gap-1"
          >
            {(["save", "cancel"] as const).map((kind, i) => (
              <motion.button
                key={kind}
                type="button"
                aria-label={kind === "save" ? "Save" : "Cancel"}
                disabled={pending && kind === "cancel"}
                onPointerDown={keepFocus}
                onClick={() => (kind === "save" ? save(true) : cancel(true))}
                onBlur={onBlur}
                initial={{ opacity: 0, scale: 0.6, x: -10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.6, x: -10, transition: { duration: 0.15 } }}
                whileTap={{ scale: 0.92 }}
                transition={reduce ? { duration: 0 } : { ...SPRING, delay: i * 0.04 }}
                style={{ width: s.button, height: s.button, borderRadius: Math.max(radius - 2, 0) }}
                className={cn(
                  "grid shrink-0 cursor-pointer place-items-center outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-neutral-400 disabled:cursor-default disabled:opacity-50",
                  kind === "save"
                    ? "bg-foreground text-background hover:bg-foreground/85"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {kind === "save" ? (
                  pending ? (
                    <IconLoader2 size={15} stroke={2} className="animate-spin" />
                  ) : (
                    <IconCheckFilled size={15} />
                  )
                ) : (
                  <IconXFilled size={15} />
                )}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
