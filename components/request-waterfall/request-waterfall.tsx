"use client";

// A network waterfall, like the one in browser dev tools, without the noise.
// Bars draw in from left to right in the order the requests started. Hovering a
// row pulls its bar apart into phases (DNS, connect, TLS, waiting, download)
// and names its time; opening it lays each phase out on its own line, on the
// same time axis, so you can see where the time went. Phases are shades of one
// colour; markers show when the page became interactive and finished loading.
// Hovering a row draws guides at its start and end across the list and dims
// the rest; hovering a marker dims every request that finished after it.

import { IconAlertTriangle, IconArrowsExchange, IconCode, IconFile, IconFileText, IconPalette, IconPhoto, IconTypography } from "@tabler/icons-react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const OPEN = { type: "spring", duration: 0.36, bounce: 0 } as const;

export type RequestPhases = {
  queued?: number;
  dns?: number;
  connect?: number;
  tls?: number;
  /** Time to first byte. */
  waiting?: number;
  download?: number;
};

export type NetworkRequest = {
  /** Shown as written, usually the file name. */
  name: string;
  /** e.g. "document", "script", "style", "image", "font", "fetch". */
  type: string;
  /** Transfer size in bytes. */
  size?: number;
  /** When the request started, in ms from navigation. */
  start: number;
  /** Milliseconds spent in each phase. */
  phases: RequestPhases;
  /** HTTP status; anything 400 and up is marked. */
  status?: number;
};

export type WaterfallMarker = { label: string; time: number };

export type RequestWaterfallProps = {
  requests?: NetworkRequest[];
  /** Vertical lines across the rows, e.g. DOMContentLoaded and Load. */
  markers?: WaterfallMarker[];
  title?: string;
  /** Colour the phases are shaded from. */
  color?: string;
  /** Show the size column when there is room. */
  showSize?: boolean;
  /** Index of the open row; null for none. Pair with onOpenChange. */
  open?: number | null;
  defaultOpen?: number | null;
  onOpenChange?: (index: number | null) => void;
  /** Width of the card in px; never wider than its container. */
  width?: number;
  className?: string;
};

const PHASES = [
  { key: "queued", label: "Queued", tone: 0 },
  { key: "dns", label: "DNS lookup", tone: 0.3 },
  { key: "connect", label: "Connect", tone: 0.45 },
  { key: "tls", label: "TLS", tone: 0.6 },
  { key: "waiting", label: "Waiting", tone: 1 },
  { key: "download", label: "Download", tone: 0.78 },
] as const satisfies readonly { key: keyof RequestPhases; label: string; tone: number }[];

// One small glyph per resource type, so rows scan by kind before name.
const TYPE_ICON: Record<string, typeof IconFile> = {
  document: IconFileText,
  script: IconCode,
  style: IconPalette,
  image: IconPhoto,
  font: IconTypography,
  fetch: IconArrowsExchange,
  xhr: IconArrowsExchange,
};

const fill = (tone: number) => (tone === 0 ? "color-mix(in oklab, currentColor 14%, transparent)" : `color-mix(in oklab, var(--rw-color) ${Math.round(tone * 100)}%, transparent)`);

