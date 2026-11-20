"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type SVGProps } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import useMeasure from "react-use-measure";
import { IconBrandGithubFilled, IconStar, IconStarFilled, IconTagFilled } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// Open source block. A repository at a glance. The first time the card
// scrolls into view the star, fork and contributor counts roll up digit by
// digit, a sparkline of recent stars draws itself under the counts, the
// language bar fills segment by segment, and the contributors' faces slide
// into a row that fans open when pointed at. Below, a live feed of commits,
// merges and releases moves along one entry at a time, the newest dropping in
// at the top. Starring adds one to the count, rolling only the digits that
// change, with a small burst from the star.
//
// Colour is kept for meaning: the languages wear their usual colours, the feed
// marks merges and releases, the star turns gold once starred. Everything
// else is neutral. Surfaces are set apart by fill alone: no borders, no shadows.
//
// Every number comes in through props, so the card never calls GitHub from the
// browser: fetch the counts on the server (or at build time) and pass them in.
// The feed pauses while pointed at, off screen and in a background tab, and
// everything stands still with reduced motion.

export type Contributor = {
  name: string;
  /** A square photo; initials stand in without one. */
  src?: string;
};

export type RepoActivity = {
  type: "commit" | "merge" | "release";
  title: string;
  /** Right-hand detail: a short SHA, a pull request number or a tag. */
  meta?: string;
};

export type RepoLanguage = {
  name: string;
  /** Share of the code, in percent. */
  share: number;
  color: string;
};

export type OpenSourceProps = {
  /** "owner/name". The name part is set in bold. */
  repo?: string;
  /** Link for the repository name. */
  href?: string;
  /** One line under the name. Empty hides it. */
  description?: string;
  /** Latest release tag. Empty hides it. */
  version?: string;
  stars?: number;
  /** Stars per period, oldest first, for the sparkline. Empty hides it. */
  starHistory?: readonly number[];
  forks?: number;
  /** Total contributors; defaults to the number of faces given. */
  contributorCount?: number;
  contributors?: readonly Contributor[];
  /** Most faces in the row; the rest are counted in a "+N" chip. */
  maxAvatars?: number;
  languages?: readonly RepoLanguage[];
  /** Show the language bar. */
  showLanguages?: boolean;
  /** Recent activity, newest first. */
  activity?: readonly RepoActivity[];
  /** Show the activity feed. */
  showActivity?: boolean;
  /** Rows of the feed in view at once. */
  feedRows?: number;
  /** Seconds between feed steps. */
  interval?: number;
  /** "full" prints 24,817; "compact" prints 24.8k. */
  format?: "full" | "compact";
  /** Number locale. */
  locale?: string;
  /** Label of the star button. Empty hides the button. */
  starLabel?: string;
  /** Colour of the star once starred, and of the sparkline. */
  starColor?: string;
  starred?: boolean;
  defaultStarred?: boolean;
  onStarredChange?: (starred: boolean) => void;
  className?: string;
};

