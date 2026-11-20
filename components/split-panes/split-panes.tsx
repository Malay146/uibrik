"use client";

import { animate, motion, motionValue, useReducedMotion, type AnimationPlaybackControls, type MotionValue } from "motion/react";
import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { cn } from "@/lib/utils";

export type SplitPaneState = { collapsed: boolean };

export type SplitPaneProps = {
  id: string;
  /** Size in px. Leave it out on the one pane that takes the remaining space. */
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  /** Dragging below the minimum snaps the pane to `collapsedSize`. */
  collapsible?: boolean;
  /** Size of a collapsed pane in px: a rail of icons, or 0 to hide it. */
  collapsedSize?: number;
  /** Starts collapsed. */
  defaultCollapsed?: boolean;
  children?: ReactNode | ((state: SplitPaneState) => ReactNode);
  className?: string;
};

/** Declares a pane. Its props are read by SplitPanes, which renders it. */
export function SplitPane(props: SplitPaneProps): null {
  void props;
  return null;
}

export type SplitPanesHandle = {
  collapse: (id: string) => void;
  expand: (id: string) => void;
  toggle: (id: string) => void;
  /** Animates a pane to a size in px, within its limits. */
  resize: (id: string, size: number) => void;
  getLayout: () => SplitLayout;
};

export type SplitLayout = Record<string, { size: number; collapsed: boolean }>;

export type SplitPanesProps = {
  children: ReactNode;
  direction?: "horizontal" | "vertical";
  /** Collapse collapsible panes, first to last, when the container is too small for every pane's minimum. */
  autoCollapse?: boolean;
  /** Show a grip on the divider while it's hovered or dragged. */
  grip?: boolean;
  /** Arrow-key step in px. Shift moves five times as far. */
  step?: number;
  /** Saves sizes and collapsed panes in localStorage under this key. */
  autoSaveId?: string;
  /** Runs when a drag, key press or double-click settles. */
  onLayoutChange?: (layout: SplitLayout) => void;
  ref?: Ref<SplitPanesHandle>;
  className?: string;
};

const SPRING = { type: "spring", bounce: 0, visualDuration: 0.38 } as const;
const CATCH = { type: "spring", bounce: 0, visualDuration: 0.2 } as const;
const FLEX_MIN = 160;

const rubber = (d: number, dim: number) => (1 - 1 / ((d * 0.55) / dim + 1)) * dim;
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

type Pane = SplitPaneProps & { fixed: boolean };

