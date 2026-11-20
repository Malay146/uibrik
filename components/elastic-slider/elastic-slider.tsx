"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  animate,
} from "motion/react";
import NumberFlow from "@number-flow/react";

// ─── Constants ────────────────────────────────────────────────────────────────
const THUMB_SIZE = 24;
// At the lowest value the fill rests as a small pill with the handle centred
// inside it, rather than shrinking to nothing and leaving the handle outside.
const REST = 36;

// ─── Rubber-band formula ──────────────────────────────────────────────────────
function rubberband(x: number, min: number, max: number): number {
  if (x >= min && x <= max) return x;
  const dim = max - min;
  if (x < min) {
    const d = min - x;
    return min - d / (1 + d / (dim * 0.55));
  }
  const d = x - max;
  return max + d / (1 + d / (dim * 0.55));
}

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

// ─── Spring presets ───────────────────────────────────────────────────────────
const SPRING_SNAPPY = { stiffness: 500, damping: 30, mass: 0.6 };
const SPRING_GENTLE = { stiffness: 280, damping: 26, mass: 0.8 };

// ─── Component ────────────────────────────────────────────────────────────────
export type ElasticSliderProps = {
  label?: string;
  /** Starting value. */
  defaultValue?: number;
  min?: number;
  max?: number;
  /** Track width in px. */
  width?: number;
  onChange?: (value: number) => void;
};