// Reduced motion, read so the first client render matches the server (false)
// and the real preference follows straight after hydration.
const RM_QUERY = "(prefers-reduced-motion: reduce)";
const rmSubscribe = (cb: () => void) => {
  const mq = window.matchMedia(RM_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
function useReducedMotion() {
  return useSyncExternalStore(
    rmSubscribe,
    () => window.matchMedia(RM_QUERY).matches,
    () => false,
  );
}

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const ROLL_EASE = [0.16, 1, 0.3, 1] as const;

const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-(--os-card) dark:focus-visible:ring-zinc-500";

// Raised on the tinted card by fill alone: white in light, a lifted grey in dark. No borders, no shadows.
const RAISED = "bg-white dark:bg-white/[0.07]";

const P = "https://uibrik.com/registry/open-source";

const CONTRIBUTORS: Contributor[] = [
  { name: "Mei Chen", src: `${P}/mei.webp` },
  { name: "Omar Haddad", src: `${P}/omar.webp` },
  { name: "Priya Nair", src: `${P}/priya.webp` },
  { name: "Theo Laurent", src: `${P}/theo.webp` },
  { name: "Amara Okafor", src: `${P}/amara.webp` },
  { name: "Andrei Popescu", src: `${P}/andrei.webp` },
  { name: "Hana Sato", src: `${P}/hana.webp` },
  { name: "Karthik Rao", src: `${P}/karthik.webp` },
  { name: "Leila Karimi", src: `${P}/leila.webp` },
  { name: "Marcus Webb", src: `${P}/marcus.webp` },
  { name: "Nora Lind", src: `${P}/nora.webp` },
  { name: "Caleb Brooks", src: `${P}/caleb.webp` },
];

const ACTIVITY: RepoActivity[] = [
  { type: "release", title: "Released v2.4.0", meta: "v2.4.0" },
  { type: "merge", title: "Faster theme switching", meta: "#412" },
  { type: "commit", title: "fix: focus ring in dark mode", meta: "a1f3c9e" },
  { type: "commit", title: "docs: keyboard table for menus", meta: "7d02b4a" },
  { type: "merge", title: "Right-to-left support for tabs", meta: "#409" },
  { type: "commit", title: "perf: pause loops off screen", meta: "e94c1f0" },
  { type: "release", title: "Released v2.3.2", meta: "v2.3.2" },
  {
    type: "commit",
    title: "feat: controlled mode for select",
    meta: "3b8a5d2",
  },
];

// GitHub's own language colours.
const LANGUAGES: RepoLanguage[] = [
  { name: "TypeScript", share: 78.4, color: "#3178c6" },
  { name: "CSS", share: 14.2, color: "#663399" },
  { name: "MDX", share: 7.4, color: "#fcb32c" },
];

const STAR_HISTORY = [120, 140, 132, 168, 190, 176, 214, 260, 248, 302, 344, 410];

// ─── Filled glyphs ──────────────────────────────────────────────────────────
// Tabler has no filled fork, commit, merge or people icon, so these are drawn
// to match its filled set: 24px grid, solid shapes.

type Glyph = SVGProps<SVGSVGElement> & { size?: number };

function ForkFilled({ size = 16, ...p }: Glyph) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
      <circle cx="6" cy="5" r="3" />
      <circle cx="18" cy="5" r="3" />
      <circle cx="12" cy="19" r="3" />
      <path d="M5 7.5h2V9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7.5h2V9a4 4 0 0 1-4 4h-2v3.5h-2V13H9a4 4 0 0 1-4-4z" />
    </svg>
  );
}

function PeopleFilled({ size = 16, ...p }: Glyph) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
      <circle cx="9" cy="7.5" r="4" />
      <path d="M2 20a7 7 0 0 1 14 0 1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
      <circle cx="17" cy="8.5" r="3" opacity=".55" />
      <path opacity=".55" d="M17.5 21H21a1 1 0 0 0 1-1 5.5 5.5 0 0 0-7.4-5.2A8.9 8.9 0 0 1 18 20.6z" />
    </svg>
  );
}

function CommitFilled({ size = 16, ...p }: Glyph) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
      <path d="M2 11h5.1a5 5 0 0 1 9.8 0H22v2h-5.1a5 5 0 0 1-9.8 0H2z" />
    </svg>
  );
}

function MergeFilled({ size = 16, ...p }: Glyph) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
      <circle cx="6" cy="5" r="3" />
      <circle cx="6" cy="19" r="3" />
      <circle cx="18" cy="13" r="3" />
      <path d="M5 7.5h2v1a5.5 5.5 0 0 0 5.5 3.5h3v2h-3A7.5 7.5 0 0 1 7 11.6v4.9H5z" />
    </svg>
  );
}

const ACTIVITY_STYLE = {
  commit: {
    Icon: CommitFilled,
    tone: "bg-black/[0.05] text-zinc-500 dark:bg-white/[0.08] dark:text-zinc-400",
    label: "Commit",
  },
  merge: {
    Icon: MergeFilled,
    tone: "bg-violet-500/10 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300",
    label: "Merged",
  },
  release: {
    Icon: IconTagFilled,
    tone: "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300",
    label: "Release",
  },
} as const;

