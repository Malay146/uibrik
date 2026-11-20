"use client";

// A menu that opens where you right-click (or long-press on touch) inside an
// area, with the same items, submenus and keyboard control as Dropdown Menu.
// Right-clicking again elsewhere moves it there.

import { AnimatePresence } from "motion/react";
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { MenuPanel, type MenuItem } from "../_overlay/menu";
import { Portal, useDismiss, useLayer } from "../_overlay/overlay";

export type { MenuItem };

export type ContextMenuProps = {
  /** The area that responds to right-click. */
  children: ReactNode;
  items: readonly MenuItem[];
  /** Milliseconds a touch must be held to open the menu. */
  longPress?: number;
  onOpenChange?: (open: boolean) => void;
  /** Classes for the area. */
  className?: string;
  /** Classes for the menu panel. */
  menuClassName?: string;
};

export function ContextMenu({ children, items, longPress = 500, onOpenChange, className, menuClassName }: ContextMenuProps) {
  const [point, setPoint] = useState<{ x: number; y: number; n: number } | null>(null);
  const open = point !== null;
  const area = useRef<HTMLDivElement>(null);
  const opens = useRef(0);
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const layer = useLayer(open);

  const show = (x: number, y: number) => {
    // A new key replays the open animation at the new spot.
    setPoint({ x, y, n: ++opens.current });
    onOpenChange?.(true);
  };
  const close = () => {
    setPoint(null);
    onOpenChange?.(false);
  };

  useDismiss({ open, layer, onDismiss: close });

  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer);
    press.current = null;
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    const { clientX: x, clientY: y } = e;
    cancelPress();
    press.current = { x, y, timer: setTimeout(() => show(x, y), longPress) };
  };

  const onPointerMove = (e: PointerEvent) => {
    const p = press.current;
    if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) cancelPress();
  };

  return (
    <>
      <div
        ref={area}
        onContextMenu={(e) => {
          e.preventDefault();
          cancelPress();
          show(e.clientX, e.clientY);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        className={cn("[-webkit-touch-callout:none]", className)}
      >
        {children}
      </div>
      <Portal>
        <AnimatePresence>
          {point && (
            <MenuPanel
              key={point.n}
              items={items}
              owner={layer.id}
              getAnchor={() => ({ left: point.x, top: point.y, width: 0, height: 0 })}
              side="bottom"
              align="start"
              offset={2}
              initialFocus="panel"
              onCloseAll={close}
              className={menuClassName}
              ariaLabel="Context menu"
            />
          )}
        </AnimatePresence>
      </Portal>
    </>
  );
}
