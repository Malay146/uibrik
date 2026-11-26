"use client";

// An episode player where the waveform is split into chapters. The played
// part fills in behind the playhead, the current chapter's title sits under it
// and the transcript line being spoken fades in word by word. Hovering the
// waveform previews the time and chapter under the pointer; clicking seeks.
// The chapter list below jumps too, and the playing chapter fills as it goes.
// Playback is simulated unless a `src` is passed, in which case an <audio>
// element drives everything.

import { IconBookmark, IconBookmarkFilled, IconChevronDown, IconPlayerPauseFilled, IconPlayerPlayFilled, IconRewindBackward15, IconRewindForward15 } from "@tabler/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export type PodcastChapter = { title: string; start: number };
export type TranscriptLine = { time: number; speaker?: string; text: string };

export type PodcastChaptersProps = {
  title?: string;
  show?: string;
  /** Episode length in seconds. Read from the audio when `src` is set. */
  duration?: number;
  chapters?: PodcastChapter[];
  transcript?: TranscriptLine[];
  /** Audio file. Without it, playback is simulated. */
  src?: string;
  /** Start playing on mount (simulated playback only; browsers block audio autoplay). */
  autoPlay?: boolean;
  /** Where playback starts, in seconds. */
  defaultTime?: number;
  onTimeChange?: (seconds: number) => void;
  /** Saved moments in seconds, controlled. Shown as pins on the waveform. */
  bookmarks?: number[];
  defaultBookmarks?: number[];
  onBookmarksChange?: (seconds: number[]) => void;
  /** Open the full transcript on mount. */
  defaultTranscriptOpen?: boolean;
  /** Playback speeds the speed button cycles through. */
  speeds?: number[];
  color?: string;
  /** The two colours of the trail that leads the transcript text in, front first. */
  trailColors?: string[];
  /** Number of waveform bars. */
  bars?: number;
  /** Width of the card in px; never wider than its container. */
  width?: number;
  className?: string;
};

const clock = (s: number) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
};

// Deterministic bar heights: a few layered waves plus a little hash noise, so
// server and client draw the same waveform.
function waveform(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const noise = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    const v = 0.5 + 0.22 * Math.sin(i * 0.31) + 0.14 * Math.sin(i * 0.77 + 1.3) + 0.3 * (noise - 0.5);
    return Math.min(1, Math.max(0.14, v));
  });
}