export function OpenSource({
  repo = "acme/ui",
  href = "#",
  description = "",
  version = "v2.4.0",
  stars = 24817,
  starHistory = STAR_HISTORY,
  forks = 1342,
  contributorCount,
  contributors = CONTRIBUTORS,
  maxAvatars = 8,
  languages = LANGUAGES,
  showLanguages = true,
  activity = ACTIVITY,
  showActivity = true,
  feedRows = 3,
  interval = 3,
  format = "full",
  locale = "en-US",
  starLabel = "Star on GitHub",
  starColor = "#f5b301",
  starred: starredProp,
  defaultStarred = false,
  onStarredChange,
  className,
}: OpenSourceProps) {
  const reduce = useReducedMotion();
  const root = useRef<HTMLElement>(null);
  const seen = useInView(root, { once: true, amount: 0.35 });
  const run = seen || reduce;

  const [starredState, setStarredState] = useState(defaultStarred);
  const starred = starredProp ?? starredState;
  const [bursts, setBursts] = useState(0);
  const toggleStar = () => {
    const next = !starred;
    if (starredProp === undefined) setStarredState(next);
    if (next) setBursts((b) => b + 1);
    onStarredChange?.(next);
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat(locale, format === "compact" ? { notation: "compact", maximumFractionDigits: 1 } : {}).format(n);

  const total = contributorCount ?? contributors.length;
  const shown = contributors.slice(0, Math.max(0, maxAvatars));
  const extra = Math.max(0, total - shown.length);
  const [owner, name] = repo.includes("/") ? repo.split("/", 2) : ["", repo];

  return (
    <article
      ref={root}
      className={cn(
        "@container w-full max-w-[520px] rounded-[28px] bg-(--os-card) p-5 text-foreground [--os-card:#f2f2f3] @min-[400px]:p-6 dark:[--os-card:#151517]",
        className,
      )}
    >
      <header className="flex items-center gap-3">
        <motion.span
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground text-background"
          initial={reduce ? false : { opacity: 0, scale: 0.8, rotate: -8 }}
          animate={run ? { opacity: 1, scale: 1, rotate: 0 } : { opacity: 0, scale: 0.8, rotate: -8 }}
          whileHover={reduce ? undefined : { rotate: -8, scale: 1.06 }}
          transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.5, bounce: 0.25 }}
        >
          <IconBrandGithubFilled size={22} aria-hidden />
        </motion.span>
        <div className="min-w-0 flex-1">
          <a href={href} className={cn("block truncate rounded-md text-[15px] tracking-tight", FOCUS)}>
            {owner && <span className="text-muted-foreground">{owner}/</span>}
            <span className="font-semibold underline decoration-transparent decoration-2 underline-offset-4 transition-[text-decoration-color] duration-200 hover:decoration-current">
              {name}
            </span>
          </a>
          {description && <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{description}</p>}
        </div>
        {version && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium leading-none text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
            <IconTagFilled size={12} aria-hidden />
            {version}
          </span>
        )}
      </header>

      <dl className="mt-6 grid grid-cols-3 gap-3">
        <Stat icon={<IconStarFilled size={14} />} label="Stars" tint={starColor}>
          <Odometer value={stars + (starred ? 1 : 0)} text={fmt} run={run} reduce={reduce} />
        </Stat>
        <Stat icon={<ForkFilled size={14} />} label="Forks">
          <Odometer value={forks} text={fmt} run={run} reduce={reduce} delay={0.08} />
        </Stat>
        <Stat icon={<PeopleFilled size={14} />} label="Contributors">
          <Odometer value={total} text={fmt} run={run} reduce={reduce} delay={0.16} />
        </Stat>
      </dl>

      {starHistory.length > 1 && <Sparkline points={starHistory} color={starColor} run={run} reduce={reduce} text={fmt} />}

      {showLanguages && languages.length > 0 && <Languages items={languages} run={run} reduce={reduce} />}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-4">
        <ul className="group/avs flex items-center pl-2" aria-label={`${fmt(total)} contributors`}>
          {shown.map((c, i) => (
            <motion.li
              key={c.name + i}
              className="-ml-2 transition-transform duration-300 ease-out group-hover/avs:translate-x-(--fan)"
              style={{ "--fan": `${i * 5}px` } as CSSProperties}
              initial={reduce ? false : { opacity: 0, x: -10, scale: 0.85 }}
              animate={run ? { opacity: 1, x: 0, scale: 1 } : { opacity: 0, x: -10, scale: 0.85 }}
              transition={
                reduce
                  ? { duration: 0 }
                  : {
                      type: "spring",
                      duration: 0.45,
                      bounce: 0.2,
                      delay: 0.25 + i * 0.045,
                    }
              }
            >
              <Avatar person={c} index={i} />
            </motion.li>
          ))}
          {extra > 0 && (
            <motion.li
              className="-ml-2 transition-transform duration-300 ease-out group-hover/avs:translate-x-(--fan)"
              style={{ "--fan": `${shown.length * 5}px` } as CSSProperties}
              initial={reduce ? false : { opacity: 0, x: -10 }}
              animate={run ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
              transition={
                reduce
                  ? { duration: 0 }
                  : {
                      duration: 0.35,
                      delay: 0.25 + shown.length * 0.045,
                      ease: EASE_OUT,
                    }
              }
            >
              <span
                className={cn(
                  "relative grid h-9 min-w-9 place-items-center rounded-full px-2 text-[11px] font-semibold tabular-nums text-muted-foreground ring-[3px] ring-(--os-card)",
                  // solid, not RAISED: a see-through fill would show the face it overlaps
                  "bg-white dark:bg-[#29292c]",
                )}
              >
                +{fmt(extra)}
              </span>
            </motion.li>
          )}
        </ul>

        {starLabel && (
          <button
            type="button"
            aria-pressed={starred}
            onClick={toggleStar}
            className={cn(
              "group/btn inline-flex h-10 items-center gap-2 rounded-full bg-foreground pl-3.5 pr-4 text-sm font-medium text-background transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.97]",
              FOCUS,
            )}
          >
            <span
              className="relative grid size-4 place-items-center transition-transform duration-300 ease-out group-hover/btn:rotate-[72deg]"
              aria-hidden
            >
              <AnimatePresence initial={false} mode="popLayout">
                {starred ? (
                  <motion.span
                    key="on"
                    className="grid"
                    style={{ color: starColor }}
                    initial={reduce ? false : { opacity: 0, scale: 0.4, rotate: -45 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{
                      type: "spring",
                      duration: 0.45,
                      bounce: 0.35,
                    }}
                  >
                    <IconStarFilled size={16} />
                  </motion.span>
                ) : (
                  <motion.span
                    key="off"
                    className="grid"
                    initial={reduce ? false : { opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ duration: 0.2, ease: EASE_OUT }}
                  >
                    <IconStar size={16} stroke={2} />
                  </motion.span>
                )}
              </AnimatePresence>
              {!reduce && bursts > 0 && <Burst key={bursts} color={starColor} />}
            </span>
            {starLabel}
          </button>
        )}
      </div>

      {showActivity && activity.length > 0 && (
        <Feed items={activity} rows={Math.max(1, Math.min(feedRows, activity.length))} interval={interval} run={run} reduce={reduce} />
      )}
    </article>
  );
}

