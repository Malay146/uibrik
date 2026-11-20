"use client";

import { useSyncExternalStore, useMemo } from "react";
import { cn } from "@/lib/utils";
import ShatterText from "../scatter-text/shatter-text";

// Same type scale and props as the other text effects.
type EffectProps = { play: number };
const TEXT = "text-[length:var(--text-effect-size,1.25rem)] leading-[1.4] text-zinc-700 font-medium dark:text-zinc-200";

// Tracks the `dark` class on <html>, the class-based dark mode shadcn sets up.
// For colours that live outside CSS: WebGL uniforms, canvas fills and
// motion-animated values can't use Tailwind's `dark:` variant.

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

const getSnapshot = () => document.documentElement.classList.contains("dark");

function useIsDark() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

// 19 — Each press breaks the phrase into particles, left to right, and the
// particles regroup into the next phrase. It reuses the WebGL ShatterText
// from /13, driven by the Change button instead of a timer and without its
// looping shimmer.
const SCATTER_PHRASES = ["Scatter the words", "Gather them again", "Into something new"];

// ShatterText reads its colours once when it sets up WebGL, so the palette
// follows the theme class on <html> and is passed in explicitly.
const SCATTER_COLORS = {
  light: { color: "#3f3f46", flightColor: "#71717a", glowColor: "#a1a1aa" },
  dark: { color: "#e4e4e7", flightColor: "#a1a1aa", glowColor: "#fafafa" },
};

export function ParticleScatter({
  play,
  words = SCATTER_PHRASES,
  waveSpeed = 1.25,
  particleCount = 3000,
  scatterMin = 18,
  scatterMax = 44,
}: EffectProps & {
  words?: string[];
  /** Speed of the scatter wave. */
  waveSpeed?: number;
  /** Particles sampled across the text. */
  particleCount?: number;
  /** Closest a particle scatters, px. */
  scatterMin?: number;
  /** Farthest a particle scatters, px. */
  scatterMax?: number;
}) {
  const dark = useIsDark();
  // one tuple identity per pair of numbers, so ShatterText doesn't rebuild every render
  const radius = useMemo<[number, number]>(() => [scatterMin, scatterMax], [scatterMin, scatterMax]);

  return (
    <ShatterText
      phrases={words}
      trigger={play}
      shimmer={false}
      className={cn(TEXT, "h-[5.6em] min-h-0")}
      waveSpeed={waveSpeed}
      scatterRadius={radius}
      particleCount={particleCount}
      {...SCATTER_COLORS[dark ? "dark" : "light"]}
    />
  );
}