export function SplitPanes({
  children,
  direction = "horizontal",
  autoCollapse = true,
  grip = true,
  step = 16,
  autoSaveId,
  onLayoutChange,
  ref,
  className,
}: SplitPanesProps) {
  const uid = useId();
  const reduce = useReducedMotion() ?? false;
  const vertical = direction === "vertical";
  const root = useRef<HTMLDivElement>(null);

  // Panes come from <SplitPane> children. The first pane without a
  // defaultSize fills the rest; if every pane has one, the last does.
  const declared = Children.toArray(children)
    .filter((c): c is ReactElement<SplitPaneProps> => isValidElement(c) && c.type === SplitPane)
    .map((c) => c.props);
  const flexIndex = Math.max(
    declared.findIndex((p) => p.defaultSize === undefined),
    0,
  );
  const panes: Pane[] = declared.map((p, i) => ({
    ...p,
    fixed: i !== (declared.some((d) => d.defaultSize === undefined) ? flexIndex : declared.length - 1),
  }));

  // One motion value per fixed pane. Drags write to it directly, so the
  // pane follows the pointer without React rendering on every move.
  const [sizes] = useState(() => new Map<string, MotionValue<number>>());
  const sizeOf = (p: Pane) => {
    let mv = sizes.get(p.id);
    if (!mv) {
      mv = motionValue(p.defaultCollapsed && p.collapsible ? (p.collapsedSize ?? 0) : (p.defaultSize ?? 240));
      sizes.set(p.id, mv);
    }
    return mv;
  };
  const last = useRef(new Map<string, number>());
  const auto = useRef(new Set<string>());

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(panes.map((p) => [p.id, Boolean(p.collapsible && p.defaultCollapsed)])),
  );
  // Mirrors `collapsed` for handlers mid-gesture; only setPaneCollapsed writes either.
  const collapsedRef = useRef(collapsed);
  const setPaneCollapsed = (id: string, on: boolean) => {
    collapsedRef.current = { ...collapsedRef.current, [id]: on };
    setCollapsed(collapsedRef.current);
  };

  // Settled sizes, for aria-valuenow. Updated when an interaction ends.
  const [settled, setSettled] = useState<Record<string, number>>({});
  const [active, setActive] = useState<number | null>(null);

  const live = useRef({ panes, onLayoutChange, autoSaveId, reduce });
  useLayoutEffect(() => {
    live.current = { panes, onLayoutChange, autoSaveId, reduce };
  });

  const containerSize = () => {
    const el = root.current;
    return el ? (vertical ? el.clientHeight : el.clientWidth) : 0;
  };

  const layout = (): SplitLayout =>
    Object.fromEntries(
      live.current.panes
        .filter((p) => p.fixed)
        .map((p) => [p.id, { size: Math.round(sizeOf(p).get()), collapsed: Boolean(collapsedRef.current[p.id]) }]),
    );

  const commit = () => {
    const l = layout();
    setSettled(Object.fromEntries(Object.entries(l).map(([k, v]) => [k, v.size])));
    const { onLayoutChange: cb, autoSaveId: key } = live.current;
    cb?.(l);
    if (key) {
      try {
        localStorage.setItem(`split-panes:${key}`, JSON.stringify(l));
      } catch {}
    }
  };

  // Largest size a fixed pane can take without squeezing the others below
  // their current size or the filling pane below its minimum.
  const maxFor = (p: Pane) => {
    const { panes: all } = live.current;
    const others = all.filter((o) => o.fixed && o.id !== p.id).reduce((s, o) => s + sizeOf(o).get(), 0);
    const flex = all.find((o) => !o.fixed);
    const room = containerSize() - others - (flex?.minSize ?? FLEX_MIN) - (all.length - 1);
    return Math.min(p.maxSize ?? Infinity, room);
  };

  const to = (mv: MotionValue<number>, v: number, instant = false) => {
    if (instant || live.current.reduce) {
      mv.stop();
      mv.set(v);
      return;
    }
    animate(mv, v, SPRING);
  };

  const collapse = (p: Pane, instant = false) => {
    if (!p.collapsible || collapsedRef.current[p.id]) return;
    const mv = sizeOf(p);
    last.current.set(p.id, Math.max(mv.get(), p.minSize ?? 0));
    setPaneCollapsed(p.id, true);
    to(mv, p.collapsedSize ?? 0, instant);
  };

  const expand = (p: Pane, size?: number, instant = false) => {
    if (!collapsedRef.current[p.id]) return;
    const lo = p.minSize ?? 0;
    const hi = maxFor(p);
    if (hi < lo) return; // no room
    setPaneCollapsed(p.id, false);
    to(sizeOf(p), clamp(size ?? last.current.get(p.id) ?? p.defaultSize ?? lo, lo, hi), instant);
  };

  const find = (id: string) => live.current.panes.find((p) => p.id === id && p.fixed);

  useImperativeHandle(ref, () => ({
    collapse: (id) => {
      const p = find(id);
      if (p) {
        auto.current.delete(id);
        collapse(p);
        commit();
      }
    },
    expand: (id) => {
      const p = find(id);
      if (p) {
        auto.current.delete(id);
        expand(p);
        commit();
      }
    },
    toggle: (id) => {
      const p = find(id);
      if (!p) return;
      auto.current.delete(id);
      if (collapsedRef.current[id]) expand(p);
      else collapse(p);
      commit();
    },
    resize: (id, size) => {
      const p = find(id);
      if (!p || collapsedRef.current[id]) return;
      to(sizeOf(p), clamp(size, p.minSize ?? 0, maxFor(p)));
      commit();
    },
    getLayout: layout,
  }));

  // Saved layout, before the first paint.
  useLayoutEffect(() => {
    if (!autoSaveId) return;
    try {
      const raw = localStorage.getItem(`split-panes:${autoSaveId}`);
      if (!raw) return;
      const saved = JSON.parse(raw) as SplitLayout;
      for (const p of panes) {
        const s = saved[p.id];
        if (!p.fixed || !s) continue;
        if (s.collapsed && p.collapsible) {
          last.current.set(p.id, p.defaultSize ?? p.minSize ?? 0);
          setPaneCollapsed(p.id, true);
          sizeOf(p).set(p.collapsedSize ?? 0);
        } else {
          setPaneCollapsed(p.id, false);
          sizeOf(p).set(clamp(s.size, p.minSize ?? 0, p.maxSize ?? Infinity));
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSaveId]);

  // Fit to the container: fold collapsible panes when it gets too small,
  // unfold the ones it folded when there's room again, and keep every pane
  // inside the box. The first pass on mount applies without animation.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let first = true;
    const fit = () => {
      const { panes: all } = live.current;
      const size = containerSize();
      if (!size) return;
      const flex = all.find((p) => !p.fixed);
      const need = () =>
        all.filter((p) => p.fixed).reduce((s, p) => s + sizeOf(p).get(), 0) + (flex?.minSize ?? FLEX_MIN) + (all.length - 1);
      // Targets, not the animating values, decide what still fits.
      const target = (p: Pane) =>
        collapsedRef.current[p.id] ? (p.collapsedSize ?? 0) : Math.max(sizeOf(p).get(), p.minSize ?? 0);
      const needTarget = () =>
        all.filter((p) => p.fixed).reduce((s, p) => s + target(p), 0) + (flex?.minSize ?? FLEX_MIN) + (all.length - 1);

      if (autoCollapse) {
        for (const p of all) {
          if (needTarget() <= size) break;
          if (p.fixed && p.collapsible && !collapsedRef.current[p.id]) {
            auto.current.add(p.id);
            collapse(p, first);
          }
        }
        for (const p of [...all].reverse()) {
          if (!auto.current.has(p.id) || !collapsedRef.current[p.id]) continue;
          const back = last.current.get(p.id) ?? p.defaultSize ?? p.minSize ?? 0;
          if (needTarget() - (p.collapsedSize ?? 0) + back + 24 > size) break;
          auto.current.delete(p.id);
          expand(p, back, first);
        }
      }
      // Still too big: shrink fixed panes toward their minimum, last first.
      let over = need() - size;
      for (const p of [...all].reverse()) {
        if (over <= 0) break;
        if (!p.fixed || collapsedRef.current[p.id]) continue;
        const mv = sizeOf(p);
        const give = Math.min(over, mv.get() - (p.minSize ?? 0));
        if (give > 0) {
          mv.stop();
          mv.set(mv.get() - give);
          over -= give;
        }
      }
      if (first) commit();
      first = false;
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCollapse, vertical]);

  // ─── Dividers ──────────────────────────────────────────────────────────────

  // Divider i sits between pane i and i + 1 and resizes whichever of the two
  // is fixed: the one before it if it can, otherwise the one after.
  const owner = (i: number) => {
    const a = panes[i];
    const b = panes[i + 1];
    if (a?.fixed) return { pane: a, dir: 1 };
    if (b?.fixed) return { pane: b, dir: -1 };
    return null;
  };

  const drag = useRef<{
    id: number;
    pane: Pane;
    dir: number;
    start: number;
    base: number;
    max: number;
    catching: AnimationPlaybackControls | null;
    moved: boolean;
  } | null>(null);

  const coord = (e: { clientX: number; clientY: number }) => (vertical ? e.clientY : e.clientX);

  const restoreCursor = () => {
    const s = document.documentElement.style;
    s.cursor = "";
    s.userSelect = "";
  };
  useEffect(() => restoreCursor, []);

  const down = (i: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const o = owner(i);
    if (!o) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    const mv = sizeOf(o.pane);
    mv.stop();
    drag.current = {
      id: e.pointerId,
      pane: o.pane,
      dir: o.dir,
      start: coord(e),
      base: mv.get(),
      max: maxFor(o.pane),
      catching: null,
      moved: false,
    };
    const s = document.documentElement.style;
    s.cursor = vertical ? "row-resize" : "col-resize";
    s.userSelect = "none";
    setActive(i);
  };

  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const raw = d.base + (coord(e) - d.start) * d.dir;
    if (Math.abs(raw - d.base) > 2) d.moved = true;
    const p = d.pane;
    const mv = sizeOf(p);
    const lo = p.minSize ?? 0;
    const hi = Math.max(lo, d.max);

    if (p.collapsible) {
      const rail = p.collapsedSize ?? 0;
      // Snap point: halfway between the rail and the minimum.
      const at = rail + (lo - rail) / 2;
      if (collapsedRef.current[p.id]) {
        if (raw < at + 8 || d.max < lo) return;
        auto.current.delete(p.id);
        setPaneCollapsed(p.id, false);
        // Spring out to the pointer, then follow it exactly.
        const anim = animate(mv, clamp(raw, lo, hi), CATCH);
        d.catching = anim;
        anim.then(() => {
          if (drag.current?.catching === anim) drag.current.catching = null;
        });
        return;
      }
      if (raw < at) {
        auto.current.delete(p.id);
        d.catching?.stop();
        d.catching = null;
        collapse(p);
        return;
      }
    }

    let v = raw;
    if (v < lo) v = lo - rubber(lo - v, 28);
    else if (v > hi) v = hi + rubber(v - hi, 28);
    if (d.catching) {
      const anim = animate(mv, v, CATCH);
      d.catching = anim;
      anim.then(() => {
        if (drag.current?.catching === anim) drag.current.catching = null;
      });
    } else mv.set(v);
  };

  const up = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    restoreCursor();
    setActive(null);
    const p = d.pane;
    if (!collapsedRef.current[p.id]) {
      const mv = sizeOf(p);
      const lo = p.minSize ?? 0;
      const hi = Math.max(lo, maxFor(p));
      const v = mv.get();
      // Spring back out of the rubber band.
      if (v < lo || v > hi) animate(mv, clamp(v, lo, hi), { ...SPRING, velocity: mv.getVelocity() });
      last.current.set(p.id, clamp(v, lo, hi));
    }
    if (d.moved) commit();
  };

  const toggleAt = (i: number) => {
    const o = owner(i);
    if (!o) return;
    const p = o.pane;
    auto.current.delete(p.id);
    if (p.collapsible) {
      if (collapsedRef.current[p.id]) expand(p);
      else collapse(p);
    } else to(sizeOf(p), clamp(p.defaultSize ?? sizeOf(p).get(), p.minSize ?? 0, maxFor(p)));
    commit();
  };

  const key = (i: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    const o = owner(i);
    if (!o) return;
    const p = o.pane;
    const mv = sizeOf(p);
    const lo = p.minSize ?? 0;
    const hi = Math.max(lo, maxFor(p));
    const rtl = !vertical && getComputedStyle(e.currentTarget).direction === "rtl";
    const fwd = vertical ? "ArrowDown" : rtl ? "ArrowLeft" : "ArrowRight";
    const back = vertical ? "ArrowUp" : rtl ? "ArrowRight" : "ArrowLeft";
    const by = (e.shiftKey ? step * 5 : step) * o.dir;
    const isCollapsed = collapsedRef.current[p.id];

    if (e.key === fwd || e.key === back) {
      const delta = e.key === fwd ? by : -by;
      if (isCollapsed) {
        if (delta > 0) {
          auto.current.delete(p.id);
          expand(p, lo);
        }
      } else if (mv.get() <= lo && delta < 0 && p.collapsible) {
        auto.current.delete(p.id);
        collapse(p);
      } else to(mv, clamp(mv.get() + delta, lo, hi), true);
    } else if (e.key === "Home") {
      if (p.collapsible) collapse(p);
      else to(mv, lo);
    } else if (e.key === "End") {
      if (isCollapsed) expand(p, hi);
      else to(mv, hi);
    } else if (e.key === "Enter") {
      toggleAt(i);
      e.preventDefault();
      return;
    } else return;
    e.preventDefault();
    commit();
  };

  const domId = (id: string) => `${uid}-${id}`;

  // Dividers beside a pane hidden at 0 px would double up; that pane's own
  // divider drops its line and keeps the grab area.
  const hiddenPane = (p?: Pane) => Boolean(p && collapsed[p.id] && (p.collapsedSize ?? 0) === 0);

  return (
    <div
      ref={root}
      data-direction={direction}
      className={cn("flex size-full min-h-0 min-w-0 overflow-hidden", vertical ? "flex-col" : "flex-row", className)}
    >
      {panes.map((p, i) => {
        const o = i > 0 ? owner(i - 1) : null;
        const ctrl = o?.pane;
        return (
          <Fragment key={p.id}>
            {i > 0 && ctrl && (
              <Divider
                vertical={vertical}
                grip={grip}
                active={active === i - 1}
                bare={hiddenPane(ctrl) || (hiddenPane(panes[i - 1]) && hiddenPane(p))}
                controls={domId(ctrl.id)}
                label={`Resize ${ctrl.id}`}
                now={Math.round(settled[ctrl.id] ?? (collapsed[ctrl.id] ? (ctrl.collapsedSize ?? 0) : (ctrl.defaultSize ?? 0)))}
                min={ctrl.collapsible ? (ctrl.collapsedSize ?? 0) : (ctrl.minSize ?? 0)}
                max={ctrl.maxSize}
                onPointerDown={down(i - 1)}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onDoubleClick={() => toggleAt(i - 1)}
                onKeyDown={key(i - 1)}
              />
            )}
            <motion.div
              id={domId(p.id)}
              data-pane={p.id}
              data-collapsed={collapsed[p.id] ? "" : undefined}
              style={
                p.fixed
                  ? { [vertical ? "height" : "width"]: sizeOf(p), flex: "none" }
                  : { flex: "1 1 0%", [vertical ? "minHeight" : "minWidth"]: 0 }
              }
              className={cn("relative min-h-0 min-w-0 overflow-hidden [contain:layout_paint]", p.className)}
            >
              {typeof p.children === "function" ? p.children({ collapsed: Boolean(collapsed[p.id]) }) : p.children}
            </motion.div>
          </Fragment>
        );
      })}
    </div>
  );
}

