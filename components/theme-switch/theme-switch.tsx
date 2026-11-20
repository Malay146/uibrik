"use client";

import { motion } from "motion/react";
import { useId, useRef, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export type Theme = "light" | "dark";

/**
 * How the new theme takes over the page.
 * - circle: grows out from the button
 * - expand: the button's rounded box grows to fill the page
 * - split: a band opens out from the button, either across or down the page
 * - wipe: a straight edge sweeps across the page
 * - diagonal: sweeps in from a corner
 * - blinds: slats open across the page, together or one after another
 * - blur: the old page blurs away as the new one comes into focus
 * - zoom: the old page sinks back as the new one settles forward
 * - none: switches instantly
 */
export type RevealMode = "circle" | "expand" | "split" | "wipe" | "diagonal" | "blinds" | "blur" | "zoom" | "none";

/** The page edge a wipe starts from. */
export type WipeFrom = "left" | "right" | "top" | "bottom";
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
/** Split: a horizontal band opening up and down, or a vertical one opening sideways. Blinds: rows or columns. */
export type Orientation = "horizontal" | "vertical";
/** "auto" uses each mode's own curve: ease-out for reveals from a point, ease-in-out for sweeps. */
export type RevealEasing = "auto" | "out" | "in-out" | "linear";

export type RevealOptions = {
  /** Where the reveal starts, in viewport px. Defaults to the centre. */
  origin?: { x: number; y: number };
  mode?: RevealMode;
  /** Seconds. */
  duration?: number;
  easing?: RevealEasing;
  /** Wipe: which edge it starts from. */
  wipeFrom?: WipeFrom;
  /** Diagonal: which corner it starts from. */
  corner?: Corner;
  /** Split and blinds: which way the band or slats run. */
  orientation?: Orientation;
  /** Blinds: how many slats. */
  slats?: number;
  /** Blinds: 0 opens every slat together; towards 1, each waits longer for the one before. */
  cascade?: number;
  /** Blur: how far the pages blur, in px. */
  blurAmount?: number;
  /** Zoom: how far the pages scale, as a fraction (0.04 is 4%). */
  depth?: number;
  /** localStorage key the choice is saved under. */
  storageKey?: string;
};

const CURVES = {
  out: { css: "cubic-bezier(0.23, 1, 0.32, 1)", fn: (t: number) => 1 - (1 - t) ** 3 },
  "in-out": { css: "cubic-bezier(0.65, 0, 0.35, 1)", fn: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2) },
  linear: { css: "linear", fn: (t: number) => t },
} as const;

// Reveals that grow from a point read best fast-then-settling; sweeps across
// the whole page read best easing in and out.
const AUTO_CURVE: Record<RevealMode, keyof typeof CURVES> = {
  circle: "out",
  expand: "out",
  split: "out",
  blur: "out",
  zoom: "out",
  none: "out",
  wipe: "in-out",
  diagonal: "in-out",
  blinds: "in-out",
};

const WIPES: Record<WipeFrom, string> = {
  left: "inset(0 100% 0 0)",
  right: "inset(0 0 0 100%)",
  top: "inset(0 0 100% 0)",
  bottom: "inset(100% 0 0 0)",
};

// A triangle anchored at the corner whose far edge sweeps past the opposite one.
const DIAGONALS: Record<Corner, [string, string]> = {
  "top-left": ["polygon(0 0, 0 0, 0 0)", "polygon(0 0, 200% 0, 0 200%)"],
  "top-right": ["polygon(100% 0, 100% 0, 100% 0)", "polygon(100% 0, -100% 0, 100% 200%)"],
  "bottom-left": ["polygon(0 100%, 0 100%, 0 100%)", "polygon(0 100%, 0 -100%, 200% 100%)"],
  "bottom-right": ["polygon(100% 100%, 100% 100%, 100% 100%)", "polygon(100% 100%, -100% 100%, 100% -100%)"],
};

/** One polygon tracing every slat, slat `i` opened `open(i)` (0 to 1) across its band. */
function blinds(count: number, orientation: Orientation, open: (i: number) => number) {
  const band = 100 / count;
  const points: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = i * band;
    const b = a + band * open(i);
    // Each slat ends on the page edge where the next one starts, so the link
    // between them runs along that edge, has no width, and the slats stay separate.
    if (orientation === "horizontal") points.push(`0% ${a}%`, `100% ${a}%`, `100% ${b}%`, `0% ${b}%`);
    else points.push(`${a}% 0%`, `${a}% 100%`, `${b}% 100%`, `${b}% 0%`);
  }
  return `polygon(${points.join(", ")})`;
}

const STYLE_ID = "theme-switch-reveal";

// The reveal that currently owns the data-theme-reveal flag, so a reveal cut
// short by the next click doesn't clear the flag the next one set.
let activeReveal: object | null = null;