export function PodcastChapters({
  title = "Designing calm software",
  show = "Field Notes · Ep. 142",
  duration: durationProp = 2910,
  chapters = DEFAULT_CHAPTERS,
  transcript = DEFAULT_TRANSCRIPT,
  src,
  autoPlay = true,
  defaultTime = 742,
  onTimeChange,
  speeds = DEFAULT_SPEEDS,
  bookmarks: bookmarksProp,
  defaultBookmarks = DEFAULT_BOOKMARKS,
  onBookmarksChange,
  defaultTranscriptOpen = false,
  color = "#e5484d",
  trailColors = DEFAULT_TRAIL,
  bars = 96,
  width = 460,
  className,
}: PodcastChaptersProps) {
  const id = useId();
  const reduce = useReducedMotion();
  const audio = useRef<HTMLAudioElement>(null);
  const [audioDuration, setDuration] = useState<number | null>(null);
  const duration = (src && audioDuration) || durationProp;
  const [playing, setPlaying] = useState(autoPlay && !src);
  const [speedIdx, setSpeedIdx] = useState(0);
  const speed = speeds[speedIdx] ?? 1;
  const [hover, setHover] = useState<number | null>(null);
  // Hovering a chapter in the list lights its stretch of the waveform.
  const [listHover, setListHover] = useState<number | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(defaultTranscriptOpen);
  const [innerMarks, setInnerMarks] = useState<number[]>(defaultBookmarks);
  const marks = bookmarksProp ?? innerMarks;
  const setMarks = (m: number[]) => {
    if (bookmarksProp === undefined) setInnerMarks(m);
    onBookmarksChange?.(m);
  };
  const transcriptList = useRef<HTMLOListElement>(null);
  // Dragging the playhead: the clock holds still and follows the pointer.
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);

  // Time lives in a ref and is painted straight to the DOM every frame; React
  // only hears about it once a second and when the line or chapter changes.
  const time = useRef(defaultTime);
  const [shown, setShown] = useState(defaultTime);
  const played = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const chapterFill = useRef<HTMLSpanElement>(null);

  const sorted = useMemo(() => [...chapters].sort((a, b) => a.start - b.start), [chapters]);
  const ends = sorted.map((_, i) => sorted[i + 1]?.start ?? duration);
  const chapterAt = useCallback((s: number) => Math.max(0, lastIndex(sorted, (c) => c.start <= s)), [sorted]);

  const current = chapterAt(shown);
  // The spoken line changes mid-second, so paint() tracks it rather than `shown`.
  const [line, setLine] = useState(() => lastIndex(transcript, (l) => l.time <= defaultTime));
  const lineRef = useRef(line);
  // The line box holds the outgoing line (still fading) and the incoming one,
  // so the current line is found by its index, never through a shared ref:
  // the old line's unmount would clear that ref and freeze the new line.
  const lineHost = useRef<HTMLDivElement>(null);

  const paint = useCallback(() => {
    const s = time.current;
    const p = `${(s / duration) * 100}%`;
    if (played.current) played.current.style.clipPath = `inset(0 calc(100% - ${p}) 0 0)`;
    if (head.current) head.current.style.left = p;
    if (label.current) label.current.textContent = clock(s);
    const l = lastIndex(transcript, (x) => x.time <= s);
    if (l !== lineRef.current) {
      lineRef.current = l;
      setLine(l);
    }
    // One variable drives every word of the voiceprint line; CSS does the rest.
    const lineNode = l >= 0 ? lineHost.current?.querySelector<HTMLElement>(`[data-line="${l}"]`) : null;
    lineNode?.style.setProperty("--t", String(reduce ? 999 : s - transcript[l].time));
    const c = chapterAt(s);
    if (chapterFill.current) {
      const start = sorted[c]?.start ?? 0;
      const end = sorted[c + 1]?.start ?? duration;
      chapterFill.current.style.transform = `scaleX(${(s - start) / Math.max(1, end - start)})`;
    }
  }, [duration, chapterAt, sorted, transcript, reduce]);

  // After every render, put the imperative styles back on any element React just
  // made. The loop reads paint and onTimeChange through refs, so inline props
  // (a new transcript array or callback each render) never restart it.
  const paintRef = useRef(paint);
  const onTimeRef = useRef(onTimeChange);
  useLayoutEffect(() => {
    paintRef.current = paint;
    onTimeRef.current = onTimeChange;
    paint();
  });
  const [initial] = useState(() => `${(defaultTime / durationProp) * 100}%`);

  // While dragging, move the clock and paint without touching the audio; the
  // release does a real seek.
  const scrubTo = (s: number) => {
    time.current = Math.min(duration, Math.max(0, s));
    paint();
    if (Math.floor(time.current) !== Math.floor(shown)) setShown(time.current);
  };

  const seek = useCallback(
    (s: number) => {
      s = Math.min(duration, Math.max(0, s));
      time.current = s;
      if (audio.current) audio.current.currentTime = s;
      setShown(s);
      onTimeChange?.(s);
      paint();
    },
    [duration, onTimeChange, paint],
  );

  // One loop for both modes: read the audio's clock or advance our own.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let lastShown = Math.floor(time.current);
    const tick = (now: number) => {
      // Capped so a frame after a hidden tab or a long task never skips ahead.
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      if (audio.current && src) time.current = audio.current.currentTime;
      else if (!draggingRef.current) time.current = Math.min(duration, time.current + dt * speed);
      paintRef.current();
      const whole = Math.floor(time.current);
      if (whole !== lastShown) {
        lastShown = whole;
        setShown(time.current);
        onTimeRef.current?.(time.current);
      }
      if (time.current >= duration) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, duration, src]);

  useEffect(() => {
    const a = audio.current;
    if (!a || !src) return;
    a.playbackRate = speed;
    if (playing) a.play().catch(() => setPlaying(false));
    else a.pause();
  }, [playing, speed, src]);

  const heights = useMemo(() => waveform(bars), [bars]);

  // Word timings for the current line: the line's time is shared out by word length.
  const words = useMemo(() => {
    const l = transcript[line];
    if (!l) return [];
    const list = l.text.split(" ");
    const next = transcript[line + 1]?.time ?? duration;
    const span = Math.min(next - l.time, list.length * 0.48 + 0.8) * 0.92;
    const weights = list.map((w) => w.length + 2);
    const total = weights.reduce((a, b) => a + b, 0);
    let at = 0.12;
    return list.map((w, i) => {
      const d = (weights[i] / total) * span;
      const start = at;
      at += d;
      return { w, s: start, d: Math.max(0.3, d * 2.2) };
    });
  }, [transcript, line, duration]);
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * duration;
  };

  // Bars grouped by chapter, with a gap where each chapter starts. Built once
  // per tone so the per-second re-render never touches them.
  const layers = useMemo(() => {
    const make = (tone: string): ReactNode => (
      <div className="absolute inset-0 flex items-center gap-[2px]">
        {heights.map((h, i) => {
          const startsChapter = i > 0 && chapterAt((i / bars) * duration) !== chapterAt(((i - 1) / bars) * duration);
          return <span key={i} className={cn("flex-1 rounded-full", startsChapter && "ml-[5px]")} style={{ height: `${Math.round(h * 1000) / 10}%`, backgroundColor: tone }} />;
        })}
      </div>
    );
    return {
      base: make("color-mix(in oklab, var(--foreground) 14%, transparent)"),
      lit: make("color-mix(in oklab, var(--foreground) 30%, transparent)"),
      played: make("var(--pc-color)"),
    };
  }, [heights, bars, duration, chapterAt]);

  const hoverChapter = hover !== null ? chapterAt(hover) : listHover;
  // A bookmark within 3 s of now counts as "here", so the button can remove it.
  const markHere = marks.find((m) => Math.abs(m - shown) < 3);
  const toggleMark = () => setMarks(markHere !== undefined ? marks.filter((m) => m !== markHere) : [...marks, Math.round(time.current)].sort((a, b) => a - b));

  // Keep the open transcript's current line in view, scrolling only the list.
  useEffect(() => {
    const list = transcriptList.current;
    const el = list?.querySelector<HTMLElement>("[aria-current]");
    if (!list || !el) return;
    const top = el.offsetTop - list.clientHeight / 2 + el.clientHeight / 2;
    list.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
  }, [line, transcriptOpen, reduce]);
  const speakers = useMemo(() => [...new Set(transcript.map((l) => l.speaker).filter(Boolean))], [transcript]);

  return (
    <div className={cn("flex w-full justify-center", className)} style={{ maxWidth: width }}>
      {src && <audio ref={audio} src={src} preload="metadata" onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || null)} onEnded={() => setPlaying(false)} />}
      <div
        className="@container w-full rounded-[24px] bg-(--pc-tint) p-1.5 text-sm text-foreground [--pc-panel:#ffffff] [--pc-text:#0a0a0a] dark:[--pc-text:#fafafa] [--pc-tint:#f0f0f0] [--pc-well:#f4f4f4] dark:[--pc-panel:#0c0c0c] dark:[--pc-tint:#161616] dark:[--pc-well:#1c1c1c]"
        style={{ "--pc-color": color, "--pc-trail-a": trailColors[0] ?? color, "--pc-trail-b": trailColors[1] ?? trailColors[0] ?? color } as CSSProperties}
      >
        <div className="rounded-[18px] bg-(--pc-panel) p-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (time.current >= duration) seek(0);
                setPlaying((p) => !p);
              }}
              aria-label={playing ? "Pause" : "Play"}
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-foreground text-background outline-none transition-transform duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-neutral-400/50"
            >
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span key={playing ? "pause" : "play"} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.15, ease: EASE_OUT }}>
                  {playing ? <IconPlayerPauseFilled size={18} /> : <IconPlayerPlayFilled size={18} />}
                </motion.span>
              </AnimatePresence>
            </button>
            <div className="min-w-0 flex-1">
              <h3 id={`${id}-title`} className="truncate font-medium">
                {title}
              </h3>
              <p className="truncate text-xs text-muted-foreground">
                {show}
                {speakers.length > 0 && ` · ${speakers.join(", ")}`}
              </p>
            </div>
          </div>

          {/* Waveform */}
          <div className="mt-9">
            <div
              className={cn("group/wave relative h-12 touch-none select-none", dragging ? "cursor-grabbing" : "cursor-pointer")}
              role="slider"
              tabIndex={0}
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(shown)}
              aria-valuetext={`${clock(shown)}, ${sorted[current]?.title ?? ""}`}
              onPointerMove={(e) => {
                const at = fromPointer(e);
                setHover(at);
                if (draggingRef.current) scrubTo(at);
              }}
              onPointerLeave={() => !draggingRef.current && setHover(null)}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                draggingRef.current = true;
                setDragging(true);
                scrubTo(fromPointer(e));
              }}
              onPointerUp={(e) => {
                if (!draggingRef.current) return;
                draggingRef.current = false;
                setDragging(false);
                seek(fromPointer(e));
                if (e.pointerType !== "mouse") setHover(null);
              }}
              onLostPointerCapture={() => {
                if (!draggingRef.current) return;
                draggingRef.current = false;
                setDragging(false);
              }}
              onPointerCancel={() => {
                draggingRef.current = false;
                setDragging(false);
                setHover(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") seek(time.current + 5);
                else if (e.key === "ArrowLeft") seek(time.current - 5);
                else if (e.key === " ") {
                  e.preventDefault();
                  setPlaying((p) => !p);
                } else return;
                e.preventDefault();
              }}
            >
              {layers.base}
              {/* Hovered chapter lights up a little. */}
              {hoverChapter !== null && (
                <div
                  className="absolute inset-0"
                  style={{ clipPath: `inset(0 ${100 - (ends[hoverChapter] / duration) * 100}% 0 ${(sorted[hoverChapter].start / duration) * 100}%)` }}
                  aria-hidden
                >
                  {layers.lit}
                </div>
              )}
              <div ref={played} className="absolute inset-0" style={{ clipPath: `inset(0 calc(100% - ${initial}) 0 0)` }} aria-hidden>
                {layers.played}
              </div>
              <span ref={head} className="pointer-events-none absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground" style={{ left: initial }} aria-hidden>
                {/* A grip on top of the playhead: shows on hover, grows while dragging. */}
                <span
                  className={cn(
                    "absolute -top-1 left-1/2 size-3 -translate-x-1/2 rounded-full bg-foreground ring-2 ring-(--pc-panel) transition-transform duration-150 ease-out",
                    dragging ? "scale-125" : "scale-0 group-hover/wave:scale-100 group-focus-visible/wave:scale-100",
                  )}
                />
              </span>
              {/* Bookmarks */}
              <AnimatePresence>
                {marks.map((m) => (
                  <motion.button
                    key={m}
                    type="button"
                    initial={{ opacity: 0, y: -4, scale: 0.6 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.6 }}
                    transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      seek(m);
                    }}
                    aria-label={`Bookmark at ${clock(m)}`}
                    className="absolute -top-3.5 z-10 grid size-5 -translate-x-1/2 cursor-pointer place-items-center rounded-full text-(--pc-color) outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/50"
                    style={{ left: `${(m / duration) * 100}%` }}
                  >
                    <span className="size-1.5 rounded-full bg-current ring-2 ring-(--pc-panel)" />
                  </motion.button>
                ))}
              </AnimatePresence>
              {hover !== null && (
                <span className="pointer-events-none absolute -top-8 whitespace-nowrap rounded-full bg-foreground px-2 py-0.5 text-[11px] tabular-nums text-background" style={{ left: `${(hover / duration) * 100}%`, transform: `translateX(${hover / duration > 0.75 ? "-100%" : hover / duration < 0.25 ? "0" : "-50%"})` }} aria-hidden>
                  {clock(hover)} · {sorted[chapterAt(hover)]?.title}
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
              <span ref={label} className="w-12">{clock(defaultTime)}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleMark}
                  aria-pressed={markHere !== undefined}
                  aria-label={markHere !== undefined ? "Remove bookmark" : "Bookmark this moment"}
                  className={cn("grid size-7 cursor-pointer place-items-center rounded-full outline-none transition-colors hover:bg-(--pc-well) focus-visible:ring-2 focus-visible:ring-neutral-400/50", markHere !== undefined ? "text-(--pc-color)" : "hover:text-foreground")}
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    <motion.span key={markHere !== undefined ? "on" : "off"} initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ type: "spring", duration: 0.3, bounce: 0.3 }}>
                      {markHere !== undefined ? <IconBookmarkFilled size={14} /> : <IconBookmark size={14} />}
                    </motion.span>
                  </AnimatePresence>
                </button>
                <button type="button" onClick={() => seek(time.current - 15)} aria-label="Back 15 seconds" className="grid size-7 cursor-pointer place-items-center rounded-full outline-none transition-colors hover:bg-(--pc-well) hover:text-foreground focus-visible:ring-2 focus-visible:ring-neutral-400/50">
                  <IconRewindBackward15 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setSpeedIdx((i) => (i + 1) % speeds.length)}
                  aria-label={`Speed ${speed}×`}
                  className="h-7 min-w-10 cursor-pointer rounded-full px-2 font-medium outline-none transition-colors hover:bg-(--pc-well) hover:text-foreground focus-visible:ring-2 focus-visible:ring-neutral-400/50"
                >
                  {speed}×
                </button>
                <button type="button" onClick={() => seek(time.current + 15)} aria-label="Forward 15 seconds" className="grid size-7 cursor-pointer place-items-center rounded-full outline-none transition-colors hover:bg-(--pc-well) hover:text-foreground focus-visible:ring-2 focus-visible:ring-neutral-400/50">
                  <IconRewindForward15 size={15} />
                </button>
              </div>
              <span className="w-12 text-right">−{clock(duration - shown)}</span>
            </div>
          </div>

          {/* What's being said: the current line, or the whole transcript. */}
          <div className="mt-4 overflow-hidden rounded-[12px] bg-(--pc-well)">
            <button
              type="button"
              onClick={() => setTranscriptOpen((o) => !o)}
              aria-expanded={transcriptOpen}
              className="flex h-8 w-full cursor-pointer items-center justify-between gap-2 px-3.5 pt-1 text-[11px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-400/50"
            >
              <span className="truncate">
                {line >= 0 && transcript[line].speaker && <span className="text-foreground/80">{transcript[line].speaker} · </span>}
                {line >= 0 ? clock(transcript[line].time) : "Transcript"}
              </span>
              <span className="flex items-center gap-1">
                {transcriptOpen ? "Less" : "Transcript"}
                <IconChevronDown size={13} className={cn("transition-transform duration-200", transcriptOpen && "rotate-180")} />
              </span>
            </button>
            <motion.div initial={false} animate={{ height: transcriptOpen ? 208 : 48 }} transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.4, bounce: 0 }} className="relative overflow-hidden" ref={lineHost}>
              <AnimatePresence initial={false} mode="popLayout">
                {transcriptOpen ? (
                  <motion.ol
                    key="all"
                    ref={transcriptList}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="absolute inset-0 flex flex-col gap-px overflow-y-auto overscroll-contain px-1.5 pb-1.5"
                  >
                    {transcript.map((l, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => seek(l.time)}
                          aria-current={i === line ? "true" : undefined}
                          className={cn(
                            "grid w-full cursor-pointer grid-cols-[36px_1fr] gap-2 rounded-[8px] px-2 py-1.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-neutral-400/50",
                            i === line ? "bg-(--pc-panel)" : "hover:bg-(--pc-panel)/60",
                          )}
                        >
                          <span className="pt-px text-[11px] tabular-nums text-muted-foreground">{clock(l.time)}</span>
                          <span className={cn("text-[13px] leading-snug", i === line ? "text-foreground" : i > line ? "text-muted-foreground" : "text-foreground/70")}>
                            {l.speaker && <span className="text-muted-foreground">{l.speaker}: </span>}
                            {l.text}
                          </span>
                        </button>
                      </li>
                    ))}
                  </motion.ol>
                ) : (
                  line >= 0 && (
                    <motion.p
                      key={line}
                      data-line={line}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6, filter: "blur(2px)" }}
                      transition={{ duration: 0.22, ease: EASE_OUT }}
                      className="line-clamp-2 px-3.5 text-[13px] leading-[1.45]"
                      style={{ "--t": 0 } as CSSProperties}
                      aria-live="polite"
                      aria-label={transcript[line].text}
                    >
                      {words.map((x, i) => (
                        <Fragment key={i}>
                          <TrailWord word={x.w} start={x.s} length={x.d} />{" "}
                        </Fragment>
                      ))}
                    </motion.p>
                  )
                )}
              </AnimatePresence>
            </motion.div>
          </div>

          {/* Chapters */}
          <ol className="mt-3 flex flex-col gap-px" aria-label="Chapters">
            {sorted.map((c, i) => {
              const on = i === current;
              const done = i < current;
              return (
                <li key={`${c.start}-${c.title}`}>
                  <button
                    type="button"
                    onClick={() => {
                      seek(c.start);
                      setPlaying(true);
                    }}
                    onPointerEnter={(e) => e.pointerType === "mouse" && setListHover(i)}
                    onPointerLeave={() => setListHover(null)}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "relative grid h-9 w-full cursor-pointer grid-cols-[20px_1fr_auto] items-center gap-2 overflow-hidden rounded-[10px] px-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-neutral-400/50",
                      on ? "bg-(--pc-well)" : "hover:bg-(--pc-well)/60",
                    )}
                  >
                    {on && <span ref={chapterFill} className="absolute inset-y-0 left-0 w-full origin-left bg-(--pc-color)/[0.08]" aria-hidden />}
                    <span className={cn("relative text-[11px] tabular-nums", on ? "text-(--pc-color)" : "text-muted-foreground")}>{String(i + 1).padStart(2, "0")}</span>
                    <span className={cn("relative truncate text-[13px]", done && "text-muted-foreground")}>{c.title}</span>
                    <span className="relative flex items-center gap-1.5 text-[11px] tabular-nums text-muted-foreground">
                      {marks.some((m) => m >= c.start && m < ends[i]) && <IconBookmarkFilled size={11} className="text-(--pc-color)" aria-label="Has bookmarks" />}
                      {clock(c.start)}
                      <span className="hidden @[400px]:inline"> · {Math.round((ends[i] - c.start) / 60)} min</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

/**
 * Gradient-trail text. Each word is drawn with its letters clipped to a
 * gradient that slides across it as it is spoken: settled text colour behind,
 * a two-colour trail at the edge, nothing ahead. Words overlap in time, so the
 * trail reads as one stroke running along the line. All CSS on one variable,
 * --t (seconds into the line), which the player writes once a frame.
 */
function TrailWord({ word, start, length }: { word: string; start: number; length: number }) {
  // Edge position: runs from -40% to 170% of the word so the trail fully enters and leaves.
  const e = "calc(var(--p) * 210% - 40%)";
  return (
    <span
      className="inline-block whitespace-nowrap bg-clip-text text-transparent [-webkit-background-clip:text]"
      style={
        {
          "--s": start,
          "--d": length,
          "--p": "clamp(0, calc((var(--t) - var(--s)) / var(--d)), 1)",
          backgroundImage: `linear-gradient(90deg, var(--pc-text) calc(${e} - 62%), var(--pc-trail-b) calc(${e} - 34%), var(--pc-trail-a) calc(${e} - 10%), transparent ${e})`,
        } as CSSProperties
      }
    >
      {word}
    </span>
  );
}

function lastIndex<T>(list: T[], test: (item: T) => boolean) {
  for (let i = list.length - 1; i >= 0; i--) if (test(list[i])) return i;
  return -1;
}

// ─── Sample ───────────────────────────────────────────────────────────────────

const DEFAULT_SPEEDS = [1, 1.5, 2];
const DEFAULT_TRAIL = ["#ff4d6d", "#ffb547"];
const DEFAULT_BOOKMARKS = [412, 1588];

export const DEFAULT_CHAPTERS: PodcastChapter[] = [
  { title: "Cold open", start: 0 },
  { title: "Why most apps feel loud", start: 184 },
  { title: "Motion that explains", start: 702 },
  { title: "Density without clutter", start: 1356 },
  { title: "Listener questions", start: 2142 },
  { title: "What we're using this week", start: 2640 },
];

export const DEFAULT_TRANSCRIPT: TranscriptLine[] = [
  { time: 0, speaker: "Ana", text: "Welcome back. Today is all about software that gets out of the way." },
  { time: 702, speaker: "Ana", text: "So let's talk about motion. When does an animation actually help?" },
  { time: 709, speaker: "Theo", text: "When it tells you where something came from, or where it went." },
  { time: 717, speaker: "Theo", text: "A menu that grows out of its button needs no explanation." },
  { time: 725, speaker: "Ana", text: "And the ones that don't help? I can think of a few." },
  { time: 731, speaker: "Theo", text: "Anything that loops forever, or makes you wait to read." },
  { time: 739, speaker: "Theo", text: "If it takes longer than a blink, you'll feel it every single day." },
  { time: 747, speaker: "Ana", text: "Which is why most of ours sit somewhere around two hundred milliseconds." },
  { time: 755, speaker: "Theo", text: "Fast enough to disappear, slow enough that your eye can follow it." },
  { time: 763, speaker: "Ana", text: "Let's look at a real example from this week's redesign." },
  { time: 771, speaker: "Theo", text: "The sidebar used to slide. Now it just fades, and nobody misses the slide." },
  { time: 780, speaker: "Ana", text: "Removing motion is a design decision too. Maybe the best one." },
  { time: 789, speaker: "Theo", text: "Right. Start with nothing, then add only what explains." },
  { time: 1356, speaker: "Ana", text: "Okay, density. People think minimal means empty." },
  { time: 2142, speaker: "Ana", text: "Let's get to your questions. First one is about dark mode." },
  { time: 2640, speaker: "Theo", text: "Quick round: what's on your desk this week?" },
];