function Divider({
  vertical,
  grip,
  active,
  bare,
  controls,
  label,
  now,
  min,
  max,
  ...handlers
}: {
  vertical: boolean;
  grip: boolean;
  active: boolean;
  bare: boolean;
  controls: string;
  label: string;
  now: number;
  min: number;
  max?: number;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onDoubleClick: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={vertical ? "horizontal" : "vertical"}
      aria-controls={controls}
      aria-label={label}
      aria-valuenow={now}
      aria-valuemin={min}
      aria-valuemax={max}
      data-active={active ? "" : undefined}
      {...handlers}
      className={cn(
        "group/divider relative z-20 flex-none touch-none outline-none",
        vertical ? "h-px w-full cursor-row-resize" : "h-full w-px cursor-col-resize",
        bare ? "bg-transparent" : "bg-black/[0.08] dark:bg-white/[0.09]",
      )}
    >
      {/* Grab area: wider than the line, wider still on touch. */}
      <span
        aria-hidden
        className={cn(
          "absolute",
          vertical
            ? "inset-x-0 -top-[5px] -bottom-[5px] pointer-coarse:-top-3 pointer-coarse:-bottom-3"
            : "inset-y-0 -left-[5px] -right-[5px] pointer-coarse:-left-3 pointer-coarse:-right-3",
        )}
      />
      {/* The line darkens once the pointer has rested on it a moment. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute bg-black/25 opacity-0 transition-opacity duration-150 dark:bg-white/30",
          "group-hover/divider:opacity-100 group-hover/divider:delay-150 group-focus-visible/divider:opacity-100 group-data-active/divider:opacity-100 group-data-active/divider:delay-0",
          vertical ? "inset-x-0 top-0 h-px" : "inset-y-0 left-0 w-px",
        )}
      />
      {grip && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/[0.08] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:border-white/10 dark:bg-[#2c2c2e] dark:shadow-none",
            "scale-75 opacity-0 transition-[opacity,scale] duration-200 ease-out",
            "group-hover/divider:scale-100 group-hover/divider:opacity-100 group-hover/divider:delay-150 group-focus-visible/divider:scale-100 group-focus-visible/divider:opacity-100 group-data-active/divider:scale-100 group-data-active/divider:opacity-100 group-data-active/divider:delay-0",
            vertical ? "h-[5px] w-8" : "h-8 w-[5px]",
          )}
        />
      )}
    </div>
  );
}