const ms = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 1 : 2)} s` : `${Math.round(v)} ms`);
const bytes = (b: number) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1000 ? `${Math.round(b / 1000)} kB` : `${b} B`);
const duration = (p: RequestPhases) => PHASES.reduce((t, ph) => t + (p[ph.key] ?? 0), 0);

// A round scale end and tick step that leave a little air after the last bar.
function scale(end: number) {
  const steps = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];
  const step = steps.find((s) => end / s <= 5) ?? 10000;
  return { max: Math.ceil((end * 1.04) / step) * step, step };
}

export function RequestWaterfall({
  requests = DEFAULT_REQUESTS,
  markers = DEFAULT_MARKERS,
  title = "Network",
  color = "#2f7cf6",
  showSize = true,
  open: openProp,
  defaultOpen = null,
  onOpenChange,
  width = 640,
  className,
}: RequestWaterfallProps) {
  const id = useId();
  const reduce = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const inView = useInView(root, { once: true, amount: 0.3 });
  const [inner, setInner] = useState<number | null>(defaultOpen);
  const open = openProp !== undefined ? openProp : inner;
  const [hover, setHover] = useState<number | null>(null);
  const [markerHover, setMarkerHover] = useState<number | null>(null);

  const setOpen = (i: number | null) => {
    if (openProp === undefined) setInner(i);
    onOpenChange?.(i);
  };

  const { max, step, totalBytes, end } = useMemo(() => {
    const end = Math.max(...requests.map((r) => r.start + duration(r.phases)), ...markers.map((m) => m.time), 1);
    return { ...scale(end), end, totalBytes: requests.reduce((t, r) => t + (r.size ?? 0), 0) };
  }, [requests, markers]);
  const pct = (v: number) => `${(v / max) * 100}%`;
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const drawn = inView || !!reduce;
  const hovered = hover !== null ? requests[hover] : null;
  const guide = hovered ? { from: hovered.start, to: hovered.start + duration(hovered.phases) } : null;
  const cutoff = markerHover !== null ? markers[markerHover]?.time : undefined;

  // Two columns shared by the axis, the rows and the open detail, so every bar lines up.
  const grid = cn("grid items-center gap-3", showSize ? "grid-cols-[minmax(96px,34%)_1fr] @[480px]:grid-cols-[minmax(120px,30%)_52px_1fr]" : "grid-cols-[minmax(96px,34%)_1fr]");

  return (
    <div className={cn("flex w-full justify-center", className)} style={{ maxWidth: width }}>
      <div
        ref={root}
        className="@container w-full rounded-[24px] bg-(--rw-tint) p-1.5 text-sm text-foreground [--rw-panel:#ffffff] [--rw-tint:#f0f0f0] [--rw-well:#f5f5f5] dark:[--rw-panel:#0c0c0c] dark:[--rw-tint:#161616] dark:[--rw-well:#1c1c1c]"
        style={{ "--rw-color": color } as CSSProperties}
      >
        <div className="flex items-baseline justify-between gap-3 px-3 pb-2.5 pt-2">
          <h3 id={`${id}-title`} className="truncate font-medium">
            {title}
          </h3>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {requests.length} requests · {bytes(totalBytes)} · {ms(end)}
          </span>
        </div>

        <div className="rounded-[18px] bg-(--rw-panel) p-1.5">
          {/* Time axis. */}
          <div className={cn(grid, "h-7 px-2.5 text-[11px] tabular-nums text-muted-foreground")} aria-hidden>
            <span>Name</span>
            {showSize && <span className="hidden text-right @[480px]:block">Size</span>}
            <span className="relative h-full">
              {ticks.map((t, i) => (
                // Every other tick gives way on narrow cards so labels never collide.
                <span key={t} className={cn("absolute inset-y-0 items-center whitespace-nowrap transition-opacity duration-150", i % 2 ? "hidden @[480px]:flex" : "flex", guide && "opacity-0")} style={{ left: pct(t), transform: `translateX(${t === 0 ? 0 : t === max ? -100 : -50}%)` }}>
                  {t === 0 ? "0" : ms(t)}
                </span>
              ))}
              {/* While a row is hovered, the axis reads its start instead of the ticks. */}
              <AnimatePresence>
                {guide && (
                  <motion.span
                    key="readout"
                    initial={{ opacity: 0, y: 3 }}
                    animate={{ opacity: 1, y: 0, left: pct(guide.from) }}
                    exit={{ opacity: 0, y: -3 }}
                    transition={{ duration: 0.18, ease: EASE_OUT }}
                    className="absolute inset-y-0 flex items-center whitespace-nowrap text-foreground"
                    style={{ x: guide.from / max > 0.7 ? "-100%" : 0 }}
                  >
                    <span className="rounded-full bg-(--rw-well) px-1.5 leading-5">
                      {ms(guide.from)} → {ms(guide.to)}
                    </span>
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          </div>

          <div className="relative">
            {/* Markers run behind every row, in the timeline column only. */}
            <div className={cn(grid, "pointer-events-none absolute inset-0 px-2.5")} aria-hidden>
              <span />
              {showSize && <span className="hidden @[480px]:block" />}
              <span className="relative h-full">
                {markers.map((m, i) => (
                  <motion.span
                    key={m.label}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: drawn ? 1 : 0 }}
                    transition={{ duration: 0.4, delay: reduce ? 0 : 0.25 + (m.time / max) * 0.9 }}
                    className={cn("absolute inset-y-0 w-px border-l border-dashed transition-colors duration-150", markerHover === i ? "border-foreground/70" : "border-foreground/25")}
                    style={{ left: pct(m.time) }}
                  />
                ))}
                {/* Guides at the hovered request's start and end, across every row. */}
                {(["from", "to"] as const).map((k) => (
                  <motion.span
                    key={k}
                    className="absolute inset-y-0 w-px bg-(--rw-color)"
                    initial={false}
                    animate={{ opacity: guide ? 0.45 : 0, left: guide ? pct(guide[k]) : undefined }}
                    transition={{ opacity: { duration: 0.15 }, left: { duration: 0.2, ease: EASE_OUT } }}
                  />
                ))}
              </span>
            </div>

            <ul className="relative flex flex-col gap-px" aria-labelledby={`${id}-title`}>
              {requests.map((r, i) => (
                <Row
                  key={`${r.name}-${i}`}
                  req={r}
                  grid={grid}
                  showSize={showSize}
                  pct={pct}
                  max={max}
                  open={open === i}
                  hovered={hover === i}
                  dim={(hover !== null && hover !== i) || (cutoff !== undefined && r.start + duration(r.phases) > cutoff)}
                  drawn={drawn}
                  reduce={!!reduce}
                  onHover={(on) => setHover(on ? i : (h) => (h === i ? null : h))}
                  onToggle={() => setOpen(open === i ? null : i)}
                />
              ))}
            </ul>
          </div>

          {/* Marker labels sit under the rows, aligned to their lines. */}
          {markers.length > 0 && (
            <div className={cn(grid, "h-7 px-2.5 text-[11px] text-muted-foreground")}>
              <span />
              {showSize && <span className="hidden @[480px]:block" />}
              <span className="relative h-full">
                {markers.map((m, i) => (
                  <span
                    key={m.label}
                    // Hovering a marker dims every request that finished after it.
                    onPointerEnter={() => setMarkerHover(i)}
                    onPointerLeave={() => setMarkerHover(null)}
                    className={cn("absolute top-1/2 cursor-default whitespace-nowrap tabular-nums transition-colors duration-150", markerHover === i && "text-foreground")}
                    style={{ left: pct(m.time), transform: `translate(${m.time / max > 0.4 ? "calc(-100% - 6px)" : "6px"}, ${i % 2 ? "-10%" : "-90%"})` }}
                  >
                    {m.label} <span className="text-foreground/40">{ms(m.time)}</span>
                  </span>
                ))}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  req,
  grid,
  showSize,
  pct,
  max,
  open,
  hovered,
  dim,
  drawn,
  reduce,
  onHover,
  onToggle,
}: {
  req: NetworkRequest;
  grid: string;
  showSize: boolean;
  pct: (v: number) => string;
  max: number;
  open: boolean;
  hovered: boolean;
  dim: boolean;
  drawn: boolean;
  reduce: boolean;
  onHover: (on: boolean) => void;
  onToggle: () => void;
}) {
  const total = duration(req.phases);
  const parts = PHASES.filter((p) => (req.phases[p.key] ?? 0) > 0);
  const split = hovered || open;
  const failed = (req.status ?? 200) >= 400;
  const endPct = (req.start + total) / max;
  const Icon = failed ? IconAlertTriangle : (TYPE_ICON[req.type] ?? IconFile);

  return (
    <li className={cn("rounded-[12px] transition-colors duration-150", open ? "bg-(--rw-well)" : hovered && "bg-(--rw-well)/60")}>
      <button
        type="button"
        onClick={onToggle}
        onPointerEnter={(e) => e.pointerType === "mouse" && onHover(true)}
        onPointerLeave={() => onHover(false)}
        onFocus={() => onHover(true)}
        onBlur={() => onHover(false)}
        aria-expanded={open}
        aria-label={`${req.name}, ${req.type}, ${ms(total)}`}
        className={cn(grid, "h-9 w-full cursor-pointer rounded-[12px] px-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/50")}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-[7px] transition-colors duration-150",
              failed ? "bg-red-500/10 text-red-500" : open || hovered ? "bg-(--rw-panel) text-foreground" : "bg-(--rw-well) text-muted-foreground",
            )}
          >
            <Icon size={13} stroke={1.75} />
          </span>
          <span className={cn("truncate text-[13px]", failed && "text-red-500")}>{req.name}</span>
        </span>
        {showSize && <span className="hidden text-right text-xs tabular-nums text-muted-foreground @[480px]:block">{req.size != null ? bytes(req.size) : "–"}</span>}
        <span className={cn("relative h-full text-foreground/80 transition-opacity duration-200", dim && "opacity-30")}>
          <motion.span
            className="absolute top-1/2 flex h-2.5 -translate-y-1/2 origin-left"
            style={{ left: pct(req.start), width: `max(3px, ${pct(total)})` }}
            initial={reduce ? false : { scaleX: 0, opacity: 0 }}
            animate={drawn ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: EASE_OUT, delay: reduce ? 0 : (req.start / max) * 0.9 }}
          >
            {parts.map((p, k) => (
              <motion.span
                key={p.key}
                className={cn("h-full", k === 0 && "rounded-l-full", k === parts.length - 1 && "rounded-r-full")}
                // Pulled apart, the phases read as separate pieces.
                animate={{ x: split ? k * 2 : 0, borderRadius: split ? 999 : undefined }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
                style={{ width: `${((req.phases[p.key] ?? 0) / total) * 100}%`, minWidth: split ? 2 : 0, background: fill(p.tone) }}
              />
            ))}
          </motion.span>
          <AnimatePresence>
            {split && (
              <motion.span
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.16, ease: EASE_OUT }}
                className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground"
                // The label sits after the bar, or before it when the bar runs to the edge.
                style={endPct > 0.78 ? { right: `calc(${100 - (req.start / max) * 100}% + 8px)` } : { left: `calc(${endPct * 100}% + ${parts.length * 2 + 6}px)` }}
              >
                {ms(total)}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { ...OPEN, opacity: { duration: 0.18 } }}
            className="overflow-hidden"
          >
            <ul className="flex flex-col pb-2">
              {parts.map((p, k) => {
                const before = parts.slice(0, k).reduce((t, q) => t + (req.phases[q.key] ?? 0), 0);
                const v = req.phases[p.key] ?? 0;
                return (
                  <motion.li
                    key={p.key}
                    initial={reduce ? false : { opacity: 0, y: -3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: EASE_OUT, delay: 0.04 + k * 0.035 }}
                    className={cn(grid, "h-6 px-2.5 text-xs")}
                  >
                    <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                      <span className="grid w-6 shrink-0 place-items-center">
                        <span className="size-2 rounded-full text-foreground/80" style={{ background: fill(p.tone) }} />
                      </span>
                      <span className="truncate">{p.label}</span>
                    </span>
                    {showSize && <span className="hidden text-right tabular-nums text-foreground @[480px]:block">{ms(v)}</span>}
                    <span className="relative h-full text-foreground/80">
                      <span
                        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
                        style={{ left: pct(req.start + before), width: `max(2px, ${pct(v)})`, background: fill(p.tone) }}
                      />
                      <span
                        className={cn("absolute top-1/2 -translate-y-1/2 whitespace-nowrap tabular-nums text-muted-foreground", showSize && "@[480px]:hidden")}
                        style={(req.start + before + v) / max > 0.8 ? { right: `calc(${100 - ((req.start + before) / max) * 100}% + 6px)` } : { left: `calc(${((req.start + before + v) / max) * 100}% + 6px)` }}
                      >
                        {ms(v)}
                      </span>
                    </span>
                  </motion.li>
                );
              })}
              <li className={cn(grid, "h-6 px-2.5 text-xs text-muted-foreground")}>
                <span className="truncate pl-8">
                  {req.type}
                  {req.status ? ` · ${req.status}` : ""}
                </span>
                {showSize && <span className="hidden text-right font-medium tabular-nums text-foreground @[480px]:block">{ms(total)}</span>}
                <span />
              </li>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

// ─── Sample ───────────────────────────────────────────────────────────────────
// A storefront's first load: the document, render-blocking CSS and fonts, the
// app bundle, then API calls and images once the app runs.

export const DEFAULT_MARKERS: WaterfallMarker[] = [
  { label: "DOMContentLoaded", time: 612 },
  { label: "Load", time: 1184 },
];

export const DEFAULT_REQUESTS: NetworkRequest[] = [
  { name: "acme.shop", type: "document", size: 18400, start: 0, status: 200, phases: { dns: 28, connect: 34, tls: 46, waiting: 142, download: 18 } },
  { name: "app.css", type: "style", size: 32800, start: 276, status: 200, phases: { queued: 4, waiting: 58, download: 22 } },
  { name: "inter.woff2", type: "font", size: 48200, start: 281, status: 200, phases: { queued: 6, waiting: 64, download: 41 } },
  { name: "framework.js", type: "script", size: 142600, start: 284, status: 200, phases: { queued: 8, waiting: 71, download: 118 } },
  { name: "app.js", type: "script", size: 96300, start: 290, status: 200, phases: { queued: 12, waiting: 66, download: 94 } },
  { name: "cdn.acme.shop/hero.webp", type: "image", size: 214000, start: 402, status: 200, phases: { dns: 22, connect: 30, tls: 38, waiting: 84, download: 196 } },
  { name: "api/session", type: "fetch", size: 1200, start: 648, status: 200, phases: { waiting: 96, download: 4 } },
  { name: "api/products?limit=24", type: "fetch", size: 38600, start: 652, status: 200, phases: { waiting: 238, download: 36 } },
  { name: "api/recommendations", type: "fetch", size: 640, start: 660, status: 503, phases: { waiting: 312, download: 2 } },
  { name: "sneaker-01.webp", type: "image", size: 46300, start: 918, status: 200, phases: { queued: 18, waiting: 62, download: 88 } },
  { name: "sneaker-02.webp", type: "image", size: 41800, start: 922, status: 200, phases: { queued: 24, waiting: 70, download: 81 } },
  { name: "analytics.js", type: "script", size: 22400, start: 1046, status: 200, phases: { dns: 18, connect: 24, tls: 31, waiting: 52, download: 12 } },
];
