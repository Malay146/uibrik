"use client";

import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

// How far a keycap travels when pressed, in px.
const TRAVEL = 2;

export type LiveKbdProps = {
  /** The shortcut, e.g. ["mod", "k"]. "mod" is ⌘ on Apple devices and Ctrl elsewhere; also "shift", "alt", "ctrl", "meta" and any key name. */
  keys?: string[];
  /** Text before the keys. Leave empty for the keys alone. */
  label?: string;
  /** Called when the shortcut is pressed on the keyboard or the button is clicked. */
  onTrigger?: () => void;
  /** Listen for the shortcut on the whole page. */
  listen?: boolean;
  /** Stop the browser's own action for the shortcut, like ⌘K focusing the address bar. */
  preventDefault?: boolean;
  className?: string;
};

const MODS = new Set(["meta", "control", "shift", "alt"]);

const noop = () => () => {};
const isApple = () => /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);

function normal(key: string, mac: boolean) {
  const k = key.toLowerCase();
  if (k === "mod") return mac ? "meta" : "control";
  if (k === "ctrl") return "control";
  if (k === "cmd" || k === "command") return "meta";
  if (k === "option") return "alt";
  if (k === "esc") return "escape";
  return k;
}

function glyph(key: string, mac: boolean) {
  const map: Record<string, string> = mac
    ? { meta: "⌘", control: "⌃", shift: "⇧", alt: "⌥", enter: "↵", escape: "esc", backspace: "⌫" }
    : { meta: "Win", control: "Ctrl", shift: "Shift", alt: "Alt", enter: "Enter", escape: "Esc", backspace: "⌫" };
  const arrows: Record<string, string> = { arrowup: "↑", arrowdown: "↓", arrowleft: "←", arrowright: "→", " ": "Space" };
  return map[key] ?? arrows[key] ?? (key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1));
}

export function LiveKbd({ keys = ["mod", "k"], label = "Search", onTrigger, listen = true, preventDefault = true, className }: LiveKbdProps) {
  const reduce = useReducedMotion();
  // Assume Apple on the server; corrected on hydration.
  const mac = useSyncExternalStore(noop, isApple, () => true);
  const [down, setDown] = useState<Set<string>>(() => new Set());
  const flash = useAnimationControls();
  const trigger = useRef(onTrigger);
  useEffect(() => {
    trigger.current = onTrigger;
  });
  const release = useRef<ReturnType<typeof setTimeout>>(undefined);

  const combo = keys.map((k) => normal(k, mac));
  const comboKey = combo.join("+");

  const fire = () => {
    trigger.current?.();
    if (!reduce) flash.start({ scale: [1, 0.97, 1], transition: { duration: 0.28, ease: EASE_OUT } });
  };

  useEffect(() => {
    if (!listen) return;
    const want = comboKey.split("+");
    const main = want.filter((k) => !MODS.has(k));
    // Modifiers come from the event's flags; other keys count as held for a
    // moment after keydown, since macOS drops their keyup while ⌘ is down.
    const held = (e: KeyboardEvent, extra?: string) => {
      const s = new Set<string>();
      if (e.metaKey) s.add("meta");
      if (e.ctrlKey) s.add("control");
      if (e.shiftKey) s.add("shift");
      if (e.altKey) s.add("alt");
      if (extra) s.add(extra);
      return s;
    };
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const s = held(e, MODS.has(k) ? undefined : k);
      const relevant = new Set([...s].filter((x) => want.includes(x)));
      setDown(relevant);
      clearTimeout(release.current);
      if (!MODS.has(k)) release.current = setTimeout(() => setDown((d) => new Set([...d].filter((x) => MODS.has(x)))), 180);
      const match = want.every((w) => s.has(w)) && main.every((m) => m === k || s.has(m));
      if (match) {
        if (preventDefault) e.preventDefault();
        if (!e.repeat) fire();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const s = held(e);
      setDown((d) => new Set([...d].filter((x) => (MODS.has(x) ? s.has(x) : x !== k && s.has("meta")))));
    };
    const clear = () => setDown(new Set());
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clear);
      clearTimeout(release.current);
    };
    // fire only reads refs and the flash controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listen, comboKey, preventDefault, reduce]);

  // A click plays the shortcut: each key goes down in turn, then all come up.
  const click = () => {
    clearTimeout(release.current);
    combo.forEach((k, i) => setTimeout(() => setDown((d) => new Set([...d, k])), reduce ? 0 : i * 70));
    setTimeout(fire, reduce ? 0 : combo.length * 70);
    release.current = setTimeout(() => setDown(new Set()), reduce ? 120 : combo.length * 70 + 160);
  };

  const name = combo.map((k) => glyph(k, mac)).join(" ");

  return (
    <motion.button
      type="button"
      onClick={click}
      animate={flash}
      aria-keyshortcuts={combo.map((k) => (k === "control" ? "Control" : k === "meta" ? "Meta" : k.length === 1 ? k.toUpperCase() : k[0].toUpperCase() + k.slice(1))).join("+")}
      aria-label={label ? `${label} (${name})` : name}
      className={cn(
        "flex h-10 cursor-pointer items-center gap-3 rounded-xl bg-neutral-100 text-sm font-medium tracking-tight text-neutral-600 outline-none transition-colors duration-150 hover:bg-neutral-200/70 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-neutral-400 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100",
        label ? "pl-3.5 pr-2" : "px-2",
        className,
      )}
    >
      {label && <span>{label}</span>}
      <span className="flex items-center gap-1" aria-hidden>
        {combo.map((k) => (
          <Cap key={k} pressed={down.has(k)} reduce={!!reduce}>
            {glyph(k, mac)}
          </Cap>
        ))}
      </span>
    </motion.button>
  );
}

function Cap({ pressed, reduce, children }: { pressed: boolean; reduce: boolean; children: string }) {
  return (
    // The darker base is the key's side; pressing sinks the face onto it.
    <span className="relative flex rounded-[7px] bg-neutral-300 dark:bg-neutral-950" style={{ paddingBottom: TRAVEL }}>
      <motion.kbd
        initial={false}
        animate={{ y: pressed ? TRAVEL : 0 }}
        transition={reduce ? { duration: 0 } : pressed ? { duration: 0.06, ease: "easeOut" } : { duration: 0.18, ease: EASE_OUT }}
        className={cn(
          "flex h-6 min-w-6 items-center justify-center rounded-[7px] px-1.5 font-sans text-xs font-medium leading-none transition-colors duration-100",
          pressed ? "bg-neutral-50 text-neutral-900 dark:bg-neutral-700 dark:text-white" : "bg-white text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
        )}
      >
        {children}
      </motion.kbd>
    </span>
  );
}
