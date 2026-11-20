"use client";

// The menu panel shared by Dropdown Menu and Context Menu: items, checkbox and
// radio items, labels, separators and submenus, with full keyboard control
// (arrows, Home/End, type to find, Enter, Escape, Right/Left for submenus) and
// a highlight that slides between items instead of blinking.

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EASE_OUT, Portal, SURFACE, originFor, useAnchoredPosition, type Align, type Box, type Side } from "./overlay";

export type MenuItem =
  | {
      type?: "item";
      label: string;
      icon?: ReactNode;
      shortcut?: string;
      onSelect?: () => void;
      disabled?: boolean;
      /** Red, for destructive actions. */
      danger?: boolean;
    }
  | { type: "checkbox"; label: string; checked: boolean; onCheckedChange: (checked: boolean) => void; shortcut?: string; disabled?: boolean }
  /** One of a set; give each in the set its own `checked`. */
  | { type: "radio"; label: string; checked: boolean; onSelect: () => void; disabled?: boolean }
  | { type: "sub"; label: string; icon?: ReactNode; items: readonly MenuItem[]; disabled?: boolean }
  | { type: "label"; label: string }
  | { type: "separator" };

const navigable = (it: MenuItem) => it.type !== "label" && it.type !== "separator" && !("disabled" in it && it.disabled);

type PanelProps = {
  items: readonly MenuItem[];
  /** Layer id; every panel in the tree carries it so outside clicks can tell. */
  owner: string;
  getAnchor: () => Box | null;
  side: Side;
  align: Align;
  offset: number;
  /** What gets focus when the panel opens. */
  initialFocus: "first" | "last" | "panel";
  /** Close the whole menu; `restore` hands focus back to the trigger. */
  onCloseAll: (restore: boolean) => void;
  /** Submenus only: close just this panel. */
  onCloseSelf?: () => void;
  /** Submenus only: the pointer reached this panel, so the parent shouldn't close it. */
  onPointerEnterPanel?: () => void;
  depth?: number;
  className?: string;
  ariaLabel?: string;
};

