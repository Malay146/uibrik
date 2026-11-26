"use client";

// A home's power at a glance: solar, battery, grid and the house as four
// nodes, with dots flowing along the links at a speed that follows the power
// in kW. Tapping a node dims every link it isn't part of and swaps the footer
// for that node's breakdown, e.g. where the house's power is coming from.
// With no node picked, the footer shows today's totals, which count up live.

import { IconBatteryVertical3Filled, IconBuildingFactory2, IconHomeFilled, IconSunFilled } from "@tabler/icons-react";
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export type EnergyNode = "solar" | "battery" | "grid" | "home";

export type EnergyReading = {
  /** Solar production in kW. */
  solar: number;
  /** House load in kW. */
  home: number;
  /** Battery charge, 0–100. */
  battery: number;
};

export type EnergyFlowProps = {
  /** Live readings. Pass these to drive the card yourself; leave out to run the built-in simulation. */
  value?: EnergyReading;
  /** Starting readings for the simulation. */
  defaultValue?: EnergyReading;
  /** Battery size in kWh, used for charge rate and the simulation. */
  capacity?: number;
  /** Fastest the battery charges or discharges, in kW. */
  maxBatteryPower?: number;
  /** Run the simulation when no `value` is passed. */
  live?: boolean;
  /** Milliseconds between simulated readings. */
  interval?: number;
  /** Colour for solar and battery flows. Grid flows stay neutral. */
  color?: string;
  title?: string;
  /** Today's hourly kW, 24 values each, for the curve under the diagram. Generated when left out. */
  history?: { solar: number[]; home: number[] };
  /** Hour of day the curve stops at, e.g. 14.5 for 2:30 PM. */
  now?: number;
  /** Show today's curve. */
  showCurve?: boolean;
  /** Picked node, controlled. null for none. */
  selected?: EnergyNode | null;
  defaultSelected?: EnergyNode | null;
  onSelectedChange?: (node: EnergyNode | null) => void;
  /** Width of the card in px; never wider than its container. */
  width?: number;
  className?: string;
};

type Link = { id: string; from: EnergyNode; to: EnergyNode; d: string; len: number; source: "solar" | "battery" | "grid" };

// Diagram space: 320 × 220. Paths start and end at node centres; nodes sit on top.
const POS: Record<EnergyNode, { x: number; y: number }> = {
  solar: { x: 160, y: 36 },
  grid: { x: 40, y: 112 },
  home: { x: 280, y: 112 },
  battery: { x: 160, y: 188 },
};

const LINKS: Link[] = [
  { id: "solar-home", from: "solar", to: "home", d: "M160 36 C160 88 214 112 280 112", len: 150, source: "solar" },
  { id: "solar-battery", from: "solar", to: "battery", d: "M160 36 L160 188", len: 152, source: "solar" },
  { id: "solar-grid", from: "solar", to: "grid", d: "M160 36 C160 88 106 112 40 112", len: 150, source: "solar" },
  { id: "grid-home", from: "grid", to: "home", d: "M40 112 C110 112 210 112 280 112", len: 240, source: "grid" },
  { id: "battery-home", from: "battery", to: "home", d: "M160 188 C160 136 214 112 280 112", len: 150, source: "battery" },
];

const NODES: { id: EnergyNode; label: string; Icon: typeof IconSunFilled }[] = [
  { id: "solar", label: "Solar", Icon: IconSunFilled },
  { id: "grid", label: "Grid", Icon: IconBuildingFactory2 },
  { id: "home", label: "Home", Icon: IconHomeFilled },
  { id: "battery", label: "Battery", Icon: IconBatteryVertical3Filled },
];

const kw = (v: number) => `${v < 0.05 ? "0" : v.toFixed(1)} kW`;
const kwh = (v: number) => `${v.toFixed(1)} kWh`;
const DOT_GAP = 13;

