"use client";

// Shared plumbing for the overlay components (dialog, drawer, menus, popover,
// hover card): a portal, a layer stack so only the topmost overlay answers
// Escape, outside clicks and Tab, anchored placement that flips and stays on
// screen, a focus trap and a scroll lock.

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

export const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

/** The floating surface every overlay shares: background, hairline edge, soft shadow. */
export const SURFACE =
  "rounded-2xl bg-background text-foreground shadow-[inset_0_0_0_1px_var(--border),0_12px_32px_-8px_rgb(0_0_0/0.18),0_2px_6px_rgb(0_0_0/0.06)] dark:shadow-[inset_0_0_0_1px_var(--border),0_12px_32px_-8px_rgb(0_0_0/0.6)]";

export const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

// ─── Portal ───────────────────────────────────────────────────────────────────

const noop = () => () => {};

/** Renders into <body> once on the client; nothing during server render. */
export function Portal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  return mounted ? createPortal(children, document.body) : null;
}

// ─── Layer stack ──────────────────────────────────────────────────────────────

// Open overlays, oldest first. Only the last one reacts to Escape, outside
// clicks and Tab, so a menu inside a dialog closes alone.
const stack: string[] = [];

/** Registers an open overlay; returns its id and whether it's on top. */
export function useLayer(open: boolean) {
  const id = useId();
  useEffect(() => {
    if (!open) return;
    stack.push(id);
    return () => {
      const i = stack.lastIndexOf(id);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [open, id]);
  return useMemo(() => ({ id, isTop: () => stack[stack.length - 1] === id }), [id]);
}

/**
 * Closes on Escape or a press outside. Elements that belong to this overlay
 * (including portalled sub-panels) carry `data-owner={id}`; the trigger is
 * passed as `anchor`, so pressing it again toggles instead of reopening.
 */
export function useDismiss({
  open,
  layer,
  onDismiss,
  anchor,
  outside = true,
}: {
  open: boolean;
  layer: { id: string; isTop: () => boolean };
  onDismiss: (reason: "escape" | "outside") => void;
  anchor?: RefObject<Element | null>;
  outside?: boolean;
}) {
  const latest = useRef(onDismiss);
  useEffect(() => {
    latest.current = onDismiss;
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !layer.isTop()) return;
      e.preventDefault();
      latest.current("escape");
    };
    const onDown = (e: PointerEvent) => {
      if (!outside || !layer.isTop()) return;
      const t = e.target as Element | null;
      if (!t?.closest) return;
      if (t.closest(`[data-owner="${CSS.escape(layer.id)}"]`)) return;
      if (anchor?.current?.contains(t)) return;
      latest.current("outside");
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, layer, anchor, outside]);
}

// ─── Focus ────────────────────────────────────────────────────────────────────

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

const focusables = (el: HTMLElement) =>
  [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => !n.closest("[inert]") && n.offsetParent !== null);

/**
 * While active, moves focus inside `ref` (to `[data-autofocus]`, the first
 * focusable, or the element itself), keeps Tab inside it while it's the top
 * layer, and hands focus back to whatever had it on close.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, layer: { isTop: () => boolean }) {
  useEffect(() => {
    if (!active) return;
    const before = document.activeElement as HTMLElement | null;
    // After the enter frame, so the element is laid out and focusable.
    const raf = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el || el.contains(document.activeElement)) return;
      const target = el.querySelector<HTMLElement>("[data-autofocus]") ?? focusables(el)[0] ?? el;
      target.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !layer.isTop()) return;
      const el = ref.current;
      if (!el) return;
      const list = focusables(el);
      if (list.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [active, ref, layer]);
}

// ─── Scroll lock ──────────────────────────────────────────────────────────────

let locks = 0;
let saved: { overflow: string; paddingRight: string } | null = null;

/** Stops the page scrolling behind a modal, without the layout jumping by a scrollbar. */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    if (locks++ === 0) {
      const gap = window.innerWidth - html.clientWidth;
      saved = { overflow: html.style.overflow, paddingRight: html.style.paddingRight };
      html.style.overflow = "hidden";
      if (gap > 0) html.style.paddingRight = `${gap}px`;
    }
    return () => {
      if (--locks === 0 && saved) {
        html.style.overflow = saved.overflow;
        html.style.paddingRight = saved.paddingRight;
        saved = null;
      }
    };
  }, [active]);
}