/**
 * Switches the page theme (the `dark` class on <html>, which Tailwind's
 * `dark:` variant reads), saves it, and animates the change with a view
 * transition where the browser supports one.
 *
 * While the transition runs, <html> carries `data-theme-reveal`. Safari draws
 * the transition's snapshots without backdrop-filter, so a frosted bar turns
 * see-through for that moment; style it solid under the flag to cover it.
 */
export function revealTheme(
  next: Theme,
  {
    origin,
    mode = "circle",
    duration = 0.5,
    easing = "auto",
    wipeFrom = "left",
    corner = "top-left",
    orientation = "horizontal",
    slats = 8,
    cascade = 0,
    blurAmount = 8,
    depth = 0.04,
    storageKey = "theme",
  }: RevealOptions = {},
) {
  const root = document.documentElement;
  const apply = () => {
    root.classList.toggle("dark", next === "dark");
    try {
      // Other same-origin windows hear this through the `storage` event.
      localStorage.setItem(storageKey, next);
    } catch {}
  };

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (mode === "none" || still || !document.startViewTransition) return apply();

  // The browser's default is a crossfade of the whole page; each mode below
  // replaces it, so switch the default off once per document.
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = "::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}";
    document.head.appendChild(style);
  }

  const { x, y } = origin ?? { x: innerWidth / 2, y: innerHeight / 2 };
  const ms = duration * 1000;
  // Unknown values (e.g. from an older saved setting) fall back to the mode's own curve.
  const curve = CURVES[easing in CURVES ? (easing as keyof typeof CURVES) : AUTO_CURVE[mode]];
  // Set before the transition starts, so the old snapshot is taken with it too.
  const token = {};
  activeReveal = token;
  root.dataset.themeReveal = "";
  const transition = document.startViewTransition(() => flushSync(apply));
  transition.finished.finally(() => {
    if (activeReveal !== token) return;
    activeReveal = null;
    delete root.dataset.themeReveal;
  });

  transition.ready.then(() => {
    // On a long page the first frame of the new theme can take a few hundred ms to paint (Safari
    // repaints everything below the fold too). An animation started now would run through that
    // stall and show only its last stretch, so each one is held on its first keyframe until a
    // frame has actually been drawn, then played in full.
    const held: Animation[] = [];
    requestAnimationFrame(() => requestAnimationFrame(() => held.forEach((a) => a.play())));
    const run = (pseudo: "new" | "old", keyframes: Keyframe[] | PropertyIndexedKeyframes, ease: string = curve.css) => {
      const animation = root.animate(keyframes, { duration: ms, easing: ease, pseudoElement: `::view-transition-${pseudo}(root)` });
      animation.pause();
      held.push(animation);
    };

    if (mode === "circle") {
      // Out to the farthest corner, so the circle always covers the page.
      const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      run("new", { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] });
    } else if (mode === "expand") {
      // Starts as a button-sized rounded box on the button and grows to the
      // page edges while its corners square off.
      const h = 20;
      run("new", {
        clipPath: [
          `inset(${y - h}px ${innerWidth - x - h}px ${innerHeight - y - h}px ${x - h}px round 12px)`,
          "inset(0px 0px 0px 0px round 0px)",
        ],
      });
    } else if (mode === "split") {
      const start =
        orientation === "horizontal" ? `inset(${y}px 0px ${innerHeight - y}px 0px)` : `inset(0px ${innerWidth - x}px 0px ${x}px)`;
      run("new", { clipPath: [start, "inset(0px 0px 0px 0px)"] });
    } else if (mode === "wipe") {
      run("new", { clipPath: [WIPES[wipeFrom] ?? WIPES.left, "inset(0% 0% 0% 0%)"] });
    } else if (mode === "diagonal") {
      run("new", { clipPath: DIAGONALS[corner] ?? DIAGONALS["top-left"] });
    } else if (mode === "blinds") {
      // Each slat gets its own window of the timeline: with no cascade they
      // all share it, with more each starts later and runs shorter. The curve
      // is applied per slat, so the keyframes themselves play linearly.
      const count = Math.max(2, Math.round(slats));
      const lag = Math.min(0.9, Math.max(0, cascade));
      const span = 1 - lag;
      const steps = 40;
      const frames = Array.from({ length: steps + 1 }, (_, k) => {
        const t = k / steps;
        return blinds(count, orientation, (i) => {
          const start = (i / (count - 1)) * lag;
          return curve.fn(Math.min(1, Math.max(0, (t - start) / span)));
        });
      });
      run("new", { clipPath: frames }, "linear");
    } else if (mode === "blur") {
      run("old", { opacity: [1, 0], filter: ["blur(0px)", `blur(${blurAmount}px)`] });
      run("new", { opacity: [0, 1], filter: [`blur(${blurAmount}px)`, "blur(0px)"] });
    } else if (mode === "zoom") {
      run("old", { opacity: [1, 0], transform: ["scale(1)", `scale(${1 - depth})`] });
      run("new", { opacity: [0, 1], transform: [`scale(${1 + depth})`, "scale(1)"] });
    }
  });
}

