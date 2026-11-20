"use client";

import { animate } from "motion/react";
import { useEffect, useId, useRef } from "react";

// `play` counts presses of a card's Change button. 0 means the card has not
// been pressed yet, so every effect renders its resting state without
// animating on page load.
export type EffectProps = { play: number };

// Size comes from --text-effect-size (default 1.25rem, i.e. text-xl), so a
// preview can enlarge every effect without changing the installed default.
const SIZE = "text-[length:var(--text-effect-size,1.25rem)] leading-[1.4]";

const TEXT = `${SIZE} text-zinc-700 font-medium dark:text-zinc-200`;

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// 22 — The line starts wobbling like a reflection in water; the ripple calms
// until the letters are sharp. Turbulence feeds a displacement map whose
// strength runs down to zero while its frequency drifts, so the ripples move.
export function RippleToStill({
  play,
  text = "Still water",
  duration = 1.4,
  strength = 16,
}: EffectProps & {
  text?: string;
  /** Seconds for the ripple to calm. */
  duration?: number;
  /** Starting displacement in px. */
  strength?: number;
}) {
  const id = `liquid-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const noiseRef = useRef<SVGFETurbulenceElement>(null);
  const mapRef = useRef<SVGFEDisplacementMapElement>(null);

  useEffect(() => {
    if (!play) return;
    const controls = animate(1, 0, {
      duration,
      ease: EASE_OUT,
      onUpdate: (t) => {
        mapRef.current?.setAttribute("scale", String(strength * t));
        noiseRef.current?.setAttribute("baseFrequency", `${0.012 + 0.012 * (1 - t)} ${0.06 + 0.04 * t}`);
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play]);

  return (
    <>
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <filter id={id} x="-20%" y="-60%" width="140%" height="220%">
          <feTurbulence ref={noiseRef} type="turbulence" baseFrequency="0.012 0.06" numOctaves="2" seed="4" />
          <feDisplacementMap ref={mapRef} in="SourceGraphic" scale="0" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
      <p className={TEXT} style={{ filter: `url(#${id})` }}>
        {text}
      </p>
    </>
  );
}
