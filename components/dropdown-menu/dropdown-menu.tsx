"use client";

// A menu that opens from a button: items with icons and shortcuts, checkbox
// and radio items, labels, separators and submenus. Click or Enter opens it;
// arrows, Home/End and typing move through it; Escape or a click outside
// closes it and hands focus back to the button.

import { AnimatePresence } from "motion/react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { MenuPanel, type MenuItem } from "../_overlay/menu";
import { Portal, triggerBox, useDismiss, useLayer, type Align, type Side } from "../_overlay/overlay";

export type { MenuItem };

export type DropdownMenuProps = {
  /** The button that opens the menu. */
  children: ReactNode;
  items: readonly MenuItem[];
  side?: Side;
  align?: Align;
  /** Gap between button and menu in px. */
  offset?: number;
  /** Controlled open state. Pair with `onOpenChange`. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Classes for the menu panel. */
  className?: string;
};

export function DropdownMenu({
  children,
  items,
  side = "bottom",
  align = "start",
  offset = 6,
  open: openProp,
  onOpenChange,
  className,
}: DropdownMenuProps) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const [focus, setFocus] = useState<"first" | "last" | "panel">("panel");
  const trigger = useRef<HTMLSpanElement>(null);
  const layer = useLayer(open);

  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };

  const close = (restore: boolean) => {
    setOpen(false);
    if (restore) (trigger.current?.firstElementChild as HTMLElement | null)?.focus({ preventScroll: true });
  };

  useDismiss({ open, layer, anchor: trigger, onDismiss: (why) => close(why === "escape") });

  // The button itself says it opens a menu, and whether it's open.
  useEffect(() => {
    const el = trigger.current?.firstElementChild;
    if (!el) return;
    el.setAttribute("aria-haspopup", "menu");
    el.setAttribute("aria-expanded", String(open));
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    setFocus(e.key === "ArrowDown" ? "first" : "last");
    setOpen(true);
  };

  return (
    <>
      <span
        ref={trigger}
        className="contents"
        onClick={(e) => {
          // A keyboard "click" (Enter/Space) lands on the first item; a pointer click doesn't.
          setFocus(e.detail === 0 ? "first" : "panel");
          setOpen(!open);
        }}
        onKeyDown={onKeyDown}
      >
        {children}
      </span>
      <Portal>
        <AnimatePresence>
          {open && (
            <MenuPanel
              items={items}
              owner={layer.id}
              getAnchor={() => triggerBox(trigger)}
              side={side}
              align={align}
              offset={offset}
              initialFocus={focus}
              onCloseAll={close}
              className={className}
            />
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}
