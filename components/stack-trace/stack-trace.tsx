"use client";

// An error card that stays small until you need it. At rest it shows the error,
// how often it fired and a bar per hour. The frame that threw sits on top; a
// click opens its source with the failing line marked. The rest of the stack
// unfolds one frame after another, and runs of library frames fold into a
// single row you can open on their own. Every reveal animates height only, so
// text never scales.

import { IconCheck, IconChevronDown, IconCopy } from "@tabler/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const OPEN = { type: "spring", duration: 0.38, bounce: 0 } as const;

export type StackFrame = {
  /** Function name, e.g. "formatPrice". */
  fn: string;
  /** File path, e.g. "src/lib/money.ts". */
  file: string;
  line: number;
  column?: number;
  /** Your own code. Frames from libraries fold together. Default true. */
  inApp?: boolean;
  /** Source around the line: the first line's number and the lines themselves. */
  source?: { start: number; lines: string[] };
};

export type StackTraceProps = {
  /** Error class, e.g. "TypeError". */
  type?: string;
  message?: string;
  /** Innermost frame first, the way most runtimes print them. */
  frames?: StackFrame[];
  /** Events per bucket, oldest first; drawn as the bars in the header. */
  events?: number[];
  /** Label for the bars' span, e.g. "24h". */
  eventsLabel?: string;
  /** People affected. */
  users?: number;
  /** Short facts in the footer, e.g. browser and release. */
  tags?: string[];
  /** Colour of the error accents. */
  color?: string;
  /** Show the failing frame's source on mount. */
  defaultOpen?: boolean;
  /** Show every frame on mount instead of only the one that threw. */
  defaultExpanded?: boolean;
  /** Width of the card in px; never wider than its container. */
  width?: number;
  className?: string;
};

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));

type Row = { kind: "frame"; frame: StackFrame; index: number } | { kind: "group"; frames: { frame: StackFrame; index: number }[]; key: string };

// Consecutive library frames become one foldable row.
function group(frames: StackFrame[]): Row[] {
  const rows: Row[] = [];
  frames.forEach((frame, index) => {
    if (frame.inApp !== false) return rows.push({ kind: "frame", frame, index });
    const last = rows[rows.length - 1];
    if (last?.kind === "group") last.frames.push({ frame, index });
    else rows.push({ kind: "group", frames: [{ frame, index }], key: `g${index}` });
  });
  return rows;
}

const asText = (type: string, message: string, frames: StackFrame[]) =>
  [`${type}: ${message}`, ...frames.map((f) => `    at ${f.fn} (${f.file}:${f.line}${f.column ? `:${f.column}` : ""})`)].join("\n");