export type ThemeSwitchProps = {
  /** Controlled theme. Leave unset and the button follows the page's own theme. */
  theme?: Theme;
  /** Called with the theme being switched to. */
  onChange?: (theme: Theme) => void;
  /**
   * Applies the theme in place of the built-in page switch, e.g. a theme
   * provider's setter. Gets the button's centre, for a transition of your own.
   */
  setTheme?: (theme: Theme, origin: { x: number; y: number }) => void;
  /** How the new theme takes over the page. */
  reveal?: RevealMode;
  /** Seconds the reveal takes. */
  revealDuration?: number;
} & Pick<RevealOptions, "easing" | "wipeFrom" | "corner" | "orientation" | "slats" | "cascade" | "blurAmount" | "depth"> & {
  /** localStorage key the choice is saved under. */
  storageKey?: string;
  /** Width and height in px. */
  size?: number;
  /** Corner radius in px. */
  radius?: number;
  className?: string;
};

// The button follows the page's theme however it changes: this switch,
// another toggle, or another tab.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}
const pageTheme = (): Theme => (document.documentElement.classList.contains("dark") ? "dark" : "light");

// Eight rays, every 45deg, drawn as short strokes pointing out from the centre.
const RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  return { x1: 12 + Math.cos(a) * 8, y1: 12 + Math.sin(a) * 8, x2: 12 + Math.cos(a) * 10, y2: 12 + Math.sin(a) * 10 };
});

export function ThemeSwitch({
  theme: controlled,
  onChange,
  setTheme,
  reveal = "circle",
  revealDuration = 0.5,
  easing,
  wipeFrom,
  corner,
  orientation,
  slats,
  cascade,
  blurAmount,
  depth,
  storageKey = "theme",
  size = 40,
  radius = 12,
  className,
}: ThemeSwitchProps) {
  const page = useSyncExternalStore(subscribe, pageTheme, () => "light" as Theme);
  // The server can't know the theme, so the icon waits for the page's script to tell it, then
  // shows in place rather than turning from the server's guess.
  const known = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  const theme = controlled ?? page;
  const dark = theme === "dark";
  const maskId = useId();
  const ref = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    const next: Theme = dark ? "light" : "dark";
    onChange?.(next);
    const box = ref.current?.getBoundingClientRect();
    const origin = box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
    if (setTheme) setTheme(next, origin);
    else if (!controlled) {
      revealTheme(next, {
        origin,
        mode: reveal,
        duration: revealDuration,
        easing,
        wipeFrom,
        corner,
        orientation,
        slats,
        cascade,
        blurAmount,
        depth,
        storageKey,
      });
    }
  };

  return (
    <motion.button
      ref={ref}
      type="button"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggle}
      whileTap={{ scale: 0.94 }}
      style={{ width: size, height: size, borderRadius: radius }}
      className={cn(
        "flex shrink-0 cursor-pointer items-center justify-center bg-muted text-neutral-700 outline-none transition-colors duration-150 hover:bg-neutral-200/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-neutral-300 dark:hover:bg-neutral-800",
        className,
      )}
    >
      <motion.svg
        key={known ? "known" : "guess"}
        aria-hidden
        className={known ? "opacity-100 transition-opacity duration-200" : "opacity-0"}
        width={20}
        height={20}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        initial={false}
        // A quarter turn carries the change, so sun and moon read as one object.
        // The sun is symmetric, so its resting angle is invisible; the moon
        // lands upright with its bite to the top right.
        animate={{ rotate: dark ? 0 : -90 }}
        transition={{ duration: 0.45, ease: EASE_OUT }}
      >
        <mask id={maskId}>
          <rect width={24} height={24} fill="white" />
          {/* The bite: parked off the corner for the sun, slid over the disc for the moon. */}
          <motion.circle
            r={7}
            fill="black"
            initial={false}
            animate={dark ? { cx: 17, cy: 7 } : { cx: 30, cy: -6 }}
            transition={{ duration: 0.45, ease: EASE_OUT }}
          />
        </mask>
        <motion.circle
          cx={12}
          cy={12}
          mask={`url(#${maskId})`}
          fill="currentColor"
          stroke="none"
          initial={false}
          animate={{ r: dark ? 9 : 4.5 }}
          transition={{ duration: 0.45, ease: EASE_OUT }}
        />
        {RAYS.map((ray, i) => (
          <motion.line
            key={i}
            x1={ray.x1}
            y1={ray.y1}
            initial={false}
            // The outer end slides in to the inner one, so each ray retracts toward the disc.
            animate={dark ? { x2: ray.x1, y2: ray.y1, opacity: 0 } : { x2: ray.x2, y2: ray.y2, opacity: 1 }}
            // Rays pull in first on the way to night, and come out last on the way back.
            transition={{ duration: 0.25, ease: EASE_OUT, delay: dark ? i * 0.015 : 0.15 + i * 0.02 }}
          />
        ))}
      </motion.svg>
    </motion.button>
  );
}

const noop = () => () => {};
