"use client";

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export type SubSection = { id: string; title: string };

/** A section, optionally with one level of subsections. */
export type Section = SubSection & { children?: readonly SubSection[] };

/** A section or subsection in document order. */
export type Item = {
  id: string;
  title: string;
  depth: 0 | 1;
  /** Flat index of the parent section, or -1 for a top-level one. */
  parent: number;
};

type Options = {
  sections: readonly Section[];
  container?: RefObject<HTMLElement | null>;
  /** Distance in px from the top of the scroller where a section counts as current. */
  offset: number;
};

/**
 * Follows the scroll position through a list of sections.
 *
 * Sections and subsections are flattened into one list in document order, so
 * everything below works on a single index. `position` is a continuous index:
 * 2.5 means halfway between item 2 and item 3, and `active` is the nearest
 * whole item. `jump` scrolls to one.
 *
 * `target` is the item a click is travelling to, or null when none is. It is
 * held after the scroll comes to rest until `position` has caught up, so
 * whatever follows it doesn't fall back to the item being left.
 * `jumps` counts clicks, so a repeat click on the same item is still an event.
 */
function useActiveSection({ sections, container, offset }: Options) {
  const reduce = useReducedMotion();
  const raw = useMotionValue(0);
  const position = useSpring(raw, { stiffness: 320, damping: 40, mass: 0.6 });
  const [active, setActive] = useState(0);

  const items = useMemo(() => {
    const out: Item[] = [];
    sections.forEach((s) => {
      const parent = out.length;
      out.push({ id: s.id, title: s.title, depth: 0, parent: -1 });
      s.children?.forEach((c) => out.push({ id: c.id, title: c.title, depth: 1, parent }));
    });
    return out;
  }, [sections]);
  const last = items.length - 1;

  const [target, setTarget] = useState<number | null>(null);
  const [jumps, setJumps] = useState(0);
  const pending = useRef<number | null>(null);
  const rest = useRef(0);
  const release = useRef(0);

  // The scroll has come to rest. Hold the target a moment longer for the spring.
  const settle = useCallback(() => {
    window.clearTimeout(rest.current);
    pending.current = null;
    window.clearTimeout(release.current);
    release.current = window.setTimeout(() => setTarget(null), 450);
  }, []);

  useMotionValueEvent(position, "change", (v) => {
    setActive(Math.round(clamp(v, 0, last)));
    // Caught up with a finished click: hand control back to the position.
    if (pending.current === null && target !== null && Math.abs(v - target) < 0.03) {
      window.clearTimeout(release.current);
      setTarget(null);
    }
  });

  useEffect(
    () => () => {
      window.clearTimeout(rest.current);
      window.clearTimeout(release.current);
    },
    [],
  );

  const find = (id: string) => {
    const scope: ParentNode = container?.current ?? document;
    return scope.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
  };

  useEffect(() => {
    const root = container?.current ?? null;
    const scroller: HTMLElement | Window = root ?? window;
    let frame = 0;

    const update = () => {
      frame = 0;
      const line = (root ? root.getBoundingClientRect().top : 0) + offset;
      const atBottom = root
        ? root.scrollTop + root.clientHeight >= root.scrollHeight - 2
        : window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

      const rects = items.map((item) => find(item.id)?.getBoundingClientRect());
      let current = 0;
      let progress = 0;
      rects.forEach((rect, i) => {
        if (!rect || rect.top > line) return;
        // An item runs until the next one starts, so a parent that wraps its
        // subsections still hands over to its first child smoothly.
        const end = rects[i + 1]?.top ?? rect.bottom;
        current = i;
        progress = clamp((line - rect.top) / (end - rect.top || 1), 0, 1);
      });

      // Short trailing sections never reach the line; the end of the page is the last one.
      raw.set(atBottom ? last : Math.min(current + progress, last));

      // While a click is travelling, scrolling coming to rest means it has arrived.
      if (pending.current !== null) {
        window.clearTimeout(rest.current);
        rest.current = window.setTimeout(settle, 140);
      }
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    scroller.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      scroller.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, container, offset, raw, last, settle]);

  const jump = (index: number) => {
    const el = find(items[index].id);
    if (!el) return;
    const root = container?.current ?? null;
    const rootTop = root ? root.getBoundingClientRect().top : 0;
    const delta = el.getBoundingClientRect().top - rootTop - offset + 1;
    const from = root ? root.scrollTop : window.scrollY;
    const max = root
      ? root.scrollHeight - root.clientHeight
      : document.documentElement.scrollHeight - window.innerHeight;
    const to = clamp(from + delta, 0, max);
    const behavior = reduce ? "auto" : "smooth";
    if (root) root.scrollTo({ top: to, behavior });
    else window.scrollTo({ top: to, behavior });

    // A section the page can't scroll up to ends at the last item instead.
    const reach = from + delta > max + 1 ? last : index;
    pending.current = reach;
    window.clearTimeout(rest.current);
    window.clearTimeout(release.current);
    setTarget(reach);
    setJumps((n) => n + 1);
    // Already there, so no scrolling will follow: settle straight away.
    rest.current = window.setTimeout(settle, Math.abs(to - from) < 2 ? 60 : 900);
  };

  return { items, position, active, jump, target, jumps };
}

// On this page. A dot rides a thin rail beside the titles and moves continuously
// with the scroll, so halfway through a section it sits halfway to the next.
// The rail blends from white into black as it reaches the dot; only the current
// title is filled.
//
// Subsections fold open under their section while it, or one of them, is
// current. The rail bends in to a second, inset line for them, and the dot
// follows the bend and shrinks a little while it sits on one. The section above
// a current subsection stays a shade darker so you still know where you are.
//
// A group with many subsections shows a window of them that slides with the
// current one, with a quiet text row ("More above" / "More below") where the rest are folded away.
//
// Clicking a title plays one wave through its name, timed to the moment the dot
// arrives, and nothing on the dot itself.

const HINT = 22; // height of a "More above" / "More below" row, px
const BAND = 46; // half-width of a wave, % of the title
// The rail's ends fade out so the line reads as continuing, not cut off.
const RAIL_FADE = "linear-gradient(to bottom, transparent, #000 14px, #000 calc(100% - 14px), transparent)";
const FOLD = { duration: 0.32, ease: [0.32, 0.72, 0, 1] } as const;
const TRAVEL_EASE = [0.4, 0, 0.2, 1] as const;

export type OnThisPageProps = {
  sections: readonly Section[];
  container?: React.RefObject<HTMLElement | null>;
  label?: string;
  offset?: number;
  /** How far in the subsection line sits from the main line, px. */
  inset?: number;
  /** Softness of the bend between the two lines. 0.5 is the classic S; lower is tighter. */
  curve?: number;
  /** Extra space above a group's first subsection, giving the bend more room, px. */
  bendRoom?: number;
  /** Extra space above each new section, px. */
  sectionGap?: number;
  /** Space between subsections, px. Negative values tighten them past the row height. */
  subsectionGap?: number;
  /** Height of one row, px. */
  rowHeight?: number;
  /** Most subsections shown at once for one section; the rest slide in as you go. 0 shows all. */
  maxSubsections?: number;
  lineWidth?: number;
  dotSize?: number;
  className?: string;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function OnThisPage({
  sections,
  container,
  label = "On this page",
  offset = 96,
  inset = 18,
  curve = 0.5,
  bendRoom = 8,
  sectionGap = 8,
  subsectionGap = 0,
  rowHeight = 32,
  maxSubsections = 5,
  lineWidth = 2,
  dotSize = 8,
  className,
}: OnThisPageProps) {
  const ITEM = rowHeight;
  const BEND = clamp(curve, 0.05, 0.5);
  // Centre of the main line, and of the inset one for subsections.
  const RAIL_X = [lineWidth / 2, lineWidth / 2 + inset] as const;
  // Subsection titles start a fixed distance to the right of their line.
  const indent = RAIL_X[1] + 26;
  const { items, position, active, jump, target, jumps } = useActiveSection({ sections, container, offset });
  const last = items.length - 1;
  // While a click is travelling, the destination decides which group is open, so
  // the sections passed on the way don't unfold and fold again.
  const focus = target ?? active;
  const ancestor = items[focus]?.depth === 1 ? items[focus].parent : -1;
  const branch = items[focus]?.depth === 0 ? focus : (items[focus]?.parent ?? -1);

  // First and last flat index of each section's subsections.
  const groups = useMemo(() => {
    const g = new Map<number, { first: number; last: number }>();
    items.forEach((item, i) => {
      if (item.depth !== 1) return;
      const e = g.get(item.parent);
      if (e) e.last = i;
      else g.set(item.parent, { first: i, last: i });
    });
    return g;
  }, [items]);

  // The window of subsections shown for the open group, centred on the current one.
  const group = groups.get(branch);
  let winStart = group?.first ?? 0;
  let winEnd = group?.last ?? -1;
  let above = 0;
  let below = 0;
  if (group && maxSubsections > 0) {
    const n = group.last - group.first + 1;
    if (n > maxSubsections) {
      const r = items[focus].depth === 1 ? focus - group.first : 0;
      const s0 = clamp(r - Math.floor(maxSubsections / 2), 0, n - maxSubsections);
      winStart = group.first + s0;
      winEnd = winStart + maxSubsections - 1;
      above = s0;
      below = n - maxSubsections - s0;
    }
  }
  const shown = (i: number) =>
    items[i].depth === 0 || (items[i].parent === branch && i >= winStart && i <= winEnd);

  // How open each row is, 0..1. Sections are always 1; a subsection follows its
  // group being the current branch and it being inside the window.
  const open = useMemo(
    () => items.map((item) => motionValue(item.depth === 0 ? 1 : 0)),
    [items],
  );
  // The same for the "More above" / "More below" rows above and below each group's subsections.
  const hints = useMemo(() => items.map(() => [motionValue(0), motionValue(0)] as const), [items]);
  useEffect(() => {
    items.forEach((item, i) => {
      if (item.depth === 1) animate(open[i], shown(i) ? 1 : 0, FOLD);
    });
    groups.forEach((_, p) => {
      animate(hints[p][0], p === branch && above > 0 ? 1 : 0, FOLD);
      animate(hints[p][1], p === branch && below > 0 ? 1 : 0, FOLD);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, open, hints, groups, branch, winStart, winEnd, above, below]);

  // A little air above each section after the first, so groups read as clusters.
  const gaps = items.map((item, i) =>
    item.depth === 0 ? (i > 0 ? sectionGap : 0) : items[i - 1].depth === 0 ? bendRoom : subsectionGap,
  );

  // A negative gap shortens the row itself, so subsections can sit closer than a full row.
  const pads = gaps.map((g) => Math.max(0, g));
  const heights = gaps.map((g) => ITEM + Math.min(0, g));

  // Rows have animated heights, so the rail is laid out from them every frame:
  // one centre per row, with the line bending between rows of different depth.
  const layout = () => {
    let acc = 0;
    const centres = items.map((item, i) => {
      const g = item.depth === 1 ? groups.get(item.parent) : undefined;
      if (g && g.first === i) acc += hints[item.parent][0].get() * HINT;
      // A row's space above scales with how open it is, so a folded group takes none.
      const o = open[i].get();
      const c = acc + o * (pads[i] + heights[i] / 2);
      acc += o * (pads[i] + heights[i]);
      if (g && g.last === i) acc += hints[item.parent][1].get() * HINT;
      return c;
    });
    // A folded subsection sits on the main rail, so a closed group leaves no bend.
    const xs = items.map((item, i) => RAIL_X[0] + (RAIL_X[item.depth] - RAIL_X[0]) * open[i].get());
    return { centres, xs, total: acc };
  };

  // Where the dot is while travelling to a clicked item: it leaves from where it
  // was and is tweened in screen space, not scroll space, so its pace is even and
  // doesn't depend on how long the sections it crosses are. It stays on the
  // target until the scroll catches up.
  const travel = useMotionValue(1);
  const fromY = useMotionValue(0);
  const goingTo = useMotionValue(-1);

  // The point on the rail at height `yy`: x, and how deep (0..1) it is. The rail
  // is a line of cubics with vertical tangents, so solve for the curve parameter.
  const onRail = (yy: number, centres: number[], xs: number[]) => {
    if (yy <= centres[0]) return { x: xs[0], y: yy, depth: items[0].depth };
    if (yy >= centres[last]) return { x: xs[last], y: yy, depth: items[last].depth };
    let i = 0;
    while (i < last - 1 && centres[i + 1] < yy) i++;
    const [y0, y1, x0, x1] = [centres[i], centres[i + 1], xs[i], xs[i + 1]];
    const span = y1 - y0;
    const d0 = items[i].depth;
    const d1 = items[i + 1].depth;
    if (span < 0.001) return { x: x0, y: yy, depth: d0 };
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 10; k++) {
      const t = (lo + hi) / 2;
      const u = 1 - t;
      const yt = y0 + span * (3 * u * u * t * BEND + 3 * u * t * t * (1 - BEND) + t * t * t);
      if (yt < yy) lo = t;
      else hi = t;
    }
    const t = (lo + hi) / 2;
    return { x: x0 + (x1 - x0) * (3 * t * t - 2 * t * t * t), y: yy, depth: d0 + (d1 - d0) * t };
  };

  const place = () => {
    const { centres, xs } = layout();
    // Every value is read on every call, in either mode. The computed value only
    // subscribes to what the first call read, so a branch that skipped one would
    // never be updated by it.
    const to = goingTo.get();
    const from = fromY.get();
    const t = travel.get();
    const p = clamp(position.get(), 0, last);
    if (to >= 0 && to <= last) return onRail(from + (centres[to] - from) * t, centres, xs);
    const lo = Math.floor(p);
    const hi = Math.min(lo + 1, last);
    const f = p - lo;
    const span = centres[hi] - centres[lo];
    const u = 1 - f;
    const yy = centres[lo] + span * (3 * u * u * f * BEND + 3 * u * f * f * (1 - BEND) + f * f * f);
    return onRail(yy, centres, xs);
  };
  const dot = useTransform(() => place());
  const dotX = useTransform(dot, (d) => d.x);
  const y = useTransform(dot, (d) => d.y);
  const dotScale = useTransform(dot, (d) => 1 - 0.3 * d.depth);
  const total = useTransform(() => layout().total);
  const path = useTransform(() => {
    const { centres, xs, total } = layout();
    let d = `M ${xs[0]} 0 L ${xs[0]} ${centres[0]}`;
    for (let i = 1; i < centres.length; i++) {
      if (Math.abs(xs[i] - xs[i - 1]) < 0.01) d += ` L ${xs[i]} ${centres[i]}`;
      else {
        const s = centres[i] - centres[i - 1];
        d += ` C ${xs[i - 1]} ${centres[i - 1] + BEND * s}, ${xs[i]} ${centres[i] - BEND * s}, ${xs[i]} ${centres[i]}`;
      }
    }
    return `${d} L ${xs[last]} ${total}`;
  });
  const gid = useId().replace(/:/g, "");

  // A click drives the dot itself. `tweening` keeps it there until its trip is
  // over, even if the scroll has already finished.
  const [wave, setWave] = useState({ n: 0, index: 0 });
  const tweening = useRef(false);
  const targetNow = useRef<number | null>(null);
  useEffect(() => {
    targetNow.current = target;
    if (target === null && !tweening.current) goingTo.set(-1);
  }, [target, goingTo]);

  useEffect(() => {
    const to = targetNow.current;
    if (jumps === 0 || to === null) return;
    const centre = layout().centres[to];
    fromY.set(y.get());
    goingTo.set(to);
    travel.set(0);
    tweening.current = true;
    let cancelled = false;
    const distance = Math.abs(centre - y.get());
    const controls = animate(travel, 1, {
      duration: clamp(0.3 + distance / 800, 0.3, 0.75),
      ease: TRAVEL_EASE,
    });
    controls.then(() => {
      if (cancelled) return;
      tweening.current = false;
      if (targetNow.current === null) goingTo.set(-1);
      setWave((w) => ({ n: w.n + 1, index: to }));
    });
    return () => {
      cancelled = true;
      controls.stop();
    };
    // Runs once per click, reading the target and layout as they are at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumps]);

  return (
    <nav aria-label={label} className={cn("w-44", className)}>
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:text-neutral-600">{label}</p>
      <div className="relative">
        {/* Track, then the same path darkening from the track colour to black, clipped down to the dot. */}
        <motion.svg
          aria-hidden
          width={RAIL_X[1] + dotSize}
          style={{ height: total, maskImage: RAIL_FADE, WebkitMaskImage: RAIL_FADE }}
          className="absolute left-0 top-0 overflow-visible [--from:oklch(0.922_0_0)] [--to:oklch(0.2_0.005_270)] dark:[--from:oklch(0.269_0_0)] dark:[--to:oklch(0.97_0_0)]"
        >
          <defs>
            <motion.linearGradient id={`${gid}g`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={y}>
              <stop offset="0" style={{ stopColor: "var(--from)" }} />
              <stop offset="1" style={{ stopColor: "var(--to)" }} />
            </motion.linearGradient>
            <clipPath id={`${gid}c`}>
              <motion.rect x={-dotSize} y={0} width={RAIL_X[1] + dotSize * 2} height={y} />
            </clipPath>
          </defs>
          <motion.path d={path} fill="none" strokeWidth={lineWidth} strokeLinecap="round" className="stroke-neutral-200 dark:stroke-neutral-800" />
          <g clipPath={`url(#${gid}c)`}>
            <motion.path d={path} fill="none" strokeWidth={lineWidth} strokeLinecap="round" stroke={`url(#${gid}g)`} />
          </g>
        </motion.svg>
        <motion.span aria-hidden style={{ x: dotX, y }} className="absolute left-0 top-0">
          <motion.span
            style={{ scale: dotScale, width: dotSize, height: dotSize, marginLeft: -dotSize / 2, marginTop: -dotSize / 2 }}
            className="absolute block rounded-full bg-[oklch(0.2_0.005_270)] dark:bg-[oklch(0.97_0_0)]"
          />
        </motion.span>
        <ul>
          {items.map((item, i) => {
            const g = item.depth === 1 ? groups.get(item.parent) : undefined;
            const mine = item.parent === branch;
            return (
              <Fragment key={item.id}>
                {g && g.first === i && (
                  <Hint
                    reveal={hints[item.parent][0]}
                    direction="above"
                    indent={indent}
                    live={mine && above > 0}
                    onJump={() => jump(winStart - 1)}
                  />
                )}
                <Row
                  item={item}
                  reveal={open[i]}
                  gap={pads[i]}
                  rowHeight={heights[i]}
                  indent={indent}
                  interactive={shown(i)}
                  current={i === focus}
                  ancestor={i === ancestor}
                  waved={wave.n > 0 && wave.index === i ? wave.n : 0}
                  onJump={() => jump(i)}
                />
                {g && g.last === i && (
                  <Hint
                    reveal={hints[item.parent][1]}
                    direction="below"
                    indent={indent}
                    live={mine && below > 0}
                    onJump={() => jump(winEnd + 1)}
                  />
                )}
              </Fragment>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

// "More above" / "More below": stands in for the subsections folded out of the window.
// Set apart from titles on purpose: small caps with a chevron, like the heading.
function Hint({
  reveal,
  direction,
  indent,
  live,
  onJump,
}: {
  reveal: ReturnType<typeof useMotionValue<number>>;
  direction: "above" | "below";
  indent: number;
  live: boolean;
  onJump: () => void;
}) {
  const height = useTransform(reveal, (v) => v * HINT);
  return (
    <motion.li style={{ height, opacity: reveal }} className="overflow-hidden" inert={!live}>
      <button
        type="button"
        onClick={onJump}
        style={{ height: HINT, paddingLeft: indent }}
        className="flex w-full cursor-pointer items-center gap-1 rounded-sm text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400 outline-none transition-colors duration-200 hover:text-neutral-700 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:text-neutral-600 dark:hover:text-neutral-300 dark:focus-visible:ring-neutral-600"
      >
        {direction === "above" ? <IconChevronUp size={12} stroke={2} aria-hidden /> : <IconChevronDown size={12} stroke={2} aria-hidden />}
        {direction === "above" ? "More above" : "More below"}
      </button>
    </motion.li>
  );
}

function Row({
  item,
  reveal,
  gap,
  rowHeight,
  indent,
  interactive,
  current,
  ancestor,
  waved,
  onJump,
}: {
  item: { id: string; title: string; depth: 0 | 1 };
  reveal: ReturnType<typeof useMotionValue<number>>;
  /** Space above the row, px. */
  gap: number;
  rowHeight: number;
  /** Left padding of a subsection title, px. */
  indent: number;
  interactive: boolean;
  current: boolean;
  ancestor: boolean;
  /** Ticks each time the dot lands on this row. */
  waved: number;
  onJump: () => void;
}) {
  const height = useTransform(reveal, (v) => v * (gap + rowHeight));
  const paddingTop = useTransform(reveal, (v) => v * gap);
  const opacity = useTransform(reveal, (v) => v * v);
  const child = item.depth === 1;

  return (
    <motion.li style={{ height, paddingTop, opacity }} className="overflow-hidden" inert={!interactive}>
      <a
        href={`#${item.id}`}
        aria-current={current ? "location" : undefined}
        title={item.title}
        onClick={(e) => {
          e.preventDefault();
          onJump();
        }}
        style={{ height: rowHeight, paddingLeft: child ? indent : undefined }}
        className={cn(
          "group flex items-center rounded-sm font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-600",
          child ? "text-[13px]" : "pl-5 text-sm",
          current
            ? "text-zinc-900 dark:text-zinc-100"
            : ancestor
              ? "text-neutral-700 dark:text-neutral-300"
              : cn(
                  "hover:text-neutral-700 dark:hover:text-neutral-300",
                  child ? "text-neutral-400 dark:text-neutral-600" : "text-neutral-500 dark:text-neutral-500",
                ),
        )}
      >
        {/* The text box: the wave is laid over exactly this, and long titles truncate here. */}
        <span
          className={cn(
            "relative block min-w-0 truncate transition-transform duration-200",
            !current && "group-hover:translate-x-0.5",
          )}
        >
          {item.title}
          {waved > 0 && <Wave key={waved} title={item.title} />}
        </span>
      </a>
    </motion.li>
  );
}

// One soft band travelling left to right through a title, over the title's own
// box, dimming the letters it passes over. Plays once on mount.
function Wave({ title }: { title: string }) {
  const w = useMotionValue(-BAND);
  useEffect(() => {
    const controls = animate(w, 100 + BAND, { duration: 0.7, ease: [0.45, 0, 0.2, 1] });
    return () => controls.stop();
  }, [w]);

  const text = useTransform(
    w,
    (v) => `linear-gradient(in oklch 90deg, transparent ${v - BAND}%, var(--dim) ${v}%, transparent ${v + BAND}%)`,
  );

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 block [--dim:oklch(0.84_0_0)] dark:[--dim:oklch(0.34_0_0)]"
    >
      <motion.span style={{ backgroundImage: text }} className="block bg-clip-text text-transparent">
        {title}
      </motion.span>
    </span>
  );
}