function Stat({ icon, label, tint, children }: { icon: ReactNode; label: string; tint?: string; children: ReactNode }) {
  return (
    <div className="group/stat min-w-0" style={tint ? ({ "--os-tint": tint } as CSSProperties) : undefined}>
      <dt className="flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors duration-200 group-hover/stat:text-foreground">
        <span
          aria-hidden
          className="hidden shrink-0 opacity-70 transition-[opacity,color,transform] duration-200 ease-out group-hover/stat:-rotate-12 group-hover/stat:scale-110 group-hover/stat:text-(--os-tint,currentColor) group-hover/stat:opacity-100 @min-[400px]:inline-block"
        >
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className="mt-1.5 text-[22px] font-semibold leading-none tracking-tight @min-[400px]:text-[28px]">{children}</dd>
    </div>
  );
}

// ─── Star sparkline ─────────────────────────────────────────────────────────
// Recent stars as a soft area under a line that draws from the left, ending
// on a dot that pulses once.

function Sparkline({
  points,
  color,
  run,
  reduce,
  text,
}: {
  points: readonly number[];
  color: string;
  run: boolean;
  reduce: boolean;
  text: (n: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the box's real pixel size, so the line keeps an even stroke and
  // draws in without breaks at any width.
  const [ref, { width: W }] = useMeasure();
  const H = 28;
  const min = Math.min(...points);
  const span = Math.max(...points) - min || 1;
  const pad = 4;
  const xy = points.map(
    (v, i) => [pad + (i / (points.length - 1)) * Math.max(0, W - pad * 2), H - 3 - ((v - min) / span) * (H - 6)] as const,
  );
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)} ${H} L${pad} ${H} Z`;
  const [lx, ly] = xy[xy.length - 1];
  const id = `os-spark-${color.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <div
      ref={ref}
      className="relative mt-4 h-7 touch-pan-y"
      aria-hidden
      onPointerMove={(e) => {
        if (!run || W <= 0) return;
        const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
        const i = Math.round(((x - pad) / Math.max(1, W - pad * 2)) * (points.length - 1));
        setHover(Math.min(points.length - 1, Math.max(0, i)));
      }}
      onPointerLeave={() => setHover(null)}
    >
      {W > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 overflow-visible">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.22" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <motion.path
            d={area}
            fill={`url(#${id})`}
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: run ? 1 : 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 0.9, ease: EASE_OUT }}
          />
          <motion.path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: run ? 1 : 0 }}
            transition={reduce ? { duration: 0 } : { duration: 1.2, delay: 0.2, ease: [0.65, 0, 0.35, 1] }}
          />
          <motion.circle
            cx={lx}
            cy={ly}
            r={4}
            fill={color}
            initial={reduce ? false : { opacity: 0, scale: 0 }}
            animate={run ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
            style={{ transformOrigin: `${lx}px ${ly}px` }}
            transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.4, bounce: 0.4, delay: 1.35 }}
          />
          <AnimatePresence>
            {hover !== null && (
              <motion.g key="hover" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <motion.line
                  x1={0}
                  x2={0}
                  y1={0}
                  y2={H}
                  stroke={color}
                  strokeOpacity={0.35}
                  strokeWidth={1}
                  strokeDasharray="2 3"
                  initial={false}
                  animate={{ x: xy[hover][0] }}
                  transition={{ type: "spring", duration: 0.25, bounce: 0 }}
                />
                <motion.circle
                  r={4.5}
                  fill="var(--os-card)"
                  stroke={color}
                  strokeWidth={2}
                  initial={false}
                  animate={{ cx: xy[hover][0], cy: xy[hover][1] }}
                  transition={{ type: "spring", duration: 0.25, bounce: 0 }}
                />
              </motion.g>
            )}
          </AnimatePresence>
          {!reduce && run && (
            <motion.circle
              cx={lx}
              cy={ly}
              r={4}
              fill={color}
              style={{ transformOrigin: `${lx}px ${ly}px` }}
              initial={{ opacity: 0.5, scale: 1 }}
              animate={{ opacity: 0, scale: 3.2 }}
              transition={{ duration: 0.9, delay: 1.5, ease: EASE_OUT }}
            />
          )}
        </svg>
      )}
      <AnimatePresence>
        {hover !== null && W > 0 && (
          <motion.span
            className="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-background"
            initial={{ opacity: 0, y: 4 }}
            animate={{
              opacity: 1,
              y: 0,
              left: Math.min(Math.max(xy[hover][0], 24), W - 24),
            }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: "spring", duration: 0.25, bounce: 0 }}
          >
            +{text(points[hover])}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Languages ──────────────────────────────────────────────────────────────

function Languages({ items, run, reduce }: { items: readonly RepoLanguage[]; run: boolean; reduce: boolean }) {
  const sum = items.reduce((a, l) => a + l.share, 0) || 1;
  // Pointing at a segment or its legend entry dims the rest.
  const [active, setActive] = useState<number | null>(null);
  const dim = (i: number) => active !== null && active !== i;
  return (
    <div className="mt-5" onPointerLeave={() => setActive(null)}>
      <div className="flex h-2 gap-[3px]" role="img" aria-label={items.map((l) => `${l.name} ${l.share}%`).join(", ")}>
        {items.map((l, i) => (
          <span
            key={l.name}
            className={cn(
              "h-full transition-[opacity,transform] duration-200 ease-out",
              dim(i) && "opacity-30",
              active === i && "scale-y-[1.35]",
            )}
            style={{ width: `${(l.share / sum) * 100}%` }}
            onPointerEnter={() => setActive(i)}
          >
            <motion.span
              className="block h-full origin-left rounded-full"
              style={{ backgroundColor: l.color }}
              initial={reduce ? false : { scaleX: 0, opacity: 0 }}
              animate={run ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }}
              transition={reduce ? { duration: 0 } : { duration: 0.6, delay: 0.35 + i * 0.12, ease: EASE_OUT }}
            />
          </span>
        ))}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {items.map((l, i) => (
          <motion.li
            key={l.name}
            className="flex cursor-default items-center gap-1.5"
            onPointerEnter={() => setActive(i)}
            initial={reduce ? false : { opacity: 0, y: 4 }}
            animate={run ? { opacity: dim(i) ? 0.4 : 1, y: 0 } : { opacity: 0, y: 4 }}
            transition={
              reduce
                ? { duration: 0 }
                : {
                    duration: 0.25,
                    delay: active === null && !run ? 0.5 + i * 0.12 : 0,
                    ease: EASE_OUT,
                  }
            }
          >
            <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: l.color }} />
            <span className="font-medium text-foreground">{l.name}</span>
            <span className="tabular-nums">{l.share}%</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

// ─── Star burst ─────────────────────────────────────────────────────────────
// Six small dots thrown out from the star once, then gone.

function Burst({ color }: { color: string }) {
  return (
    <span className="pointer-events-none absolute inset-0">
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 -ml-[2px] -mt-[2px] size-1 rounded-full"
            style={{ backgroundColor: color }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(a) * 14,
              y: Math.sin(a) * 14,
              opacity: 0,
              scale: 0.4,
            }}
            transition={{ duration: 0.55, ease: EASE_OUT }}
          />
        );
      })}
    </span>
  );
}

