"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, MotionConfig, animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react";
import { IconFocusCentered, IconMinus, IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { Avatar, EASE_OUT, FOCUS, FRAME, LABEL } from "../_app/app-kit";

// Org chart explorer. The tree pans (drag, or scroll on a trackpad) and zooms
// (pinch, Ctrl/Cmd-scroll, or the buttons) around the pointer. Every node
// expands and collapses its reports: children grow out of their manager and
// fold back into it, connectors stretch with them, and the camera follows so
// the node you pressed stays under your pointer. Large teams of individual
// contributors stack in a column instead of spreading the tree wide.
//
// Search flies the camera to a person, opening every manager above them on
// the way. Selecting someone shows their profile, with links up to their
// manager and down to their reports. The minimap shows the whole tree and
// where you are in it; drag inside it to move.
//
// The camera is three motion values written straight to one transform, so
// panning and zooming never re-render React. Node and connector positions
// animate on transform and path data only.
//
// Keyboard: arrows pan, + and − zoom, 0 fits the tree, Enter on a node
// selects it and Space expands or collapses it.

const W = 224; // node width, px
const H = 64; // node height, px
const GAP_X = 24;
const GAP_Y = 56;
const STACK_GAP = 10;
const INDENT = 28; // stacked reports sit this far right of their manager
const MIN_Z = 0.25;
const MAX_Z = 2;
const MOVE = { type: "spring", duration: 0.55, bounce: 0.08 } as const;

export type OrgPerson = {
  id: string;
  name: string;
  title: string;
  team?: string;
  avatar?: string;
  email?: string;
  location?: string;
  /** IANA time zone for their local time, e.g. "Europe/Lisbon". */
  timeZone?: string;
  reports?: OrgPerson[];
};

export const DEFAULT_TEAM_COLORS: Record<string, string> = {
  Executive: "#71717a",
  Engineering: "#6366f1",
  Design: "#ec4899",
  Sales: "#f59e0b",
  Operations: "#10b981",
};

// Photos from unsplash.com (Unsplash License), self-hosted: vnppvekjH6o,
// YmQ8TrsieE4, wm4DuvIpLj8, fZwrEs1M-kE, KAzgxInZXMo, 2E8rtbzItsc, 4rRBpPkopVw,
// InWUkRKyNbI, u68jZr7ky0I, p00aTs8sUHI, NoRsyXmHGpI, KmRM8RkL2ZI, h0_elok-uKI,
// dzbSQkqZzUw, Z4BTpfQx_q4, pAtA8xe_iVM, PK_t0Lrh7MM, Ft4p5E9HjTQ, 8Cbk_IGBoQU,
// pgkUp5k-JFc, pq918sjh894, gsxSEDbyzsE, yuOAcypoF1I, BBmi4nJjKk8.
const p = (id: string, name: string, title: string, team: string, location: string, timeZone: string, reports?: OrgPerson[]): OrgPerson => ({
  id,
  name,
  title,
  team,
  location,
  timeZone,
  avatar: `https://uibrik.com/registry/org-chart/${id}.webp`,
  email: `${id}@company.com`,
  reports,
});

export const SAMPLE_ORG: OrgPerson = p("naomi", "Naomi Brooks", "Chief Executive Officer", "Executive", "San Francisco", "America/Los_Angeles", [
  p("daniel", "Daniel Okafor", "VP of Engineering", "Engineering", "London", "Europe/London", [
    p("ines", "Inês Ferreira", "Engineering Manager, Platform", "Engineering", "Lisbon", "Europe/Lisbon", [
      p("ravi", "Ravi Menon", "Senior Software Engineer", "Engineering", "Bengaluru", "Asia/Kolkata"),
      p("leo", "Leo Hartmann", "Software Engineer", "Engineering", "Berlin", "Europe/Berlin"),
      p("sara", "Sara Lindqvist", "Software Engineer", "Engineering", "Stockholm", "Europe/Stockholm"),
      p("tomas", "Tomás Vega", "Site Reliability Engineer", "Engineering", "Madrid", "Europe/Madrid"),
    ]),
    p("kevin", "Kevin Mori", "Engineering Manager, Product", "Engineering", "Toronto", "America/Toronto", [
      p("amara", "Amara Nwosu", "Frontend Engineer", "Engineering", "Lagos", "Africa/Lagos"),
      p("felix", "Felix Wagner", "Backend Engineer", "Engineering", "Vienna", "Europe/Vienna"),
      p("julia", "Julia Novak", "Mobile Engineer", "Engineering", "Prague", "Europe/Prague"),
    ]),
  ]),
  p("clara", "Clara Jensen", "VP of Design", "Design", "Copenhagen", "Europe/Copenhagen", [
    p("noah", "Noah Fischer", "Product Designer", "Design", "Zurich", "Europe/Zurich"),
    p("maya", "Maya Iyer", "Brand Designer", "Design", "Mumbai", "Asia/Kolkata"),
    p("zoe", "Zoé Laurent", "UX Researcher", "Design", "Paris", "Europe/Paris"),
  ]),
  p("marcus", "Marcus Reid", "VP of Sales", "Sales", "New York", "America/New_York", [
    p("olivia", "Olivia Grant", "Account Executive", "Sales", "Chicago", "America/Chicago"),
    p("ethan", "Ethan Cole", "Account Executive", "Sales", "Austin", "America/Chicago"),
    p("lina", "Lina Haddad", "Sales Engineer", "Sales", "Dubai", "Asia/Dubai"),
    p("sam", "Sam Park", "Sales Development Rep", "Sales", "Seoul", "Asia/Seoul"),
  ]),
  p("grace", "Grace Liu", "Chief Operating Officer", "Operations", "Singapore", "Asia/Singapore", [
    p("ben", "Ben Carter", "Finance Lead", "Operations", "Sydney", "Australia/Sydney"),
    p("ava", "Ava Moreno", "Head of People", "Operations", "Mexico City", "America/Mexico_City", [
      p("jonah", "Jonah Weiss", "Recruiter", "Operations", "Tel Aviv", "Asia/Jerusalem"),
    ]),
  ]),
]);

export type OrgChartProps = {
  /** The person at the top, with everyone under them in `reports`. */
  root?: OrgPerson;
  /** Levels open on mount (1 shows only the root's reports). */
  defaultDepth?: number;
  /** Teams with three or more individual contributors stack them in a column. */
  stackReports?: boolean;
  /** Show the minimap. */
  minimap?: boolean;
  /** Colour for each team, by name. */
  teamColors?: Readonly<Record<string, string>>;
  /** Called when a person is selected, or null when cleared. */
  onSelect?: (person: OrgPerson | null) => void;
  className?: string;
};

type Flat = { person: OrgPerson; parent: string | null; depth: number };
type Box = { x: number; y: number };
type Edge = { id: string; from: string; to: string; stacked: boolean };

function flatten(root: OrgPerson) {
  const out = new Map<string, Flat>();
  const walk = (n: OrgPerson, parent: string | null, depth: number) => {
    out.set(n.id, { person: n, parent, depth });
    n.reports?.forEach((c) => walk(c, n.id, depth + 1));
  };
  walk(root, null, 0);
  return out;
}

/** Tidy top-down tree; columns of reports where a team is all leaves. */
function layout(root: OrgPerson, open: ReadonlySet<string>, stack: boolean) {
  const pos = new Map<string, Box>();
  const edges: Edge[] = [];
  const stacked = (n: OrgPerson) => stack && (n.reports?.length ?? 0) >= 3 && n.reports!.every((c) => !c.reports?.length || !open.has(c.id));
  const width = (n: OrgPerson): number => {
    if (!open.has(n.id) || !n.reports?.length) return W;
    if (stacked(n)) return W + INDENT;
    return Math.max(W, n.reports.reduce((s, c) => s + width(c), 0) + GAP_X * (n.reports.length - 1));
  };
  const place = (n: OrgPerson, left: number, y: number) => {
    const w = width(n);
    if (!open.has(n.id) || !n.reports?.length) {
      pos.set(n.id, { x: left + (w - W) / 2, y });
      return;
    }
    if (stacked(n)) {
      pos.set(n.id, { x: left, y });
      n.reports.forEach((c, i) => {
        pos.set(c.id, { x: left + INDENT, y: y + H + STACK_GAP * 2 + i * (H + STACK_GAP) });
        edges.push({ id: c.id, from: n.id, to: c.id, stacked: true });
      });
      return;
    }
    pos.set(n.id, { x: left + (w - W) / 2, y });
    let x = left + (w - (n.reports.reduce((s, c) => s + width(c), 0) + GAP_X * (n.reports.length - 1))) / 2;
    for (const c of n.reports) {
      place(c, x, y + H + GAP_Y);
      edges.push({ id: c.id, from: n.id, to: c.id, stacked: false });
      x += width(c) + GAP_X;
    }
  };
  place(root, 0, 0);
  let maxX = 0;
  let maxY = 0;
  for (const b of pos.values()) {
    maxX = Math.max(maxX, b.x + W);
    maxY = Math.max(maxY, b.y + H);
  }
  return { pos, edges, bounds: { w: maxX, h: maxY } };
}

/** Same four commands for every connector, so one morphs smoothly into another. */
function edgePath(a: Box, b: Box, stacked: boolean) {
  if (stacked) {
    const x = a.x + 18;
    const y = b.y + H / 2;
    return `M ${x} ${a.y + H} V ${y} H ${b.x} V ${y}`;
  }
  const ax = a.x + W / 2;
  const bx = b.x + W / 2;
  const mid = a.y + H + GAP_Y / 2;
  return `M ${ax} ${a.y + H} V ${mid} H ${bx} V ${b.y}`;
}
const pointPath = (a: Box) => `M ${a.x + W / 2} ${a.y + H} V ${a.y + H} H ${a.x + W / 2} V ${a.y + H}`;

export function OrgChart({
  root = SAMPLE_ORG,
  defaultDepth = 2,
  stackReports = true,
  minimap = true,
  teamColors = DEFAULT_TEAM_COLORS,
  onSelect,
  className,
}: OrgChartProps) {
  const reduce = useReducedMotion();
  const flat = useMemo(() => flatten(root), [root]);
  const [open, setOpen] = useState<Set<string>>(() => new Set([...flat.values()].filter((f) => f.depth < defaultDepth).map((f) => f.person.id)));
  const [selected, setSelected] = useState<string | null>(null);
  const [pulse, setPulse] = useState<{ id: string; n: number } | null>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [view, setView] = useState({ w: 0, h: 0 });
  const viewRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const z = useMotionValue(1);
  const fitted = useRef(false);
  const camAnim = useRef<{ stop: () => void }[]>([]);

  const { pos, edges, bounds } = useMemo(() => layout(root, open, stackReports), [root, open, stackReports]);
  const visible = [...pos.keys()];

  useLayoutEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setView({ w: e!.contentRect.width, h: e!.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─── Camera ────────────────────────────────────────────────────────────────

  const stopCam = () => {
    camAnim.current.forEach((a) => a.stop());
    camAnim.current = [];
  };
  const moveCam = (tx: number, ty: number, tz: number, instant = false) => {
    stopCam();
    if (instant || reduce) {
      x.set(tx);
      y.set(ty);
      z.set(tz);
      return;
    }
    const t = { type: "spring", duration: 0.7, bounce: 0 } as const;
    camAnim.current = [animate(x, tx, t), animate(y, ty, t), animate(z, tz, t)];
  };

  const fitCam = (b = bounds, instant = false) => {
    if (!view.w) return;
    const pad = 48;
    const s = Math.min(1, Math.max(MIN_Z, Math.min((view.w - pad * 2) / b.w, (view.h - pad * 2) / b.h)));
    moveCam((view.w - b.w * s) / 2, Math.max(pad, (view.h - b.h * s) / 2), s, instant);
  };

  // A passive effect, so the transform's subscriptions exist before the first move.
  useEffect(() => {
    if (!view.w || fitted.current) return;
    fitted.current = true;
    // Too big to read when fitted (a phone): open on the top person instead.
    const pad = 48;
    const fit = Math.min((view.w - pad * 2) / bounds.w, (view.h - pad * 2) / bounds.h);
    const top = pos.get(root.id);
    if (fit < 0.55 && top) moveCam(view.w / 2 - (top.x + W / 2) * 0.8, pad + 24, 0.8, true);
    else fitCam(bounds, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.w]);

  const zoomAt = (factor: number, px = view.w / 2, py = view.h / 2, instant = true) => {
    const s = z.get();
    const ns = Math.min(MAX_Z, Math.max(MIN_Z, s * factor));
    moveCam(px - ((px - x.get()) * ns) / s, py - ((py - y.get()) * ns) / s, ns, instant);
  };

  const centerOn = (b: Box, s = Math.max(z.get(), 0.9)) => moveCam(view.w / 2 - (b.x + W / 2) * s, view.h / 2 - (b.y + H / 2) * s, s);

  // Wheel: pinch and Ctrl/Cmd-scroll zoom, plain scroll pans.
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopCam();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      else {
        x.set(x.get() - e.deltaX);
        y.set(y.get() - e.deltaY);
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  // Drag to pan, two fingers to pinch. A drag that starts on a node still
  // pans; the node only takes the click if the pointer barely moved.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragged = useRef(false);
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-no-pan]")) return;
    stopCam();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged.current = false;
    const start = { x: e.clientX, y: e.clientY };
    const el = viewRef.current!;
    let pinch = 0;
    const move = (ev: PointerEvent) => {
      const pts = pointers.current;
      if (!pts.has(ev.pointerId)) return;
      const prev = pts.get(ev.pointerId)!;
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 4) dragged.current = true;
      if (pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        const r = el.getBoundingClientRect();
        if (pinch) zoomAt(d / pinch, (a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top);
        pinch = d;
        return;
      }
      x.set(x.get() + ev.clientX - prev.x);
      y.set(y.get() + ev.clientY - prev.y);
    };
    const up = (ev: PointerEvent) => {
      pointers.current.delete(ev.pointerId);
      pinch = 0;
      if (pointers.current.size) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    if (pointers.current.size === 1) {
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    }
  };

  // ─── Tree ──────────────────────────────────────────────────────────────────

  const select = (id: string | null) => {
    setSelected(id);
    onSelect?.(id ? flat.get(id)!.person : null);
  };

  const toggle = (id: string) => {
    const next = new Set(open);
    if (next.has(id)) {
      // Close the whole branch so it opens again one level at a time.
      const shut = (n: OrgPerson) => {
        next.delete(n.id);
        n.reports?.forEach(shut);
      };
      shut(flat.get(id)!.person);
    } else next.add(id);
    // Keep the pressed node where it is on screen.
    const before = pos.get(id)!;
    const after = layout(root, next, stackReports).pos.get(id)!;
    const s = z.get();
    moveCam(x.get() - (after.x - before.x) * s, y.get() - (after.y - before.y) * s, s);
    setOpen(next);
  };

  const flyTo = (id: string) => {
    const next = new Set(open);
    for (let p = flat.get(id)?.parent; p; p = flat.get(p)?.parent ?? null) next.add(p);
    setOpen(next);
    const target = layout(root, next, stackReports).pos.get(id);
    if (target) centerOn(target);
    select(id);
    setPulse((p) => ({ id, n: (p?.n ?? 0) + 1 }));
  };

  // ─── Search ────────────────────────────────────────────────────────────────

  const q = query.trim().toLowerCase();
  const results = q
    ? [...flat.values()].filter((f) => f.person.name.toLowerCase().includes(q) || f.person.title.toLowerCase().includes(q) || f.person.team?.toLowerCase().includes(q)).slice(0, 6)
    : [];

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(results.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      flyTo(results[active]!.person.id);
      setSearchOpen(false);
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "Escape") {
      setQuery("");
      setSearchOpen(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("input")) return;
    const step = 60;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => moveCam(x.get() + step, y.get(), z.get(), true),
      ArrowRight: () => moveCam(x.get() - step, y.get(), z.get(), true),
      ArrowUp: () => moveCam(x.get(), y.get() + step, z.get(), true),
      ArrowDown: () => moveCam(x.get(), y.get() - step, z.get(), true),
      "+": () => zoomAt(1.2, undefined, undefined, false),
      "=": () => zoomAt(1.2, undefined, undefined, false),
      "-": () => zoomAt(1 / 1.2, undefined, undefined, false),
      "0": () => fitCam(),
      Escape: () => select(null),
    };
    const fn = keys[e.key];
    if (!fn) return;
    e.preventDefault();
    fn();
  };

  const person = selected ? flat.get(selected) : undefined;

  return (
    <MotionConfig reducedMotion="user">
      <div className={cn(FRAME, "@container relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden", className)}>
        <div
          ref={viewRef}
          tabIndex={0}
          role="application"
          aria-label="Organisation chart. Drag or use arrow keys to move, plus and minus to zoom, 0 to fit."
          onPointerDown={onPointerDown}
          onKeyDown={onKeyDown}
          className={cn(
            "relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden rounded-[inherit] outline-none active:cursor-grabbing",
            FOCUS,
          )}
          style={{
            backgroundImage: "radial-gradient(color-mix(in srgb, var(--foreground) 9%, transparent) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        >
          <motion.div className="absolute left-0 top-0 origin-top-left will-change-transform" style={{ x, y, scale: z }}>
            <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={1} height={1} aria-hidden>
              <AnimatePresence initial={false}>
                {edges.map((ed) => {
                  const a = pos.get(ed.from)!;
                  const b = pos.get(ed.to)!;
                  return (
                    <motion.path
                      key={ed.id}
                      initial={{ d: pointPath(a), opacity: 0 }}
                      animate={{ d: edgePath(a, b, ed.stacked), opacity: 1 }}
                      exit={{ d: pointPath(a), opacity: 0 }}
                      transition={MOVE}
                      fill="none"
                      stroke="color-mix(in srgb, var(--foreground) 18%, transparent)"
                      strokeWidth={1.5}
                      strokeLinejoin="round"
                    />
                  );
                })}
              </AnimatePresence>
            </svg>

            <AnimatePresence initial={false} custom={pos}>
              {visible.map((id) => {
                const f = flat.get(id)!;
                const b = pos.get(id)!;
                return (
                  <Node
                    key={id}
                    person={f.person}
                    at={b}
                    from={f.parent ? pos.get(f.parent) : undefined}
                    parent={f.parent}
                    open={open.has(id)}
                    selected={selected === id}
                    pulse={pulse?.id === id ? pulse.n : 0}
                    color={teamColors[f.person.team ?? ""]}
                    dragged={dragged}
                    onSelect={() => select(selected === id ? null : id)}
                    onToggle={() => toggle(id)}
                  />
                );
              })}
            </AnimatePresence>
          </motion.div>

          {/* Search */}
          <div data-no-pan className="absolute left-2 top-2 z-10 w-[min(18rem,calc(100%-6.5rem))]">
            <label className="relative block">
              <span className="sr-only">Find a person</span>
              <IconSearch size={15} stroke={1.75} aria-hidden className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setSearchOpen(false)}
                onKeyDown={onSearchKey}
                role="combobox"
                aria-expanded={searchOpen && results.length > 0}
                aria-controls="org-results"
                placeholder="Find a person or team"
                className="h-9 w-full rounded-xl bg-background/90 pl-9 pr-3 text-[13px] text-foreground shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_8%,transparent),0_4px_12px_-6px_rgb(0_0_0/0.15)] outline-none backdrop-blur placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-foreground/15"
              />
            </label>
            <AnimatePresence>
              {searchOpen && results.length > 0 && (
                <motion.ul
                  id="org-results"
                  role="listbox"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  transition={{ duration: 0.16, ease: EASE_OUT }}
                  className="mt-1 rounded-xl bg-background p-1 shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_8%,transparent),0_12px_32px_-8px_rgb(0_0_0/0.25)] dark:bg-neutral-900"
                >
                  {results.map((r, i) => (
                    <li
                      key={r.person.id}
                      role="option"
                      aria-selected={i === active}
                      onPointerDown={(e) => {
                        e.preventDefault();
                        flyTo(r.person.id);
                        setSearchOpen(false);
                      }}
                      onPointerEnter={() => setActive(i)}
                      className={cn("flex h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2", i === active && "bg-muted")}
                    >
                      <Avatar name={r.person.name} src={r.person.avatar} size={28} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-foreground">{r.person.name}</span>
                        <span className="block truncate text-[12px] text-muted-foreground">{r.person.title}</span>
                      </span>
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>

          {/* Zoom */}
          <div data-no-pan className="absolute right-2 top-2 z-10 flex flex-col rounded-xl bg-background/90 p-0.5 shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_8%,transparent),0_4px_12px_-6px_rgb(0_0_0/0.15)] backdrop-blur">
            <ZoomButton label="Zoom in" onClick={() => zoomAt(1.25, undefined, undefined, false)}>
              <IconPlus size={16} stroke={1.75} />
            </ZoomButton>
            <ZoomButton label="Zoom out" onClick={() => zoomAt(0.8, undefined, undefined, false)}>
              <IconMinus size={16} stroke={1.75} />
            </ZoomButton>
            <ZoomButton label="Fit to screen" onClick={() => fitCam()}>
              <IconFocusCentered size={16} stroke={1.75} />
            </ZoomButton>
          </div>

          {minimap && view.w > 480 && (
            <Minimap pos={pos} bounds={bounds} view={view} x={x} y={y} z={z} onMove={(nx, ny) => moveCam(nx, ny, z.get(), true)} />
          )}

          <AnimatePresence>
            {person && (
              <Profile
                key="profile"
                f={person}
                flat={flat}
                color={teamColors[person.person.team ?? ""]}
                onClose={() => select(null)}
                onGo={flyTo}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </MotionConfig>
  );
}

// ─── Node ────────────────────────────────────────────────────────────────────

function Node({
  person,
  at,
  from,
  parent,
  open,
  selected,
  pulse,
  color,
  dragged,
  onSelect,
  onToggle,
}: {
  person: OrgPerson;
  at: Box;
  from?: Box;
  parent: string | null;
  open: boolean;
  selected: boolean;
  pulse: number;
  color?: string;
  dragged: { current: boolean };
  onSelect: () => void;
  onToggle: () => void;
}) {
  const count = person.reports?.length ?? 0;
  const start = from ?? at;
  return (
    <motion.div
      data-node
      className="absolute left-0 top-0"
      style={{ width: W, height: H }}
      initial={{ x: start.x, y: start.y, opacity: 0, scale: 0.85 }}
      animate={{ x: at.x, y: at.y, opacity: 1, scale: 1 }}
      // Leaving nodes fold into where their manager is now (the latest layout,
      // handed over by AnimatePresence's `custom`).
      variants={{
        gone: (latest: Map<string, Box>) => {
          const to = (parent && latest.get(parent)) || at;
          return { x: to.x, y: to.y, opacity: 0, scale: 0.85 };
        },
      }}
      exit="gone"
      transition={MOVE}
    >
      <AnimatePresence>
        {pulse > 0 && (
          <motion.span
            key={pulse}
            aria-hidden
            className="pointer-events-none absolute -inset-1 rounded-[18px] border-2 border-foreground/40"
            initial={{ opacity: 1, scale: 1 }}
            animate={{ opacity: 0, scale: 1.12 }}
            transition={{ duration: 0.9, delay: 0.45, ease: EASE_OUT }}
          />
        )}
      </AnimatePresence>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => !dragged.current && onSelect()}
        onKeyDown={(e) => {
          if (e.key === " " && count) {
            e.preventDefault();
            onToggle();
          }
        }}
        className={cn(
          "flex size-full cursor-pointer items-center gap-3 rounded-2xl bg-background pl-3 pr-10 text-left transition-shadow duration-150",
          "shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_8%,transparent),0_2px_6px_-2px_rgb(0_0_0/0.08)] hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_14%,transparent),0_6px_16px_-6px_rgb(0_0_0/0.15)] dark:bg-neutral-900",
          selected && "shadow-[0_0_0_2px_var(--foreground),0_6px_16px_-6px_rgb(0_0_0/0.2)] hover:shadow-[0_0_0_2px_var(--foreground),0_6px_16px_-6px_rgb(0_0_0/0.2)]",
          FOCUS,
        )}
      >
        <Avatar name={person.name} src={person.avatar} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-foreground">{person.name}</span>
          <span className="flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
            {color && <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />}
            <span className="truncate">{person.title}</span>
          </span>
        </span>
      </button>
      {count > 0 && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${open ? "Hide" : "Show"} ${count} reports`}
          aria-expanded={open}
          onClick={() => !dragged.current && onToggle()}
          className={cn(
            "absolute right-2 top-1/2 grid h-6 min-w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-full px-1.5 text-[11px] font-medium tabular-nums transition-colors",
            open ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
          )}
        >
          {count}
        </button>
      )}
    </motion.div>
  );
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn("grid size-8 cursor-pointer place-items-center rounded-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", FOCUS)}
    >
      {children}
    </button>
  );
}

// ─── Minimap ─────────────────────────────────────────────────────────────────

function Minimap({
  pos,
  bounds,
  view,
  x,
  y,
  z,
  onMove,
}: {
  pos: Map<string, Box>;
  bounds: { w: number; h: number };
  view: { w: number; h: number };
  x: MotionValue<number>;
  y: MotionValue<number>;
  z: MotionValue<number>;
  onMove: (x: number, y: number) => void;
}) {
  const MW = 168;
  const pad = 80;
  const k = MW / (bounds.w + pad * 2);
  const MH = Math.min(120, (bounds.h + pad * 2) * k);
  const kk = Math.min(k, MH / (bounds.h + pad * 2));
  const ox = (MW - (bounds.w + pad * 2) * kk) / 2 + pad * kk;
  const oy = pad * kk;
  const rx = useTransform(() => ox + (-x.get() / z.get()) * kk);
  const ry = useTransform(() => oy + (-y.get() / z.get()) * kk);
  const rw = useTransform(() => (view.w / z.get()) * kk);
  const rh = useTransform(() => (view.h / z.get()) * kk);

  const jump = (e: ReactPointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const wx = (e.clientX - r.left - ox) / kk;
    const wy = (e.clientY - r.top - oy) / kk;
    onMove(view.w / 2 - wx * z.get(), view.h / 2 - wy * z.get());
  };

  return (
    <div data-no-pan className="absolute bottom-2 right-2 z-10 overflow-hidden rounded-xl bg-background/90 shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_8%,transparent),0_4px_12px_-6px_rgb(0_0_0/0.15)] backdrop-blur">
      <svg
        width={MW}
        height={MH}
        className="block cursor-pointer touch-none"
        aria-label="Minimap"
        role="img"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          jump(e);
        }}
        onPointerMove={(e) => e.buttons && jump(e)}
      >
        {[...pos.values()].map((b, i) => (
          <motion.rect
            key={i}
            initial={false}
            animate={{ x: ox + b.x * kk, y: oy + b.y * kk }}
            transition={MOVE}
            width={W * kk}
            height={H * kk}
            rx={2}
            className="fill-foreground/20"
          />
        ))}
        <motion.rect x={rx} y={ry} width={rw} height={rh} rx={3} className="fill-foreground/[0.04] stroke-foreground/50" strokeWidth={1} />
      </svg>
    </div>
  );
}

// ─── Profile ─────────────────────────────────────────────────────────────────

function Profile({
  f,
  flat,
  color,
  onClose,
  onGo,
}: {
  f: Flat;
  flat: Map<string, Flat>;
  color?: string;
  onClose: () => void;
  onGo: (id: string) => void;
}) {
  const p = f.person;
  const manager = f.parent ? flat.get(f.parent)?.person : undefined;
  const [local] = useState(() =>
    p.timeZone ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: p.timeZone }).format(new Date()) : null,
  );
  return (
    <motion.aside
      data-no-pan
      aria-label={`${p.name} profile`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ type: "spring", duration: 0.35, bounce: 0 }}
      className="absolute bottom-2 left-2 z-20 w-[min(20rem,calc(100%-1rem))] cursor-default rounded-2xl bg-background p-4 shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_8%,transparent),0_16px_40px_-12px_rgb(0_0_0/0.3)] dark:bg-neutral-900"
    >
      <button
        type="button"
        aria-label="Close profile"
        onClick={onClose}
        className={cn("absolute right-2 top-2 grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground", FOCUS)}
      >
        <IconX size={15} stroke={1.75} />
      </button>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={p.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18, ease: EASE_OUT }}>
          <div className="flex items-center gap-3 pr-8">
            <Avatar name={p.name} src={p.avatar} size={52} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-foreground">{p.name}</p>
              <p className="truncate text-[13px] text-muted-foreground">{p.title}</p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5 text-[13px]">
            {p.team && (
              <div>
                <dt className="text-[12px] text-muted-foreground">Team</dt>
                <dd className="flex items-center gap-1.5 font-medium text-foreground">
                  {color && <span aria-hidden className="size-1.5 rounded-full" style={{ background: color }} />}
                  {p.team}
                </dd>
              </div>
            )}
            {p.location && (
              <div>
                <dt className="text-[12px] text-muted-foreground">Location</dt>
                <dd className="truncate font-medium text-foreground">
                  {p.location}
                  {local && <span className="font-normal text-muted-foreground"> · {local}</span>}
                </dd>
              </div>
            )}
            {p.email && (
              <div className="col-span-2">
                <dt className="text-[12px] text-muted-foreground">Email</dt>
                <dd className="truncate font-medium text-foreground">
                  <a href={`mailto:${p.email}`} className="rounded hover:underline">
                    {p.email}
                  </a>
                </dd>
              </div>
            )}
          </dl>
          {manager && (
            <div className="mt-4">
              <p className={LABEL}>Reports to</p>
              <PersonLink person={manager} onClick={() => onGo(manager.id)} />
            </div>
          )}
          {!!p.reports?.length && (
            <div className="mt-4">
              <p className={LABEL}>
                Direct reports <span className="tabular-nums">{p.reports.length}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {p.reports.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    title={r.name}
                    aria-label={`Go to ${r.name}`}
                    onClick={() => onGo(r.id)}
                    className={cn("cursor-pointer rounded-full transition-transform hover:-translate-y-0.5", FOCUS)}
                  >
                    <Avatar name={r.name} src={r.avatar} size={32} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.aside>
  );
}

function PersonLink({ person, onClick }: { person: OrgPerson; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("-mx-1.5 mt-1.5 flex w-[calc(100%+0.75rem)] cursor-pointer items-center gap-2.5 rounded-xl px-1.5 py-1.5 text-left hover:bg-muted", FOCUS)}
    >
      <Avatar name={person.name} src={person.avatar} size={30} />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-foreground">{person.name}</span>
        <span className="block truncate text-[12px] text-muted-foreground">{person.title}</span>
      </span>
    </button>
  );
}
