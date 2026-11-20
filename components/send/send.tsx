"use client";

import { IconFileTextFilled, IconSendFilled } from "@tabler/icons-react";
import { animate, useMotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";

// Icons: Tabler Icons (MIT).
const FileIcon = ({ className }: { className?: string }) => (
  <IconFileTextFilled aria-hidden="true" size={18} className={className} />
);

const PlaneIcon = ({ className }: { className?: string }) => (
  <IconSendFilled aria-hidden="true" size={18} className={className} />
);

type Bezier = [number, number, number, number];

// The icon is already drawn nosing up-right, so the arc leaves at its resting
// angle and only rotates as the path flattens out toward the right edge.
const EXIT_ANGLE = 45;

// Height the plane exits at, as a fraction of the card. Lower value = higher
// exit = taller climb over the same run, which bows the arc further.
const EXIT_HEIGHT = 0.45;

// Carries the icon fully past the right edge before it resets.
const EXIT_MARGIN = 48;

// Clearance between the bar's leading edge and the plane's tail. Positioning
// the plane ahead of the bar is also what carries it out through the card's
// right edge at 100%, while the bar stops flush with it.
const PLANE_GAP = 0;

// How far left of the track the plane parks to sit fully outside the card. The
// 18px icon is rotated 45deg, so it renders about 26px wide.
const PLANE_CLEAR = 26;

// Anticipation: the plane rocks back along its heading before launching.
const WIND_UP_DISTANCE = 12;
const WIND_UP_DURATION = 0.2;


// Bezier handles for each axis of the arc. The wider the gap between the two
// curves, the deeper the path bows.
const RUN_EASE: Bezier = [0.85, 0, 0.95, 0.06];
const CLIMB_EASE: Bezier = [0.05, 0.9, 0.15, 1];

// The panel warms from neutral to green as the upload fills.
// Painted as a layer over the panel's own background, so the base colour stays
// a themeable CSS class instead of a hardcoded end of a colour interpolation.

// Upload beats, in seconds.
const PANEL_FADE = 0.18;
const CONTENT_FADE = 0.28;
const HOLD_AT_FULL = 0.4;
const SENT_HOLD = 0.8;
// How the finished panel leaves. "split" tears it along its midline and sends
// the halves off the top and bottom; "fade" dissolves the whole panel in place.
export type ExitStyle = "split" | "fade";
export const EXIT_STYLES: ExitStyle[] = ["split", "fade"];

const EXIT_FADE = 0.3;

// The split is slow and back-loaded, so it sits still for a beat before it
// commits.
const SPLIT_DURATION = 0.65;
const SPLIT_EASE: Bezier = [0.7, 0, 0.84, 0];

// Each half carries a full copy of the panel, clipped to its share of it, so
// the two together read as one surface until they part.
const PANEL_HALVES = [
  { key: "top", clip: "inset(0 0 50% 0)", direction: -1 },
  { key: "bottom", clip: "inset(50% 0 0 0)", direction: 1 },
] as const;

// Fake upload: a real one stalls rather than filling at a constant rate, so the
// bar surges, drags through the middle, and then closes out.
const PROGRESS_KEYFRAMES = [0, 34, 58, 66, 71, 92, 100];
const PROGRESS_TIMES = [0, 0.12, 0.34, 0.46, 0.62, 0.85, 1];

const wait = (seconds: number) =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));

export type SendFileProps = {
  fileName?: string;
  fileSize?: string;
  /** Button text. */
  label?: string;
  /** How the finished panel leaves. */
  exitStyle?: ExitStyle;
  /** Seconds the (simulated) upload takes to fill. */
  uploadDuration?: number;
  /** Seconds the plane takes to fly off the card. */
  flightDuration?: number;
  /** The panel warms to this colour as the upload fills. */
  sentColor?: string;
};