export function ElasticSlider({
  label = "Elastic Slider",
  defaultValue = 40,
  min: MIN = 0,
  max: MAX = 100,
  width: TRACK_W = 320,
  onChange,
}: ElasticSliderProps) {
  function pxToValue(px: number) {
    return clamp(Math.round(MIN + ((px - REST) / (TRACK_W - REST)) * (MAX - MIN)), MIN, MAX);
  }
  function valueToPx(v: number) {
    return REST + ((v - MIN) / (MAX - MIN)) * (TRACK_W - REST);
  }

  const outerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const hasMoved = useRef(false); // distinguishes click vs drag
  const [value, setValueState] = useState(defaultValue);
  const setValue = (v: number) => {
    setValueState(v);
    onChange?.(v);
  };
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  // ── Core motion value ───────────────────────────────────────────────────────
  const displayX = useMotionValue(valueToPx(defaultValue));

  // ── Track stretch geometry ──────────────────────────────────────────────────
  const rightOvershoot = useTransform(displayX, (dx) =>
    Math.max(0, dx - TRACK_W),
  );

  const trackShiftX = useTransform(displayX, (dx) => Math.min(0, dx - REST));
  const trackPillW = useTransform(displayX, (dx) => {
    const ls = Math.max(0, REST - dx);
    const rs = Math.max(0, dx - TRACK_W);
    return TRACK_W + ls + rs;
  });
  const fillW = useTransform(displayX, (dx) => Math.max(REST, dx));

  // ── Thumb squash/stretch from overshoot ─────────────────────────────────────
  const thumbScaleX = useTransform(displayX, (dx) => {
    const lo = Math.max(0, REST - dx);
    const ro = Math.max(0, dx - TRACK_W);
    const stretch = (lo + ro) / TRACK_W;
    return 1 + clamp(stretch * 1.2, 0, 0.35);
  });
  const thumbScaleY = useTransform(displayX, (dx) => {
    const lo = Math.max(0, REST - dx);
    const ro = Math.max(0, dx - TRACK_W);
    const stretch = (lo + ro) / TRACK_W;
    return 1 - clamp(stretch * 0.7, 0, 0.22);
  });

  // ── Max-tension effect on the value number ──────────────────────────────
  // As the track stretches past MAX, "100" grows and crackles like it's about
  // to burst — multi-frequency jitter + tilt + progressive scale.
  // Thresholds are high so the effect only kicks in with a deliberate hard pull.
  const numberScaleRaw = useTransform(rightOvershoot, [28, 85], [1, 1.38]);
  // Spring wrapper so scale eases back smoothly when released
  const numberScale = useSpring(numberScaleRaw, { stiffness: 260, damping: 18, mass: 0.7 });
  const numberJitter = useMotionValue(0);
  const numberRotate = useMotionValue(0); // tilt: oscillates left↔right like it's straining

  useEffect(() => {
    let raf: number;
    let t0: number | null = null;

    function loop(ts: number) {
      const overshoot = rightOvershoot.get();
      if (overshoot > 25) {
        if (t0 === null) t0 = ts;
        const t = (ts - t0) * 0.001; // seconds
        // Intensity ramps 0→1 from overshoot 25→65
        const intensity = Math.min((overshoot - 25) / 40, 1);

        // X jitter: three overlapping sine waves for organic crackle
        const jitter =
          Math.sin(t * 55) * 2.2 +
          Math.sin(t * 31) * 1.1 +
          Math.sin(t * 73) * 0.6;
        numberJitter.set(jitter * intensity);

        // Tilt: different frequencies (out-of-phase with jitter) so rotation
        // and translation feel independent — more chaotic, more "about to burst"
        const tilt =
          Math.sin(t * 19) * 5 +
          Math.sin(t * 41) * 2.5;
        numberRotate.set(tilt * intensity);
      } else {
        t0 = null;
        numberJitter.set(0);
        numberRotate.set(0);
      }
      raf = requestAnimationFrame(loop);
    }

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []); // motion values are stable refs — no deps needed

  // ── Micro-interaction springs ─────────────────────────────────────────────
  // Scale: applied to the track area only (not the label row)
  const trackScaleRaw = useMotionValue(1);
  const trackScale = useSpring(trackScaleRaw, SPRING_SNAPPY);

  // Thumb height: taller on hover, shorter on grab
  const thumbHeightRaw = useMotionValue(24);
  const thumbHeight = useSpring(thumbHeightRaw, SPRING_SNAPPY);

  // Thumb opacity
  const thumbOpacityRaw = useMotionValue(1);
  const thumbOpacity = useSpring(thumbOpacityRaw, SPRING_GENTLE);

  // Track opacity
  const trackOpacityRaw = useMotionValue(1);
  const trackOpacity = useSpring(trackOpacityRaw, SPRING_GENTLE);

  // ── State → spring targets ───────────────────────────────────────────────
  function applyState(h: boolean, d: boolean) {
    if (d) {
      trackScaleRaw.set(0.97);
      thumbHeightRaw.set(20);
      thumbOpacityRaw.set(0.7);
      trackOpacityRaw.set(1);
    } else if (h) {
      trackScaleRaw.set(1);
      thumbHeightRaw.set(28);
      thumbOpacityRaw.set(1);
      trackOpacityRaw.set(0.9);
    } else {
      trackScaleRaw.set(1);
      thumbHeightRaw.set(24);
      thumbOpacityRaw.set(1);
      trackOpacityRaw.set(1);
    }
  }

  // ── Pointer helpers ─────────────────────────────────────────────────────────
  function getTrackPx(e: React.PointerEvent) {
    const rect = outerRef.current!.getBoundingClientRect();
    return e.clientX - rect.left;
  }

  const onPointerEnter = useCallback(() => {
    setHovered(true);
    applyState(true, isDragging.current);
  }, []);

  const onPointerLeave = useCallback(() => {
    setHovered(false);
    if (!isDragging.current) applyState(false, false);
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      isDragging.current = true;
      hasMoved.current = false;
      setDragging(true);
      applyState(true, true);
      const px = getTrackPx(e);
      displayX.set(rubberband(px, REST, TRACK_W));
      setValue(pxToValue(clamp(px, REST, TRACK_W)));
    },
    [displayX],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging.current) return;
      hasMoved.current = true;
      const px = getTrackPx(e);
      displayX.set(rubberband(px, REST, TRACK_W));
      setValue(pxToValue(clamp(px, REST, TRACK_W)));
    },
    [displayX],
  );

  const onPointerUp = useCallback(() => {
    isDragging.current = false;
    setDragging(false);
    applyState(hovered, false);

    const dx = displayX.get();
    const target = valueToPx(pxToValue(clamp(dx, REST, TRACK_W)));

    if (!hasMoved.current) {
      // Pure click — smooth spring glide to the clicked position
      animate(displayX, target, {
        type: "spring",
        stiffness: 180,
        damping: 22,
        mass: 1.1,
      });
    } else {
      // End of drag — rubber-band snap-back
      animate(displayX, target, {
        type: "spring",
        stiffness: 340,
        damping: 22,
        mass: 0.9,
      });
    }
  }, [displayX, hovered]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let next = value;
      if (e.key === "ArrowRight" || e.key === "ArrowUp")
        next = clamp(value + 1, MIN, MAX);
      if (e.key === "ArrowLeft" || e.key === "ArrowDown")
        next = clamp(value - 1, MIN, MAX);
      if (e.key === "Home") next = MIN;
      if (e.key === "End") next = MAX;
      if (next !== value) {
        e.preventDefault();
        setValue(next);
        animate(displayX, valueToPx(next), {
          type: "spring",
          stiffness: 400,
          damping: 30,
        });
      }
    },
    [value, displayX],
  );

  return (
    <>
      {/*
        Outer wrapper: fixed width, NO scale here — label stays stable.
        Scale is scoped to the track motion.div below.
      */}
      <div className="flex flex-col gap-3 select-none" style={{ width: TRACK_W }}>

        {/* ── Label row — outside the scale zone ── */}
        <div className="flex items-center justify-between pl-2 pr-4">
          <span className="text-xl font-medium tracking-tight text-neutral-700 dark:text-neutral-400">
            {label}
          </span>
          <motion.span
            className="text-xl font-semibold tabular-nums tracking-tight text-neutral-700 dark:text-neutral-100"
            style={{
              minWidth: "2.5rem",
              textAlign: "right",
              opacity: dragging ? 0.6 : 1,
              transition: "opacity 200ms ease",
              // Tension: scale grows, jitters, and tilts when stretching hard past MAX
              scale: numberScale,
              x: numberJitter,
              rotate: numberRotate,
              transformOrigin: "right center",
              display: "inline-block",
            }}
          >
            <NumberFlow
              value={value}
              transformTiming={{ duration: 200, easing: "ease-out" }}
              spinTiming={{ duration: 180, easing: "ease-out" }}
              opacityTiming={{ duration: 150, easing: "ease-out" }}
            />
          </motion.span>
        </div>

        {/* ── Scale wrapper — scoped to the track only ── */}
        <motion.div style={{ scale: trackScale }}>
          <div
            ref={outerRef}
            role="slider"
            aria-valuemin={MIN}
            aria-valuemax={MAX}
            aria-valuenow={value}
            aria-label={label}
            tabIndex={0}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            className="relative outline-none"
            style={{
              height: THUMB_SIZE,
              overflow: "visible",
              touchAction: "none",
              cursor: dragging ? "grabbing" : "grab",
            }}
          >
            {/* ── Elastic track pill ── */}
            <motion.div
              style={{
                position: "absolute",
                top: "50%",
                translateY: "-50%",
                height: 40,
                x: trackShiftX,
                width: trackPillW,
                overflow: "hidden",
                pointerEvents: "none",
                opacity: trackOpacity,
              }}
              className="bg-neutral-100 dark:bg-neutral-900 squircle-mask squircle-2xl"
            >
              {/* Fill */}
              <motion.div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: fillW,
                }}
                className="bg-neutral-800 dark:bg-neutral-600 squircle-mask squircle-2xl"
              />
            </motion.div>

            {/* ── Thumb: thin vertical bar ── */}
            <motion.div
              style={{
                position: "absolute",
                top: "50%",
                translateY: "-50%",
                left: -(THUMB_SIZE / 2) - 8,
                x: displayX,
                width: 4,
                height: thumbHeight,
                borderRadius: 12,
                scaleX: thumbScaleX,
                scaleY: thumbScaleY,
                transformOrigin: "center center",
                pointerEvents: "none",
                opacity: thumbOpacity,
              }}
              className="bg-neutral-600 dark:bg-neutral-200"
            />
          </div>
        </motion.div>

      </div>
    </>
  );
}