// ─── Placement ────────────────────────────────────────────────────────────────

export type Side = "top" | "bottom" | "left" | "right";
export type Align = "start" | "center" | "end";
export type Box = { left: number; top: number; width: number; height: number };

const MARGIN = 8;
const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

/** Where a w×h box goes next to `a`: preferred side unless it doesn't fit, aligned, kept on screen. */
export function place(a: Box, w: number, h: number, side: Side, align: Align, offset: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const fits: Record<Side, boolean> = {
    top: a.top - offset - h >= MARGIN,
    bottom: a.top + a.height + offset + h <= vh - MARGIN,
    left: a.left - offset - w >= MARGIN,
    right: a.left + a.width + offset + w <= vw - MARGIN,
  };
  const s = fits[side] || !fits[OPPOSITE[side]] ? side : OPPOSITE[side];
  const vertical = s === "top" || s === "bottom";
  const along = (start: number, size: number, own: number) =>
    align === "start" ? start : align === "end" ? start + size - own : start + size / 2 - own / 2;
  let x = vertical ? along(a.left, a.width, w) : s === "left" ? a.left - offset - w : a.left + a.width + offset;
  let y = vertical ? (s === "top" ? a.top - offset - h : a.top + a.height + offset) : along(a.top, a.height, h);
  x = Math.min(Math.max(x, MARGIN), Math.max(MARGIN, vw - w - MARGIN));
  y = Math.min(Math.max(y, MARGIN), Math.max(MARGIN, vh - h - MARGIN));
  // Where the anchor's centre falls along the panel's near edge, for an arrow.
  const arrow = vertical ? a.left + a.width / 2 - x : a.top + a.height / 2 - y;
  return { x, y, side: s, arrow };
}

/** CSS transform-origin for a panel opening on `side`, so it grows out of its anchor. */
export function originFor(side: Side, align: Align, arrow?: number) {
  const cross = arrow !== undefined ? `${arrow}px` : align === "start" ? "0%" : align === "end" ? "100%" : "50%";
  if (side === "bottom") return `${cross} 0%`;
  if (side === "top") return `${cross} 100%`;
  if (side === "right") return `0% ${cross}`;
  return `100% ${cross}`;
}

// Written straight to the element, so following a scroll never re-renders.
function moveTo(el: HTMLElement, x: number, y: number) {
  el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

/**
 * Positions `floating` (a fixed element at 0,0) next to the anchor box before
 * paint, and again on scroll, resize or when the panel's own size changes.
 */
export function useAnchoredPosition({
  open,
  floating,
  getAnchor,
  side,
  align,
  offset,
}: {
  open: boolean;
  floating: RefObject<HTMLElement | null>;
  getAnchor: () => Box | null;
  side: Side;
  align: Align;
  offset: number;
}) {
  const [placed, setPlaced] = useState<{ side: Side; arrow: number }>({ side, arrow: 0 });
  const anchorFn = useRef(getAnchor);
  useEffect(() => {
    anchorFn.current = getAnchor;
  });

  useLayoutEffect(() => {
    if (!open) return;
    const f = floating.current;
    if (!f) return;
    const update = () => {
      const a = anchorFn.current();
      if (!a) return;
      const p = place(a, f.offsetWidth, f.offsetHeight, side, align, offset);
      moveTo(f, p.x, p.y);
      setPlaced((prev) => (prev.side === p.side && Math.abs(prev.arrow - p.arrow) < 0.5 ? prev : { side: p.side, arrow: p.arrow }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(f);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
    // getAnchor is read through a ref, so a new function each render doesn't re-run this.
  }, [open, floating, side, align, offset]);

  return placed;
}

/** The box of a `display: contents` trigger wrapper's actual element. */
export const triggerBox = (wrapper: RefObject<HTMLElement | null>): Box | null => {
  const el = wrapper.current?.firstElementChild;
  return el ? el.getBoundingClientRect() : null;
};