export function SendFile({
  fileName = "Document.file",
  fileSize = "478.5kb",
  label = "Send",
  exitStyle = "split",
  uploadDuration: UPLOAD_DURATION = 2.6,
  flightDuration: FLIGHT_DURATION = 0.375,
  sentColor: SENT_COLOR = "#16A34A",
}: SendFileProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLSpanElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [busy, setBusy] = useState(false);

  // Read through a ref so switching mid-run still applies to that run's exit.
  const exitStyleRef = useRef(exitStyle);
  useEffect(() => {
    exitStyleRef.current = exitStyle;
  }, [exitStyle]);

  // Progress drives the DOM directly — a per-frame setState would re-render the
  // whole page for a number that three nodes care about.
  const pct = useMotionValue(0);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    // Queried once rather than per frame. Both halves hold the same nodes, and
    // both must be painted or the seam shows.
    const greens = overlay.querySelectorAll<HTMLElement>("[data-green]");
    const counts = overlay.querySelectorAll<HTMLElement>("[data-count]");
    const bars = overlay.querySelectorAll<HTMLElement>("[data-bar]");
    const planes = overlay.querySelectorAll<HTMLElement>("[data-plane]");

    const paint = (value: number) => {
      // The plane flies the full span: fully clear of the left edge at 0%, a
      // gap past the right edge at 100%. The percentage covers the track's own
      // width; the pixel term carries it the rest of the way out at both ends.
      const offset = -PLANE_CLEAR + (value / 100) * (PLANE_CLEAR + PLANE_GAP);

      // The bar is the plane's trail, so it is measured back from the plane
      // rather than off `value`. That holds the gap constant and stops the bar
      // existing before the plane has entered, while still landing flush with
      // the card's right edge at 100%.
      const width = `max(0px, calc(${value}% + ${offset - PLANE_GAP}px))`;
      const left = `calc(${value}% + ${offset}px)`;
      const label = `${Math.round(value)}%`;
      // The green washes in over the panel's base as the upload fills, so the
      // colour carries the progress alongside the bar.
      const green = String(value / 100);

      greens.forEach((el) => (el.style.opacity = green));
      counts.forEach((el) => (el.textContent = label));
      bars.forEach((el) => (el.style.width = width));
      planes.forEach((el) => (el.style.left = left));
    };

    paint(pct.get());
    return pct.on("change", paint);
  }, [pct]);

  const send = async () => {
    const card = cardRef.current;
    const plane = planeRef.current;
    const overlay = overlayRef.current;
    if (busy || !card || !plane || !overlay) return;

    const contents = overlay.querySelectorAll<HTMLElement>("[data-content]");
    const counts = overlay.querySelectorAll<HTMLElement>("[data-count]");
    const top = overlay.querySelector<HTMLElement>('[data-panel="top"]');
    const bottom = overlay.querySelector<HTMLElement>('[data-panel="bottom"]');
    if (!top || !bottom) return;

    setBusy(true);

    // Measured at rest, before any transform, so the deltas stay right on a
    // second send.
    const cardBox = card.getBoundingClientRect();
    const planeBox = plane.getBoundingClientRect();

    const dx =
      cardBox.right -
      (planeBox.left + planeBox.width / 2) +
      EXIT_MARGIN;
    const dy =
      cardBox.top +
      cardBox.height * EXIT_HEIGHT -
      (planeBox.top + planeBox.height / 2);

    // Anticipation: rock back along the heading before launching.
    await animate(
      plane,
      { x: -WIND_UP_DISTANCE, y: WIND_UP_DISTANCE },
      { duration: WIND_UP_DURATION, ease: "easeOut" },
    );

    // The arc comes from easing the two axes against each other: the rise is
    // nearly finished while the run has barely started, so the path climbs
    // steeply, then flattens as it accelerates off the right edge. Each axis
    // repeats the duration: a per-value transition replaces the parent one
    // outright rather than merging with it, so a bare `ease` would silently
    // fall back to the library default.
    await animate(
      plane,
      { x: dx, y: dy, rotate: EXIT_ANGLE },
      {
        x: { duration: FLIGHT_DURATION, ease: RUN_EASE },
        y: { duration: FLIGHT_DURATION, ease: CLIMB_EASE },
        rotate: { duration: FLIGHT_DURATION, ease: CLIMB_EASE },
      },
    );

    // Park the launched plane back on the button while the panel hides it.
    await animate(
      plane,
      { x: 0, y: 0, rotate: 0, opacity: 0 },
      { duration: 0 },
    );

    // The panel colour washes in on its own — the readout and bar are still at
    // zero opacity underneath it.
    await animate(
      overlay,
      { opacity: 1 },
      { duration: PANEL_FADE, ease: "easeOut" },
    );

    // Only once the ground is solid does the content arrive on top of it.
    await animate(
      contents,
      { opacity: 1, y: 0 },
      { duration: CONTENT_FADE, ease: "easeOut" },
    );

    await animate(pct, PROGRESS_KEYFRAMES, {
      duration: UPLOAD_DURATION,
      times: PROGRESS_TIMES,
      ease: "easeInOut",
    });

    // Let 100% actually read before the confirmation replaces it.
    await wait(HOLD_AT_FULL);

    // Swap the readout for a confirmation, so the end state is stated rather
    // than inferred from the bar running out.
    await animate(counts, { opacity: 0 }, { duration: 0.12, ease: "easeOut" });
    counts.forEach((el) => (el.textContent = "Sent!"));
    await animate(counts, { opacity: 1 }, { duration: 0.16, ease: "easeOut" });

    await wait(SENT_HOLD);

    if (exitStyleRef.current === "fade") {
      await animate(
        overlay,
        { opacity: 0 },
        { duration: EXIT_FADE, ease: "easeOut" },
      );
    } else {
      // Tear the panel apart at the midline. Each half only has to travel its
      // own height to clear the card, and the card's overflow clips the rest.
      const travel = cardBox.height;
      const split = { duration: SPLIT_DURATION, ease: SPLIT_EASE };
      await Promise.all([
        animate(top, { y: -travel }, split),
        animate(bottom, { y: travel }, split),
      ]);
    }

    // Re-arm everything out of sight, then fade the plane onto the button.
    await animate(overlay, { opacity: 0 }, { duration: 0 });
    await animate([top, bottom], { y: 0 }, { duration: 0 });
    await animate(contents, { opacity: 0, y: 6 }, { duration: 0 });
    await animate(counts, { opacity: 1 }, { duration: 0 });
    // Resetting the value repaints the readout back to 0%.
    pct.set(0);
    await animate(
      plane,
      { opacity: 1 },
      { duration: 0.2, ease: "easeOut" },
    );

    setBusy(false);
  };

  return (
    // A drop shadow on a wrapper follows the squircle mask (a box-shadow on the
    // card would be clipped by it) and lifts the card off a page of similar tone.
    <div className="[filter:drop-shadow(0_0_0.5px_rgb(0_0_0/0.18))_drop-shadow(0_6px_16px_rgb(0_0_0/0.06))] dark:[filter:drop-shadow(0_0_0.5px_rgb(255_255_255/0.22))]">
      <div
        ref={cardRef}
        className="pl-1 pr-4 py-2.5 squircle-mask squircle-3xl bg-white dark:bg-neutral-900 flex items-center gap-3 relative overflow-hidden"
      >
        <div
          ref={overlayRef}
          style={{ opacity: 0 }}
          aria-hidden={!busy}
          className={`absolute inset-0 z-20 ${busy ? "" : "pointer-events-none"}`}
        >
          {PANEL_HALVES.map(({ key, clip }) => (
            <div
              key={key}
              data-panel={key}
              style={{ clipPath: clip }}
              className="absolute inset-0 flex items-center bg-neutral-900 dark:bg-neutral-800"
            >
              <div
                data-green
                style={{ opacity: 0, backgroundColor: SENT_COLOR }}
                className="absolute inset-0 pointer-events-none"
              />
              {/* Held back so the panel reads as colour first, content second. */}
              <div
                data-content
                style={{ opacity: 0, transform: "translateY(6px)" }}
                className="absolute inset-0 flex items-center"
              >
                <p
                  data-count
                  // Only the top copy is announced; the other is the same text.
                  aria-live={key === "top" ? "polite" : undefined}
                  aria-hidden={key === "top" ? undefined : true}
                  className="text-neutral-50 font-medium tracking-tight text-xl absolute top-8 left-2"
                >
                  0%
                </p>
                <div className="w-full flex items-center relative">
                  <div
                    data-bar
                    style={{ width: 0 }}
                    className="h-0.5 bg-neutral-50 rounded-r-full absolute left-0"
                  />
                  <span
                    data-plane
                    style={{ left: `-${PLANE_CLEAR}px` }}
                    className="absolute z-30 inline-flex"
                  >
                    <PlaneIcon className="text-neutral-50 rotate-45" />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="squircle-2xl flex items-center justify-center">
          <FileIcon className="size-26 text-neutral-900 dark:text-neutral-100" />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col leading-none">
            <h1 className="text-xl font-medium text-neutral-800 dark:text-neutral-100 tracking-[-2%]">
              {fileName}
            </h1>
            <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 tracking-[1%] -mt-0.5">
              {fileSize}
            </p>
          </div>
          <button
            onClick={send}
            disabled={busy}
            className="relative w-fit px-3 py-2 rounded-2xl text-neutral-900 dark:text-neutral-50 active:scale-95 transition-transform duration-100 font-medium tracking-tight flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-default"
          >
            {/* The squircle clip lives on its own layer: a mask on the button itself would
                cut the plane off the moment it leaves the button's box. */}
            <span
              aria-hidden
              className="absolute inset-0 squircle-mask squircle-2xl bg-neutral-100 dark:bg-neutral-800"
            />
            <span className="relative">{label}</span>
            {/* Lifted above the card's contents so it stays on top in flight. */}
            <span ref={planeRef} className="relative z-10 inline-flex">
              <PlaneIcon />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