export function MenuPanel({
  items,
  owner,
  getAnchor,
  side,
  align,
  offset,
  initialFocus,
  onCloseAll,
  onCloseSelf,
  onPointerEnterPanel,
  depth = 0,
  className,
  ariaLabel,
}: PanelProps) {
  const floating = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const uid = useId();
  const [active, setActive] = useState<number | null>(null);
  const [sub, setSub] = useState<number | null>(null);
  const [subFocus, setSubFocus] = useState<"first" | "panel">("panel");
  const subTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const typed = useRef({ text: "", at: 0 });

  const placed = useAnchoredPosition({ open: true, floating, getAnchor, side, align, offset });

  const focusItem = (i: number | null) => {
    setActive(i);
    if (i === null) panel.current?.focus({ preventScroll: true });
    else refs.current[i]?.focus({ preventScroll: true });
  };

  useEffect(() => {
    const first = items.findIndex(navigable);
    const last = items.length - 1 - [...items].reverse().findIndex(navigable);
    const raf = requestAnimationFrame(() =>
      focusItem(initialFocus === "first" && first >= 0 ? first : initialFocus === "last" && first >= 0 ? last : null),
    );
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(subTimer.current);
    };
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const step = (from: number | null, dir: 1 | -1) => {
    const n = items.length;
    let i = from ?? (dir === 1 ? -1 : n);
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (navigable(items[i])) return i;
    }
    return from;
  };

  const openSub = (i: number, focus: "first" | "panel") => {
    clearTimeout(subTimer.current);
    setSubFocus(focus);
    setSub(i);
  };

  const activate = (i: number, viaKeyboard: boolean) => {
    const it = items[i];
    if (!navigable(it)) return;
    if (it.type === "sub") return openSub(i, viaKeyboard ? "first" : "panel");
    if (it.type === "checkbox") return it.onCheckedChange(!it.checked);
    if (it.type === "radio") return it.onSelect();
    if (it.type === undefined || it.type === "item") {
      it.onSelect?.();
      onCloseAll(true);
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const k = e.key;
    if (k === "ArrowDown" || k === "ArrowUp") focusItem(step(active, k === "ArrowDown" ? 1 : -1));
    else if (k === "Home") focusItem(step(null, 1));
    else if (k === "End") focusItem(step(null, -1));
    else if ((k === "Enter" || k === " ") && active !== null) activate(active, true);
    else if (k === "ArrowRight" && active !== null && items[active].type === "sub") openSub(active, "first");
    else if ((k === "ArrowLeft" || k === "Escape") && onCloseSelf) onCloseSelf();
    else if (k === "Tab") {
      // Menus aren't tab stops: Tab leaves the menu entirely.
      onCloseAll(false);
      return;
    } else if (k.length === 1 && /\S/.test(k) && !e.metaKey && !e.ctrlKey) {
      // Type to find: letters typed within half a second build one search.
      const now = e.timeStamp;
      typed.current = { text: (now - typed.current.at < 500 ? typed.current.text : "") + k.toLowerCase(), at: now };
      const q = typed.current.text;
      const start = active ?? -1;
      for (let o = 1; o <= items.length; o++) {
        const i = (start + o) % items.length;
        const it = items[i];
        if (navigable(it) && "label" in it && it.label.toLowerCase().startsWith(q)) {
          focusItem(i);
          break;
        }
      }
    } else return;
    e.preventDefault();
    // Handled here, so outer layers (and the document's Escape) never see it.
    e.stopPropagation();
  };

  const vertical = placed.side === "top" || placed.side === "bottom";

  return (
    <div ref={floating} data-owner={owner} className="fixed left-0 top-0 z-[200]">
      <motion.div
        ref={panel}
        role="menu"
        aria-label={ariaLabel}
        aria-orientation="vertical"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onPointerEnter={onPointerEnterPanel}
        onPointerLeave={() => sub === null && focusItem(null)}
        initial={{ opacity: 0, scale: 0.96, [vertical ? "y" : "x"]: placed.side === "top" || placed.side === "left" ? 4 : -4 }}
        animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
        transition={{ duration: 0.16, ease: EASE_OUT }}
        style={{ transformOrigin: originFor(placed.side, align) }}
        className={cn(SURFACE, "min-w-[200px] select-none p-1 outline-none", className)}
      >
        {items.map((it, i) => {
          if (it.type === "separator") return <div key={i} role="separator" className="-mx-1 my-1 h-px bg-border" />;
          if (it.type === "label")
            return (
              <div key={i} className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                {it.label}
              </div>
            );
          const disabled = "disabled" in it && it.disabled;
          const role = it.type === "checkbox" ? "menuitemcheckbox" : it.type === "radio" ? "menuitemradio" : "menuitem";
          const isSub = it.type === "sub";
          return (
            <div
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role={role}
              tabIndex={-1}
              aria-disabled={disabled || undefined}
              aria-checked={it.type === "checkbox" || it.type === "radio" ? it.checked : undefined}
              aria-haspopup={isSub ? "menu" : undefined}
              aria-expanded={isSub ? sub === i : undefined}
              onPointerMove={(e) => {
                if (disabled || e.pointerType !== "mouse") return;
                if (active !== i) focusItem(i);
                if (isSub && sub !== i) {
                  clearTimeout(subTimer.current);
                  subTimer.current = setTimeout(() => openSub(i, "panel"), 100);
                } else if (!isSub && sub !== null) {
                  // Grace period, so a diagonal move toward the submenu doesn't close it.
                  clearTimeout(subTimer.current);
                  subTimer.current = setTimeout(() => setSub(null), 250);
                }
              }}
              onClick={() => !disabled && activate(i, false)}
              className={cn(
                "relative flex h-8 cursor-default items-center gap-2 rounded-xl px-2 text-sm outline-none",
                disabled ? "opacity-40" : it.type !== "sub" && it.type !== "checkbox" && it.type !== "radio" && it.danger ? "text-red-600 dark:text-red-400" : "text-foreground",
              )}
            >
              {/* Panel radius 16px minus its 4px padding: the highlight's corners run parallel to the panel's. */}
              {active === i && (
                <motion.span
                  layoutId={`${uid}-hl`}
                  aria-hidden
                  className="absolute inset-0 rounded-xl bg-muted"
                  transition={{ type: "spring", duration: 0.2, bounce: 0 }}
                />
              )}
              {(it.type === "checkbox" || it.type === "radio") && (
                <span className="relative grid size-4 place-items-center">
                  {it.checked &&
                    (it.type === "checkbox" ? (
                      <svg aria-hidden width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 7.3 5.7 10 11 4.2" />
                      </svg>
                    ) : (
                      <span className="size-1.5 rounded-full bg-current" />
                    ))}
                </span>
              )}
              {"icon" in it && it.icon && <span className="relative grid size-4 place-items-center text-muted-foreground [&_svg]:size-4">{it.icon}</span>}
              <span className="relative flex-1 truncate">{it.label}</span>
              {"shortcut" in it && it.shortcut && <span className="relative text-xs tracking-wide text-muted-foreground">{it.shortcut}</span>}
              {isSub && (
                <svg aria-hidden width={12} height={12} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="relative text-muted-foreground">
                  <path d="M4.5 2.5 8 6l-3.5 3.5" />
                </svg>
              )}
            </div>
          );
        })}
      </motion.div>

      <Portal>
        <AnimatePresence>
          {sub !== null && items[sub]?.type === "sub" && (
            <MenuPanel
              key={sub}
              items={(items[sub] as Extract<MenuItem, { type: "sub" }>).items}
              owner={owner}
              getAnchor={() => {
                const r = refs.current[sub]?.getBoundingClientRect();
                // Line the submenu's first item up with the row that opened it.
                return r ? { left: r.left, top: r.top - 4, width: r.width, height: r.height + 8 } : null;
              }}
              side="right"
              align="start"
              offset={8}
              initialFocus={subFocus}
              depth={depth + 1}
              ariaLabel={(items[sub] as { label: string }).label}
              onCloseAll={onCloseAll}
              onPointerEnterPanel={() => clearTimeout(subTimer.current)}
              onCloseSelf={() => {
                const i = sub;
                setSub(null);
                focusItem(i);
              }}
            />
          )}
        </AnimatePresence>
      </Portal>
    </div>
  );
}