// ─── Odometer ───────────────────────────────────────────────────────────────
// Each digit is a strip of 0–9 slid behind a one-digit window. Columns are
// keyed from the right, so when the number changes only the digits that differ
// roll, and a new leading digit slides in rather than shifting the rest.

function Odometer({
  value,
  text,
  run,
  reduce,
  delay = 0,
}: {
  value: number;
  text: (n: number) => string;
  run: boolean;
  reduce: boolean;
  delay?: number;
}) {
  const shown = run ? text(value) : text(0);
  const chars = [...shown];
  // The first roll is long and staggered; later changes (a star) are quick.
  const [first, setFirst] = useState(true);
  useEffect(() => {
    if (!run) return;
    const t = setTimeout(() => setFirst(false), 1800);
    return () => clearTimeout(t);
  }, [run]);

  return (
    <span className="inline-flex">
      <span className="sr-only">{text(value)}</span>
      <span aria-hidden className="inline-flex tabular-nums">
        {chars.map((c, i) => {
          const pos = chars.length - 1 - i;
          const digit = c >= "0" && c <= "9";
          if (!digit) {
            return (
              <span key={`s${pos}`} className="inline-block">
                {c}
              </span>
            );
          }
          const d = c.charCodeAt(0) - 48;
          return (
            <span key={`d${pos}`} className="relative inline-block h-[1em] overflow-hidden">
              <span className="invisible">0</span>
              <motion.span
                className="absolute inset-x-0 top-0 flex flex-col"
                initial={reduce ? false : { y: "0%", opacity: 0, filter: "blur(3px)" }}
                animate={{ y: `${-d * 10}%`, opacity: 1, filter: "blur(0px)" }}
                transition={
                  reduce
                    ? { duration: 0 }
                    : first
                      ? {
                          duration: 1.4,
                          delay: delay + i * 0.05,
                          ease: ROLL_EASE,
                        }
                      : { duration: 0.5, ease: ROLL_EASE }
                }
              >
                {DIGITS.map((n) => (
                  <span key={n} className="block h-[1em] text-center">
                    {n}
                  </span>
                ))}
              </motion.span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

// ─── Avatars ────────────────────────────────────────────────────────────────

const TINTS = [
  "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200",
  "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200",
  "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200",
];

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

// The ring is the card colour, so neighbours look cut out of each other
// rather than outlined.
function Avatar({ person, index }: { person: Contributor; index: number }) {
  return (
    <span
      tabIndex={0}
      role="img"
      aria-label={person.name}
      className={cn(
        "group relative block size-9 rounded-full ring-[3px] ring-(--os-card) transition-transform duration-200 ease-out hover:z-10 hover:-translate-y-1 focus-visible:z-10 focus-visible:-translate-y-1",
        FOCUS,
      )}
    >
      {person.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={person.src}
          alt=""
          width={36}
          height={36}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-full rounded-full bg-muted object-cover"
        />
      ) : (
        <span className={cn("grid size-full place-items-center rounded-full text-[11px] font-semibold", TINTS[index % TINTS.length])}>
          {initials(person.name)}
        </span>
      )}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 translate-y-1 scale-95 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-medium text-background opacity-0 transition-[opacity,transform] duration-150 ease-out group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:scale-100 group-focus-visible:opacity-100"
      >
        {person.name}
      </span>
    </span>
  );
}

// ─── Feed ───────────────────────────────────────────────────────────────────
// A window of `rows` entries. Each step the window moves one entry back
// through the list, so an entry drops in at the top, the rest slide down and
// the last one slides out of the bottom.

const ROW = 44;

function Feed({
  items,
  rows,
  interval,
  run,
  reduce,
}: {
  items: readonly RepoActivity[];
  rows: number;
  interval: number;
  run: boolean;
  reduce: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const inView = useInView(box, { amount: 0.2 });
  const [hover, setHover] = useState(false);
  const [visible, setVisible] = useState(true);
  const [start, setStart] = useState(0);
  // The first appearance cascades in; once it has, steps run without delay.
  const [entered, setEntered] = useState(false);
  const n = items.length;
  const ticking = run && !reduce && inView && !hover && visible && n > rows && interval > 0;

  useEffect(() => {
    const on = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, []);

  useEffect(() => {
    if (!run || entered) return;
    const t = setTimeout(() => setEntered(true), 900);
    return () => clearTimeout(t);
  }, [run, entered]);

  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setStart((s) => (s - 1 + n) % n), interval * 1000);
    return () => clearInterval(id);
  }, [ticking, interval, n]);

  const windowed = Array.from({ length: rows }, (_, i) => (start + i) % n);

  return (
    <div
      ref={box}
      className={cn("mt-5 overflow-hidden rounded-2xl", RAISED)}
      onPointerEnter={(e) => e.pointerType === "mouse" && setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <div className="flex items-center justify-between px-3.5 pb-1 pt-3 text-xs font-medium text-muted-foreground">
        <span>Activity</span>
        <span className="flex items-center gap-1.5">
          <span className="relative flex size-1.5">
            {ticking && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500 opacity-60" />}
            <span
              className={cn("relative size-1.5 rounded-full transition-colors duration-300", ticking ? "bg-emerald-500" : "bg-zinc-400")}
            />
          </span>
          {ticking ? "Live" : "Paused"}
        </span>
      </div>
      <ul className="relative flex flex-col overflow-hidden px-1.5 pb-1.5" style={{ height: rows * ROW + 6 }} aria-label="Recent activity">
        <AnimatePresence initial={false} mode="popLayout">
          {windowed.map((idx, row) => {
            const a = items[idx];
            const s = ACTIVITY_STYLE[a.type];
            return (
              <motion.li
                key={idx}
                layout={reduce ? false : "position"}
                className="group/row flex shrink-0 items-center gap-2.5 rounded-xl px-2 text-[13px] transition-colors duration-150 hover:bg-black/[0.035] dark:hover:bg-white/[0.05]"
                style={{ height: ROW }}
                initial={reduce ? false : { opacity: 0, y: -14, filter: "blur(3px)" }}
                animate={run ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: -14, filter: "blur(3px)" }}
                exit={{
                  opacity: 0,
                  y: ROW,
                  filter: "blur(3px)",
                  transition: { duration: 0.4, ease: EASE_OUT },
                }}
                transition={{
                  duration: 0.45,
                  ease: EASE_OUT,
                  delay: !entered && !reduce ? 0.45 + row * 0.07 : 0,
                  layout: { type: "spring", duration: 0.45, bounce: 0 },
                }}
              >
                <span
                  className={cn(
                    "grid size-7 shrink-0 place-items-center rounded-lg transition-transform duration-200 ease-out group-hover/row:scale-110",
                    s.tone,
                  )}
                >
                  <s.Icon size={14} aria-hidden />
                </span>
                <span className="sr-only">{s.label}: </span>
                <span className="min-w-0 flex-1 truncate">{a.title}</span>
                {a.meta && (
                  <span className="shrink-0 font-mono text-xs text-muted-foreground transition-colors duration-150 group-hover/row:text-foreground">
                    {a.meta}
                  </span>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