export function StackTrace({
  type = "TypeError",
  message = "Cannot read properties of undefined (reading 'amount')",
  frames = DEFAULT_FRAMES,
  events = DEFAULT_EVENTS,
  eventsLabel = "24h",
  users = 214,
  tags = ["Chrome 131", "v2.4.1", "checkout"],
  color = "#e5484d",
  defaultOpen = false,
  defaultExpanded = false,
  width = 460,
  className,
}: StackTraceProps) {
  const id = useId();
  const reduce = useReducedMotion();
  // The frame that threw: the first one from your own code.
  const culprit = Math.max(0, frames.findIndex((f) => f.inApp !== false));
  const [openFrame, setOpenFrame] = useState<number | null>(defaultOpen ? culprit : null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const [copied, setCopied] = useState(false);
  const total = events.reduce((a, b) => a + b, 0);
  const rows = useMemo(() => group(frames), [frames]);
  const head = rows.findIndex((r) => r.kind === "frame" && r.index === culprit);
  const rest = rows.filter((_, i) => i !== head);
  const hidden = frames.length - 1;
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const copy = () => {
    navigator.clipboard?.writeText(asText(type, message, frames)).catch(() => {});
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1400);
  };

  const toggleGroup = (key: string) =>
    setOpenGroups((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderRow = (row: Row, i: number) =>
    row.kind === "frame" ? (
      <FrameRow
        key={row.index}
        frame={row.frame}
        culprit={row.index === culprit}
        open={openFrame === row.index}
        onToggle={() => setOpenFrame((o) => (o === row.index ? null : row.index))}
        color={color}
        delay={i}
        reduce={!!reduce}
      />
    ) : (
      <li key={row.key}>
        <button
          type="button"
          onClick={() => toggleGroup(row.key)}
          aria-expanded={openGroups.has(row.key)}
          className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-[10px] px-2.5 text-left text-xs text-muted-foreground outline-none transition-colors duration-150 hover:bg-(--st-well) focus-visible:ring-2 focus-visible:ring-neutral-400/50"
        >
          <motion.span animate={{ rotate: openGroups.has(row.key) ? 0 : -90 }} transition={{ duration: 0.2, ease: EASE_OUT }} className="grid">
            <IconChevronDown size={14} />
          </motion.span>
          {row.frames.length} library frame{row.frames.length === 1 ? "" : "s"}
        </button>
        <Reveal show={openGroups.has(row.key)} reduce={!!reduce}>
          <ul className="flex flex-col pb-1 pl-5">
            {row.frames.map(({ frame, index }) => (
              <li key={index} className="flex h-8 min-w-0 items-center gap-2 px-2.5 font-mono text-[11.5px] text-muted-foreground">
                <span className="truncate">{frame.fn}</span>
                <span className="ml-auto shrink-0 truncate text-foreground/35">{frame.file.split("/").pop()}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </li>
    );

  return (
    <div className={cn("flex w-full justify-center", className)} style={{ maxWidth: width }}>
      <div
        className="@container w-full rounded-[24px] bg-(--st-tint) p-1.5 text-sm text-foreground [--st-panel:#ffffff] [--st-tint:#f0f0f0] [--st-well:#f5f5f5] dark:[--st-panel:#0c0c0c] dark:[--st-tint:#161616] dark:[--st-well:#1c1c1c]"
        style={{ ["--st-accent" as string]: color }}
      >
        {/* Header: what broke, how often, and when. */}
        <div className="flex items-start gap-4 px-3 pb-3 pt-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="flex h-5 items-center rounded-full bg-(--st-accent)/12 px-2 font-mono text-[11px] font-medium text-(--st-accent)">{type}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {compact(total)} events · {compact(users)} users
              </span>
            </div>
            <p id={`${id}-msg`} className="mt-2 line-clamp-2 font-medium leading-snug">
              {message}
            </p>
          </div>
          <Bars events={events} label={eventsLabel} reduce={!!reduce} />
        </div>

        <div className="rounded-[18px] bg-(--st-panel) p-1.5">
          <ul className="flex flex-col gap-px" aria-labelledby={`${id}-msg`}>
            {head >= 0 && renderRow(rows[head], 0)}
          </ul>
          <Reveal show={expanded} reduce={!!reduce}>
            <ul className="flex flex-col gap-px pt-px">{rest.map((r, i) => renderRow(r, expanded ? i + 1 : 0))}</ul>
          </Reveal>
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-expanded={expanded}
              className="mt-0.5 flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 rounded-[10px] text-xs font-medium text-muted-foreground outline-none transition-colors duration-150 hover:bg-(--st-well) hover:text-foreground focus-visible:ring-2 focus-visible:ring-neutral-400/50"
            >
              <span className="grid">
                {/* Both labels share one cell, so the button never changes width. */}
                {[`Show ${hidden} more frame${hidden === 1 ? "" : "s"}`, "Show less"].map((label, i) => (
                  <motion.span
                    key={label}
                    aria-hidden={(i === 1) !== expanded}
                    initial={false}
                    animate={{ opacity: (i === 1) === expanded ? 1 : 0, y: (i === 1) === expanded ? 0 : i === 1 ? 6 : -6 }}
                    transition={{ duration: 0.2, ease: EASE_OUT }}
                    className="col-start-1 row-start-1 text-right"
                  >
                    {label}
                  </motion.span>
                ))}
              </span>
              <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.25, ease: EASE_OUT }} className="grid">
                <IconChevronDown size={14} />
              </motion.span>
            </button>
          )}
        </div>

        {/* Footer: context, and a way to take the stack with you. */}
        <div className="flex items-center gap-2 px-2 pb-1 pt-2">
          <div className="flex min-w-0 flex-1 gap-1 overflow-hidden">
            {tags.map((t) => (
              <span key={t} className="flex h-6 shrink-0 items-center rounded-full bg-(--st-panel) px-2.5 text-[11px] text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={copy}
            aria-label={copied ? "Copied" : "Copy stack trace"}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-(--st-panel) text-muted-foreground outline-none transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-neutral-400/50"
          >
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={copied ? "ok" : "copy"}
                initial={{ opacity: 0, scale: 0.6, filter: "blur(2px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.6, filter: "blur(2px)" }}
                transition={{ duration: 0.18, ease: EASE_OUT }}
                className="grid"
              >
                {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Grows to its content's real height and back; children only fade. */
function Reveal({ show, reduce, children }: { show: boolean; reduce: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={reduce ? { duration: 0 } : { ...OPEN, opacity: { duration: 0.2 } }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function FrameRow({
  frame,
  culprit,
  open,
  onToggle,
  color,
  delay,
  reduce,
}: {
  frame: StackFrame;
  culprit: boolean;
  open: boolean;
  onToggle: () => void;
  color: string;
  delay: number;
  reduce: boolean;
}) {
  const name = frame.file.split("/").pop();
  const dir = frame.file.slice(0, frame.file.length - (name?.length ?? 0));
  return (
    <motion.li
      // Frames below the first arrive one after another as the stack unfolds.
      initial={delay && !reduce ? { opacity: 0, y: -4 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE_OUT, delay: delay * 0.035 }}
      className={cn("rounded-[12px] transition-colors duration-200", open && "bg-(--st-well)")}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!frame.source}
        aria-expanded={frame.source ? open : undefined}
        className={cn(
          "flex min-h-11 w-full items-center gap-2.5 rounded-[12px] px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/50",
          frame.source && "cursor-pointer",
          frame.source && !open && "hover:bg-(--st-well)/70",
        )}
      >
        <span className={cn("size-1.5 shrink-0 rounded-full", culprit ? "bg-(--st-accent)" : "bg-foreground/20")} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[12.5px] font-medium">{frame.fn}</span>
          <span className="mt-0.5 block truncate font-mono text-[11px] text-muted-foreground">
            <span className="hidden @[360px]:inline">{dir}</span>
            <span className="text-foreground/70">{name}</span>
            <span>
              :{frame.line}
              {frame.column ? `:${frame.column}` : ""}
            </span>
          </span>
        </span>
        {frame.source && (
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25, ease: EASE_OUT }} className="grid shrink-0 text-muted-foreground">
            <IconChevronDown size={15} />
          </motion.span>
        )}
      </button>
      {frame.source && (
        <Reveal show={open} reduce={reduce}>
          <Source source={frame.source} line={frame.line} color={color} reduce={reduce} />
        </Reveal>
      )}
    </motion.li>
  );
}

function Source({ source, line, color, reduce }: { source: { start: number; lines: string[] }; line: number; color: string; reduce: boolean }) {
  const digits = String(source.start + source.lines.length).length;
  return (
    <div className="px-1.5 pb-1.5">
      <pre className="overflow-x-auto rounded-[9px] bg-(--st-panel) py-2 font-mono text-[11.5px] leading-[20px] [scrollbar-width:thin]">
        {source.lines.map((text, i) => {
          const n = source.start + i;
          const hit = n === line;
          return (
            <div key={n} className="relative flex min-w-max pr-3">
              {hit && (
                <motion.span
                  aria-hidden
                  // The failing line is marked once the code has settled.
                  initial={reduce ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.15 }}
                  className="absolute inset-0"
                  style={{ background: `color-mix(in oklab, ${color} 11%, transparent)`, boxShadow: `inset 2px 0 0 ${color}` }}
                />
              )}
              <span className={cn("relative shrink-0 select-none pl-3 pr-3 text-right tabular-nums", hit ? "text-(--st-accent)" : "text-foreground/30")} style={{ width: `${digits + 3}ch` }}>
                {n}
              </span>
              <span className={cn("relative whitespace-pre", hit ? "text-foreground" : "text-muted-foreground")}>{text || " "}</span>
            </div>
          );
        })}
      </pre>
    </div>
  );
}

/** A bar per bucket that rises on mount; hovering one names its count. */
function Bars({ events, label, reduce }: { events: number[]; label: string; reduce: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...events);
  const peak = events.indexOf(max);
  return (
    <div className="relative hidden shrink-0 flex-col items-end gap-1 @[340px]:flex" onPointerLeave={() => setHover(null)}>
      <div className="flex h-9 items-end gap-[2px]" role="img" aria-label={`${events.reduce((a, b) => a + b, 0)} events in the last ${label}`}>
        {events.map((v, i) => (
          <span key={i} className="flex h-full w-[4px] items-end" onPointerEnter={() => setHover(i)}>
            <motion.span
              initial={reduce ? false : { scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.45, ease: EASE_OUT, delay: i * 0.012 }}
              className={cn(
                "w-full origin-bottom rounded-full transition-colors duration-100",
                hover === i ? "bg-foreground" : i === peak ? "bg-(--st-accent)" : "bg-foreground/20",
              )}
              style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
            />
          </span>
        ))}
      </div>
      <span className="relative h-4 text-[11px] tabular-nums text-muted-foreground">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={hover ?? "label"}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.12 }}
            className="block whitespace-nowrap"
          >
            {hover === null ? label : `${events[hover]} · ${events.length - hover - 1 === 0 ? "now" : `${events.length - hover - 1}h ago`}`}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  );
}

// ─── Sample ───────────────────────────────────────────────────────────────────

const DEFAULT_EVENTS = [3, 2, 4, 2, 1, 2, 3, 5, 4, 6, 8, 12, 9, 7, 14, 22, 31, 26, 18, 12, 9, 11, 7, 5];

export const DEFAULT_FRAMES: StackFrame[] = [
  {
    fn: "formatPrice",
    file: "src/lib/money.ts",
    line: 14,
    column: 22,
    source: {
      start: 10,
      lines: [
        "export function formatPrice(item: LineItem) {",
        "  const currency = item.currency ?? \"USD\";",
        "  const fmt = formatter(currency);",
        "",
        "  return fmt.format(item.price.amount / 100);",
        "}",
      ],
    },
  },
  {
    fn: "CartRow",
    file: "src/components/cart/cart-row.tsx",
    line: 31,
    column: 9,
    source: {
      start: 28,
      lines: ["  return (", "    <li className=\"row\">", "      <span>{item.name}</span>", "      <span>{formatPrice(item)}</span>", "    </li>", "  );"],
    },
  },
  { fn: "renderWithHooks", file: "node_modules/react-dom/cjs/react-dom.development.js", line: 16305, inApp: false },
  { fn: "updateFunctionComponent", file: "node_modules/react-dom/cjs/react-dom.development.js", line: 19588, inApp: false },
  { fn: "beginWork", file: "node_modules/react-dom/cjs/react-dom.development.js", line: 21601, inApp: false },
  {
    fn: "CartSummary",
    file: "src/components/cart/cart-summary.tsx",
    line: 18,
    column: 7,
    source: {
      start: 15,
      lines: ["  const items = useCart((s) => s.items);", "", "  return items.map((item) => (", "    <CartRow key={item.id} item={item} />", "  ));"],
    },
  },
  { fn: "performUnitOfWork", file: "node_modules/react-dom/cjs/react-dom.development.js", line: 26557, inApp: false },
  { fn: "workLoopSync", file: "node_modules/react-dom/cjs/react-dom.development.js", line: 26466, inApp: false },
];