/** Where every kW goes, from one reading. Solar serves the house first, then the battery, then the grid. */
function solve(r: EnergyReading, maxBattery: number) {
  const f: Record<string, number> = { "solar-home": 0, "solar-battery": 0, "solar-grid": 0, "grid-home": 0, "battery-home": 0 };
  f["solar-home"] = Math.min(r.solar, r.home);
  const surplus = r.solar - r.home;
  if (surplus > 0) {
    f["solar-battery"] = r.battery < 100 ? Math.min(surplus, maxBattery) : 0;
    f["solar-grid"] = surplus - f["solar-battery"];
  } else {
    const deficit = -surplus;
    f["battery-home"] = r.battery > 8 ? Math.min(deficit, maxBattery) : 0;
    f["grid-home"] = deficit - f["battery-home"];
  }
  return f;
}

export function EnergyFlow({
  value,
  defaultValue = DEFAULT_READING,
  capacity = 13.5,
  maxBatteryPower = 3.8,
  live = true,
  interval = 1600,
  color = "#e8a317",
  title = "Energy",
  selected: selectedProp,
  defaultSelected = null,
  onSelectedChange,
  history = DEFAULT_HISTORY,
  now = 14.4,
  showCurve = true,
  width = 420,
  className,
}: EnergyFlowProps) {
  const id = useId();
  const reduce = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const [sim, setSim] = useState<EnergyReading>(defaultValue);
  const reading = value ?? sim;
  const [innerSel, setInnerSel] = useState<EnergyNode | null>(defaultSelected);
  const selected = selectedProp !== undefined ? selectedProp : innerSel;
  // Hovering a node previews what a tap would pin.
  const [hoverNode, setHoverNode] = useState<EnergyNode | null>(null);
  const focus = hoverNode ?? selected;
  const select = (n: EnergyNode | null) => {
    if (selectedProp === undefined) setInnerSel(n);
    onSelectedChange?.(n);
  };

  const flows = useMemo(() => solve(reading, maxBatteryPower), [reading, maxBatteryPower]);
  const visible = useVisible(root);

  // Today's totals, seeded with a plausible morning and integrated from each reading.
  const [today, setToday] = useState({ produced: 12.4, used: 9.8, exported: 3.1, imported: 0.6 });

  // Simulation: a slow random walk around a sunny afternoon, battery integrating its flow.
  useEffect(() => {
    if (value || !live || !visible) return;
    const t = setInterval(() => {
      setSim((r) => {
        const f = solve(r, maxBatteryPower);
        const hours = interval / 3_600_000;
        // Speed time up 600× so the battery visibly moves.
        const net = (f["solar-battery"] - f["battery-home"]) * hours * 600;
        return {
          solar: clamp(r.solar + (Math.random() - 0.5) * 0.7, 0.4, 7.2),
          home: clamp(r.home + (Math.random() - 0.48) * 0.8, 0.6, 6.4),
          battery: clamp(r.battery + (net / capacity) * 100, 0, 100),
        };
      });
    }, interval);
    return () => clearInterval(t);
  }, [value, live, visible, interval, capacity, maxBatteryPower]);

  const readingRef = useRef(reading);
  useEffect(() => {
    readingRef.current = reading;
  }, [reading]);
  useEffect(() => {
    if (!live || !visible) return;
    const t = setInterval(() => {
      const r = readingRef.current;
      const f = solve(r, maxBatteryPower);
      const h = (interval / 3_600_000) * 600;
      setToday((d) => ({
        produced: d.produced + r.solar * h,
        used: d.used + r.home * h,
        exported: d.exported + f["solar-grid"] * h,
        imported: d.imported + f["grid-home"] * h,
      }));
    }, interval);
    return () => clearInterval(t);
  }, [live, visible, interval, maxBatteryPower]);

  // Dots: one rAF loop advances each link's dash offset by its own speed, eased
  // toward the target so a change in power never makes the dots jump.
  const paths = useRef<Record<string, SVGPathElement | null>>({});
  const flowsRef = useRef(flows);
  useEffect(() => {
    flowsRef.current = flows;
  }, [flows]);
  useEffect(() => {
    if (reduce || !visible) return;
    const speed: Record<string, number> = {};
    const offset: Record<string, number> = {};
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const l of LINKS) {
        // 0 kW is still, 7 kW is about 70 px a second.
        const target = 6 + flowsRef.current[l.id] * 9;
        speed[l.id] = (speed[l.id] ?? target) + (target - (speed[l.id] ?? target)) * Math.min(1, dt * 3);
        offset[l.id] = ((offset[l.id] ?? 0) - speed[l.id] * dt) % DOT_GAP;
        paths.current[l.id]?.style.setProperty("stroke-dashoffset", offset[l.id].toFixed(2));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce, visible]);

  // Dots wait for the tracks to draw in.
  const [mounted, setMounted] = useState(!!reduce);
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 650);
    return () => clearTimeout(t);
  }, []);

  const grid = flows["grid-home"] > 0.05 ? -flows["grid-home"] : flows["solar-grid"];
  const batteryPower = flows["solar-battery"] - flows["battery-home"];
  const touches = (l: Link) => !focus || l.from === focus || l.to === focus;
  const selfPowered = Math.round((1 - today.imported / Math.max(today.used, 0.01)) * 100);

  const nodeValue: Record<EnergyNode, { value: number; unit: "kw" | "pct"; sub: string }> = {
    solar: { value: reading.solar, unit: "kw", sub: "Producing" },
    home: { value: reading.home, unit: "kw", sub: "Using" },
    grid: { value: Math.abs(grid), unit: "kw", sub: grid > 0.05 ? "Exporting" : grid < -0.05 ? "Importing" : "Idle" },
    battery: { value: reading.battery, unit: "pct", sub: batteryPower > 0.05 ? `Charging ${kw(batteryPower)}` : batteryPower < -0.05 ? `Powering ${kw(-batteryPower)}` : "Idle" },
  };

  return (
    <div className={cn("flex w-full justify-center", className)} style={{ maxWidth: width }}>
      <div
        ref={root}
        className="@container w-full rounded-[24px] bg-(--ef-tint) p-1.5 text-sm text-foreground [--ef-panel:#ffffff] [--ef-tint:#f0f0f0] [--ef-well:#f4f4f4] dark:[--ef-panel:#0c0c0c] dark:[--ef-tint:#161616] dark:[--ef-well:#1c1c1c]"
        style={{ "--ef-color": color } as CSSProperties}
      >
        <div className="flex items-baseline justify-between gap-3 px-3 pb-2.5 pt-2">
          <h3 id={`${id}-title`} className="truncate font-medium">
            {title}
          </h3>
          <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
            {live && !value && <span className="size-1.5 rounded-full bg-(--ef-color)" aria-hidden />}
            {selfPowered}% self-powered today
          </span>
        </div>

        <div className="rounded-[18px] bg-(--ef-panel) p-3">
          <div className="relative mx-auto aspect-[320/220] w-full max-w-[400px]" role="group" aria-labelledby={`${id}-title`}>
            <svg viewBox="0 0 320 220" className="absolute inset-0 size-full overflow-visible" aria-hidden>
              {LINKS.map((l) => {
                const on = flows[l.id] > 0.05;
                const lit = touches(l);
                const stroke = l.source === "grid" ? "var(--foreground)" : "var(--ef-color)";
                return (
                  <g key={l.id} className="transition-opacity duration-200" style={{ opacity: lit ? 1 : 0.25 }}>
                    <motion.path
                      d={l.d}
                      fill="none"
                      stroke="currentColor"
                      strokeOpacity={0.08}
                      strokeWidth={2}
                      initial={reduce ? false : { pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.15 + LINKS.indexOf(l) * 0.06 }}
                    />
                    <path
                      ref={(el) => {
                        paths.current[l.id] = el;
                      }}
                      d={l.d}
                      fill="none"
                      stroke={stroke}
                      strokeOpacity={l.source === "battery" ? 0.6 : l.source === "grid" ? 0.45 : 1}
                      strokeWidth={3.5}
                      strokeLinecap="round"
                      strokeDasharray={`0 ${DOT_GAP}`}
                      className="transition-opacity duration-500"
                      style={{ opacity: on && mounted ? 1 : 0 }}
                    />
                  </g>
                );
              })}
            </svg>

            {NODES.map(({ id: n, label, Icon }, k) => {
              const p = POS[n];
              const active = selected === n;
              const side = n === "solar" || n === "battery";
              const v = nodeValue[n];
              return (
                <motion.div
                  key={n}
                  className="absolute"
                  style={{ left: `${(p.x / 320) * 100}%`, top: `${(p.y / 220) * 100}%` }}
                  initial={reduce ? false : { opacity: 0, scale: 0.85 }}
                  animate={{ opacity: focus && focus !== n && !LINKS.some((l) => touches(l) && (l.from === n || l.to === n)) ? 0.45 : 1, scale: 1 }}
                  transition={{ duration: 0.35, ease: EASE_OUT, delay: mounted ? 0 : 0.05 + k * 0.05 }}
                >
                  <button
                    type="button"
                    onClick={() => select(active ? null : n)}
                    onPointerEnter={(e) => e.pointerType === "mouse" && setHoverNode(n)}
                    onPointerLeave={() => setHoverNode(null)}
                    aria-pressed={active}
                    aria-label={`${label}, ${v.sub.toLowerCase()} ${v.unit === "kw" ? kw(v.value) : `${Math.round(v.value)}%`}`}
                    className={cn(
                      "absolute left-0 top-0 grid size-11 -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-neutral-400/50",
                      active ? "bg-foreground text-background" : "bg-(--ef-well) text-foreground hover:bg-foreground/[0.09]",
                    )}
                  >
                    {n === "battery" && <BatteryRing pct={reading.battery} active={active} />}
                    <Icon size={18} className={cn(!active && (n === "solar" ? "text-(--ef-color)" : "text-foreground/70"))} />
                  </button>
                  <div
                    className={cn(
                      "pointer-events-none absolute whitespace-nowrap leading-tight",
                      side ? "left-8 top-0 -translate-y-1/2 text-left" : "left-0 top-7 -translate-x-1/2 text-center",
                    )}
                  >
                    <Tween value={v.value} format={v.unit} className="block text-[13px] font-medium tabular-nums" />
                    <div className="text-[11px] text-muted-foreground">{v.sub}</div>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {showCurve && <DayCurve history={history} now={now} />}

          <div className="relative mt-3 h-[64px]">
            <AnimatePresence initial={false}>
              <motion.div
                key={focus ?? "today"}
                initial={reduce ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
                className="absolute inset-0"
              >
                {focus ? <Breakdown node={focus} flows={flows} /> : <Today today={today} selfPowered={selfPowered} />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

function BatteryRing({ pct, active }: { pct: number; active: boolean }) {
  const c = 2 * Math.PI * 20;
  return (
    <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
      <circle cx="22" cy="22" r="20" fill="none" stroke="currentColor" strokeOpacity={0.1} strokeWidth={2} />
      <circle
        cx="22"
        cy="22"
        r="20"
        fill="none"
        stroke={active ? "currentColor" : "var(--ef-color)"}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct / 100)}
        className="transition-[stroke-dashoffset] duration-700 ease-out"
      />
    </svg>
  );
}

function Today({ today, selfPowered }: { today: { produced: number; used: number; exported: number; imported: number }; selfPowered: number }) {
  const items = [
    { label: "Produced", value: today.produced, format: "kwh" as const },
    { label: "Used", value: today.used, format: "kwh" as const },
    { label: "Exported", value: today.exported, format: "kwh" as const },
    { label: "Self-powered", value: selfPowered, format: "pct" as const },
  ];
  return (
    <dl className="grid h-full grid-cols-2 gap-px @[360px]:grid-cols-4">
      {items.map((it, i) => (
        <div key={it.label} className={cn("flex flex-col justify-center rounded-[10px] bg-(--ef-well) px-2.5", i > 1 && "hidden @[360px]:flex")}>
          <dt className="text-[11px] text-muted-foreground">{it.label}</dt>
          <dd>
            <Tween value={it.value} format={it.format} className="text-[13px] font-medium tabular-nums" />
          </dd>
        </div>
      ))}
    </dl>
  );
}

// Shares for one node: where its power comes from, or where it goes.
function Breakdown({ node, flows }: { node: EnergyNode; flows: Record<string, number> }) {
  const label = { solar: "Solar", battery: "Battery", grid: "Grid", home: "Home" }[node];
  const parts = LINKS.filter((l) => (l.from === node || l.to === node) && flows[l.id] > 0.05).map((l) => {
    const other = l.from === node ? l.to : l.from;
    const name = { solar: "solar", battery: "battery", grid: "grid", home: "home" }[other];
    return { id: l.id, label: l.from === node ? `To ${name}` : `From ${name}`, v: flows[l.id], source: l.source };
  });
  const total = parts.reduce((t, p) => t + p.v, 0);
  const tone = (s: Link["source"]) => (s === "grid" ? "color-mix(in oklab, var(--foreground) 45%, transparent)" : s === "battery" ? "color-mix(in oklab, var(--ef-color) 60%, transparent)" : "var(--ef-color)");

  if (!parts.length) return <div className="grid h-full place-items-center rounded-[10px] bg-(--ef-well) text-xs text-muted-foreground">{label} is idle</div>;
  return (
    <div className="flex h-full flex-col justify-center gap-2 rounded-[10px] bg-(--ef-well) px-3">
      <div className="flex h-1.5 gap-px overflow-hidden rounded-full">
        {parts.map((p) => (
          <span key={p.id} className="h-full rounded-full" style={{ flexGrow: p.v, background: tone(p.source) }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
        {parts.map((p) => (
          <li key={p.id} className="flex items-center gap-1.5 whitespace-nowrap">
            <span className="size-1.5 rounded-full" style={{ background: tone(p.source) }} />
            <span className="text-muted-foreground">{p.label}</span>
            <span className="font-medium tabular-nums">
              {kw(p.v)} · {Math.round((p.v / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const FORMATS = { kw, kwh, pct: (v: number) => `${Math.round(v)}%` };

/** A number that eases to each new value instead of jumping. */
function Tween({ value, format, className }: { value: number; format: keyof typeof FORMATS; className?: string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, FORMATS[format]);
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.6, ease: EASE_OUT });
    return () => c.stop();
  }, [mv, value]);
  return <motion.span className={className}>{text}</motion.span>;
}

// Today so far: solar as a filled curve, the house's use as a line, both up to
// now. Scrubbing reads both at that hour.
function DayCurve({ history, now }: { history: { solar: number[]; home: number[] }; now: number }) {
  const reduce = useReducedMotion();
  const [at, setAt] = useState<number | null>(null);
  const max = Math.max(1, ...history.solar, ...history.home) * 1.1;
  const W = 240;
  const H = 48;
  const x = (h: number) => (h / 24) * W;
  const y = (v: number) => H - (v / max) * H;
  const upto = (arr: number[]) => {
    const pts: [number, number][] = [];
    for (let h = 0; h <= Math.min(23, Math.floor(now)); h++) pts.push([x(h), y(arr[h] ?? 0)]);
    const f = now - Math.floor(now);
    const a = arr[Math.floor(now)] ?? 0;
    const b = arr[Math.ceil(now)] ?? a;
    pts.push([x(now), y(a + (b - a) * f)]);
    return pts;
  };
  const line = (pts: [number, number][]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
  const solar = upto(history.solar);
  const home = upto(history.home);
  const val = (arr: number[], h: number) => {
    const a = arr[Math.floor(h)] ?? 0;
    const b = arr[Math.min(23, Math.ceil(h))] ?? a;
    return a + (b - a) * (h - Math.floor(h));
  };
  const hour = (h: number) => {
    const hh = Math.floor(h);
    const mm = String(Math.floor((h - hh) * 60)).padStart(2, "0");
    return `${hh % 12 || 12}:${mm} ${hh < 12 ? "AM" : "PM"}`;
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAt(Math.min(now, Math.max(0, ((e.clientX - r.left) / r.width) * 24)));
  };
  const shown = at ?? now;

  return (
    <div className="mt-3 rounded-[12px] bg-(--ef-well) px-3 pb-2 pt-2.5">
      <div className="flex items-baseline justify-between gap-2 text-[11px] tabular-nums">
        <span className="text-muted-foreground">{at === null ? "Today" : hour(at)}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-(--ef-color)" />
            {kw(val(history.solar, shown))}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-0.5 w-2 rounded-full bg-foreground/50" />
            {kw(val(history.home, shown))}
          </span>
        </span>
      </div>
      <div className="relative mt-1.5 h-12 touch-pan-y" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setAt(null)} role="img" aria-label="Solar production and home use today">
        <motion.svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
          initial={reduce ? false : { clipPath: "inset(0 100% 0 0)" }}
          animate={{ clipPath: "inset(0 0% 0 0)" }}
          transition={{ duration: 1, ease: EASE_OUT, delay: 0.3 }}
          aria-hidden
        >
          <path d={`${line(solar)}L${x(now)} ${H}L0 ${H}Z`} fill="var(--ef-color)" fillOpacity={0.18} />
          <path d={line(solar)} fill="none" stroke="var(--ef-color)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          <path d={line(home)} fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={1.5} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        </motion.svg>
        {/* Rest of the day, still to come. */}
        <span className="absolute inset-y-0 right-0 border-l border-dashed border-foreground/15" style={{ left: `${(now / 24) * 100}%` }} aria-hidden />
        <span
          className="pointer-events-none absolute inset-y-0 w-px bg-foreground/40 transition-opacity duration-150"
          style={{ left: `${(shown / 24) * 100}%`, opacity: at === null ? 0 : 1 }}
          aria-hidden
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground" aria-hidden>
        <span>12 AM</span>
        <span>6 AM</span>
        <span>12 PM</span>
        <span>6 PM</span>
        <span>12 AM</span>
      </div>
    </div>
  );
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** True while the element is on screen and the tab is visible, so loops can rest otherwise. */
function useVisible(ref: RefObject<HTMLElement | null>) {
  const [onScreen, setOnScreen] = useState(true);
  const [tab, setTab] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting));
    io.observe(el);
    const vis = () => setTab(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", vis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
    };
  }, [ref]);
  return onScreen && tab;
}

export const DEFAULT_READING: EnergyReading = { solar: 4.6, home: 2.1, battery: 64 };

// A clear day: solar rises after 6 AM and peaks after noon; use peaks at breakfast and dinner.
export const DEFAULT_HISTORY = {
  solar: Array.from({ length: 24 }, (_, h) => Math.round(Math.max(0, Math.sin((Math.PI * (h - 6)) / 14)) * 6.2 * 10) / 10),
  home: [0.5, 0.4, 0.4, 0.4, 0.5, 0.6, 1.1, 2.4, 2.1, 1.2, 0.9, 1.0, 1.3, 1.1, 2.0, 1.6, 1.4, 2.2, 3.4, 3.1, 2.4, 1.6, 0.9, 0.6],
};
