"use client";

// A parcel on its way, in one wide card. On the left, a small isometric city:
// blocks of buildings and parks, traffic on the streets, cloud shadows
// drifting over, the route traced along the streets, numbered pins that drop
// in as each stop is reached and a van driving from one to the next. At the
// door the van hands the parcel over, the house lights up and the card turns
// green; on autoplay the run starts over. Play, pause and replay sit on the
// city. On the right: the delivery window, which narrows as stops go by, the
// driver with call and message buttons, the parcel's details and the tracking
// steps, each ticking off as the van arrives. Below about 700px it stacks.
//
// The city is one 2D canvas, painted back to front at device resolution. It
// sleeps off screen and holds still for reduced motion.

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  IconCheck,
  IconMessageCircleFilled,
  IconPhoneFilled,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconRotate,
  IconSend,
  IconStarFilled,
  IconTruckDelivery,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const GREEN = "#30a46c";

export type PackageStop = {
  title: string;
  place: string;
  /** When the parcel reached this stop, or is expected to, "HH:MM" in 24-hour time. */
  time: string;
  /** Scan events at this stop, oldest first. */
  scans?: { time: string; text: string }[];
};

export type PackageDriver = {
  name: string;
  rating?: number;
  vehicle?: string;
  plate?: string;
  /** Photo URL; initials are shown without one. */ avatar?: string;
  /** Number the call button dials, as a tel: link. */ phone?: string;
};

export type PackageParcel = {
  weight?: string;
  items?: number;
  signature?: boolean;
};

export type PackageTrackerProps = {
  stops?: PackageStop[];
  /** Order or tracking number in the header. */
  order?: string;
  carrier?: string;
  /** Where the parcel was left, shown once it arrives. */
  leftAt?: string;
  driver?: PackageDriver;
  parcel?: PackageParcel;
  /** Called when the call button is pressed, before the tel: link opens. */
  onCall?: () => void;
  /** Called with each message sent to the driver from the card. */
  onMessage?: (text: string) => void;
  /** The driver's automatic reply to a message. Return null for none. */
  reply?: (text: string) => string | null;
  /** Quick replies offered above the message field. */
  quickReplies?: string[];
  /** Stop the van is at on mount, as an index. */
  defaultStop?: number;
  /** Drive to the next stops on its own. The play button toggles it. */
  live?: boolean;
  /** Start over from the first stop a few seconds after delivery. */
  loop?: boolean;
  /** Seconds the van takes between two stops. */
  legSeconds?: number;
  onArrive?: (index: number) => void;
  hour24?: boolean;
  /** Colour of the route and the van. */
  color?: string;
  /** Width of the card in px; never wider than its container. */
  width?: number;
  className?: string;
};

// ─── City layout ──────────────────────────────────────────────────────────────
// A 5×5 grid of blocks. Streets run between them; positions on the route are
// street intersections [column, row], 0–5.

const N = 5;
const ST = 0.46; // street width, in block units
const PITCH = 1 + ST;
const street = (k: number) => k * PITCH + ST / 2;
const LEGS: [number, number][][] = [
  [
    [0, 0],
    [0, 2],
    [1, 2],
  ],
  [
    [1, 2],
    [3, 2],
  ],
  [
    [3, 2],
    [3, 4],
  ],
  [
    [3, 4],
    [5, 4],
    [5, 5],
  ],
];
const HOME: [number, number] = [4, 4];
const PARKS = new Set(["1,0", "2,3", "0,4"]);
// Cars that loop along streets the route doesn't use: axis, street, speed, phase, colour.
const TRAFFIC: {
  axis: "x" | "y";
  k: number;
  v: number;
  o: number;
  c: [number, number, number];
}[] = [
  { axis: "x", k: 1, v: 0.55, o: 0.1, c: [229, 72, 77] },
  { axis: "y", k: 2, v: -0.42, o: 0.6, c: [62, 99, 221] },
  { axis: "x", k: 3, v: -0.5, o: 0.35, c: [240, 240, 242] },
  { axis: "y", k: 4, v: 0.48, o: 0.8, c: [245, 166, 35] },
];

const hash = (i: number, j: number) => {
  const x = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

type Pt = { x: number; y: number };
const legPts = (leg: [number, number][]): Pt[] =>
  leg.map(([a, b]) => ({ x: street(a), y: street(b) }));
const legLen = (pts: Pt[]) =>
  pts
    .slice(1)
    .reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
function along(pts: Pt[], t: number): Pt & { dx: number; dy: number } {
  const total = legLen(pts);
  let d = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= l || i === pts.length - 1) {
      const u = l ? Math.min(1, d / l) : 0;
      return {
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * u,
        dx: Math.sign(b.x - a.x),
        dy: Math.sign(b.y - a.y),
      };
    }
    d -= l;
  }
  const z = pts[pts.length - 1];
  return { ...z, dx: 1, dy: 0 };
}

const toMin = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export function PackageTracker({
  stops = DEFAULT_STOPS,
  order = "Order #4821",
  carrier = "Swift Parcel",
  leftAt = "Left at front door",
  // Photo by Victória Kubiaki on Unsplash (unsplash.com/photos/t0Aio60jD4Q).
  driver = {
    name: "Marcus Hale",
    rating: 4.9,
    vehicle: "Electric van",
    plate: "7KTR482",
    avatar: "https://uibrik.com/registry/package-tracker/driver.webp",
    phone: "+15550142",
  },
  parcel = { weight: "1.4 kg", items: 2, signature: false },
  onCall,
  onMessage,
  reply = DEFAULT_REPLY,
  quickReplies = ["Leave it at the door", "I'm home", "Please ring the bell"],
  defaultStop = 0,
  live = true,
  loop = true,
  legSeconds = 3.2,
  onArrive,
  hour24 = false,
  color = "#8e4ec6",
  width = 860,
  className,
}: PackageTrackerProps) {
  const uid = useId();
  const reduce = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const visible = useVisible(root);
  const n = Math.max(2, Math.min(stops.length, LEGS.length + 1));

  const [at, setAt] = useState(() => Math.min(Math.max(0, defaultStop), n - 1)); // last stop reached
  const [open, setOpen] = useState<number | null>(null); // step opened by hand
  const [playing, setPlaying] = useState(live);
  const [seenLive, setSeenLive] = useState(live);
  if (seenLive !== live) {
    setSeenLive(live);
    setPlaying(live);
  }
  const t = useMotionValue(0); // progress along the current leg
  const [legT, setLegT] = useState(0); // throttled copy for text
  const run = useRef<AnimationPlaybackControls | null>(null);
  const arrivedAt = useRef(0);
  const done = at >= n - 1;

  const lastText = useRef(-1);
  // Re-render only when the stop count it feeds changes, not on every frame of the leg.
  useMotionValueEvent(t, "change", (v) => {
    const bucket = Math.ceil((1 - v) * 4);
    if (bucket !== lastText.current) {
      lastText.current = bucket;
      setLegT(v);
    }
  });

  // Drive the current leg; pause off screen or when paused, resume where it left off.
  useEffect(() => {
    if (done) return;
    if (!run.current && playing) {
      t.set(0);
      run.current = animate(t, 1, {
        duration: reduce ? 0.01 : legSeconds,
        ease: [0.45, 0, 0.25, 1],
        delay: reduce ? 0 : 0.9,
        onComplete: () => {
          run.current = null;
          setAt((a) => a + 1);
        },
      });
    }
    if (!run.current) return;
    if (visible && playing) run.current.play();
    else run.current.pause();
  }, [at, playing, done, visible, legSeconds, reduce, t]);
  useEffect(
    () => () => {
      run.current?.stop();
      run.current = null;
    },
    [],
  );

  // On autoplay, start over a little after delivery.
  useEffect(() => {
    if (!done || !playing || !loop || !visible) return;
    const id = window.setTimeout(() => setAt(0), 4200);
    return () => window.clearTimeout(id);
  }, [done, playing, loop, visible]);

  const prevAt = useRef(at);
  useEffect(() => {
    if (prevAt.current === at) return;
    const forward = at > prevAt.current;
    prevAt.current = at;
    t.set(0);
    setOpen(null);
    if (forward) {
      arrivedAt.current = performance.now();
      onArrive?.(at);
    }
  }, [at, onArrive, t]);

  const toggle = () => {
    if (done) {
      run.current?.stop();
      run.current = null;
      setAt(0);
      setPlaying(true);
      return;
    }
    setPlaying((v) => !v);
  };

  const clock = (s: string) => {
    const m = toMin(s);
    const h = Math.floor(m / 60) % 24;
    const mm = String(m % 60).padStart(2, "0");
    return hour24
      ? `${String(h).padStart(2, "0")}:${mm}`
      : `${h % 12 || 12}:${mm} ${h < 12 ? "AM" : "PM"}`;
  };

  // The window narrows as fewer stops remain.
  const last = stops[n - 1];
  const remaining = n - 1 - at;
  const spreadMin = remaining * 25;
  const eta = toMin(last.time);
  const win = (m: number) => clock(`${Math.floor(m / 60)}:${m % 60}`);
  const nextStop = stops[Math.min(at + 1, n - 1)];
  const shownStep = open ?? (done ? n - 1 : at + 1);
  // On the last leg the van is on your street: count the drops before yours.
  const finalLeg = !done && at === n - 2;
  const before = Math.max(0, Math.ceil((1 - legT) * 4) - 1);
  const sub = done
    ? leftAt
    : finalLeg
      ? before
        ? `${before} ${before === 1 ? "stop" : "stops"} before yours`
        : "Pulling up now"
      : `Arriving today · next stop ${nextStop.place}`;
  // Messages with the driver, kept in the card.
  const [chatOpen, setChatOpen] = useState(false);
  const [thread, setThread] = useState<
    { id: number; me: boolean; text: string }[]
  >([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const msgId = useRef(0);
  const replyTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(replyTimer.current), []);
  const send = (text: string) => {
    const v = text.trim();
    if (!v) return;
    setThread((m) =>
      [...m, { id: msgId.current++, me: true, text: v }].slice(-4),
    );
    setDraft("");
    onMessage?.(v);
    const r = reply(v);
    if (!r) return;
    setTyping(true);
    window.clearTimeout(replyTimer.current);
    replyTimer.current = window.setTimeout(() => {
      setTyping(false);
      setThread((m) =>
        [...m, { id: msgId.current++, me: false, text: r }].slice(-4),
      );
    }, 1300);
  };
  const initials = driver.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");

  return (
    <div
      ref={root}
      className={cn("flex w-full justify-center", className)}
      style={{ maxWidth: width }}
    >
      <div
        className="@container w-full rounded-[24px] bg-(--pt-tint) p-1.5 text-sm text-foreground [--pt-panel:#ffffff] [--pt-tint:#f0f0f0] [--pt-well:#f4f4f4] dark:[--pt-panel:#0c0c0c] dark:[--pt-tint:#161616] dark:[--pt-well:#141414]"
        style={{ "--pt-color": done ? GREEN : color } as CSSProperties}
      >
        <div className="flex items-center justify-between gap-3 px-3 pb-2.5 pt-2">
          <h3 id={`${uid}-title`} className="truncate font-medium">
            {order}
          </h3>
          <span className="shrink-0 text-xs text-muted-foreground">
            {carrier}
          </span>
        </div>

        <div className="grid gap-1.5 rounded-[18px] bg-(--pt-panel) p-1.5 @[700px]:grid-cols-[1.1fr_1fr]">
          <div className="relative min-h-64 overflow-hidden rounded-[14px] bg-(--pt-well) @[440px]:min-h-72 @[700px]:min-h-0">
            <City
              n={n}
              at={at}
              t={t}
              done={done}
              focus={open !== null && open >= 0 ? open : null}
              color={done ? GREEN : color}
              reduce={!!reduce}
              arrivedAt={arrivedAt}
              label={`${stops[at].title}, ${remaining} stops to go`}
            />
            <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
              <span className="flex h-7 items-center gap-1.5 rounded-full bg-(--pt-panel) px-2.5 text-xs tabular-nums">
                <span
                  className={cn(
                    "size-1.5 rounded-full bg-(--pt-color) transition-colors duration-300",
                  )}
                />
                {done ? "Delivered" : `Stop ${at + 1} of ${n}`}
              </span>
              <button
                type="button"
                onClick={toggle}
                aria-label={
                  done ? "Replay delivery" : playing ? "Pause" : "Play"
                }
                className="pointer-events-auto grid size-7 cursor-pointer place-items-center rounded-full bg-foreground text-background outline-none transition-transform duration-150 active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-neutral-400/50"
              >
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={done ? "r" : playing ? "p" : "g"}
                    initial={reduce ? false : { scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    {done ? (
                      <IconRotate size={14} stroke={2.25} />
                    ) : playing ? (
                      <IconPlayerPauseFilled size={12} />
                    ) : (
                      <IconPlayerPlayFilled size={12} />
                    )}
                  </motion.span>
                </AnimatePresence>
              </button>
            </div>
          </div>

          <div className="flex min-w-0 flex-col px-2.5 pb-1 pt-3">
            {/* Window */}
            <div className="flex items-center gap-3" aria-live="polite">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-(--pt-well) text-(--pt-color) transition-colors duration-300">
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={done ? "done" : "van"}
                    initial={reduce ? false : { opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.25, ease: EASE_OUT }}
                  >
                    {done ? (
                      <IconCheck size={20} stroke={2.25} />
                    ) : (
                      <IconTruckDelivery size={20} stroke={1.75} />
                    )}
                  </motion.span>
                </AnimatePresence>
              </span>
              <div className="min-w-0">
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.div
                    key={done ? "d" : `w${at}`}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.25, ease: EASE_OUT }}
                  >
                    <div className="truncate text-xl font-medium tabular-nums tracking-tight">
                      {done
                        ? `Delivered ${clock(last.time)}`
                        : `${win(eta - spreadMin)} – ${win(eta + Math.max(10, Math.round(spreadMin / 2)))}`}
                    </div>
                  </motion.div>
                </AnimatePresence>
                <div className="truncate text-xs tabular-nums text-muted-foreground">
                  {sub}
                </div>
              </div>
            </div>

            {/* Driver, with a real call link and messages kept in the card */}
            <div className="mt-3.5 rounded-[12px] bg-(--pt-well) p-2">
              <div className="flex items-center gap-3">
                {driver.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={driver.avatar}
                    alt=""
                    width={36}
                    height={36}
                    decoding="async"
                    draggable={false}
                    className="size-9 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-(--pt-color) text-xs font-medium text-white transition-colors duration-300">
                    {initials}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate text-[13px] font-medium">
                    {driver.name}
                    {driver.rating != null && (
                      <span className="flex items-center gap-0.5 text-xs font-normal tabular-nums text-muted-foreground">
                        <IconStarFilled size={11} className="text-[#f5a623]" />
                        {driver.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[driver.vehicle, driver.plate].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <a
                    href={driver.phone ? `tel:${driver.phone}` : undefined}
                    onClick={() => onCall?.()}
                    aria-label={`Call ${driver.name}`}
                    className="grid size-9 cursor-pointer place-items-center rounded-full bg-(--pt-panel) text-foreground outline-none transition-transform duration-150 active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-neutral-400/50"
                  >
                    <IconPhoneFilled size={15} />
                  </a>
                  <button
                    type="button"
                    aria-label={`Message ${driver.name}`}
                    aria-expanded={chatOpen}
                    onClick={() => setChatOpen((v) => !v)}
                    className={cn(
                      "relative grid size-9 cursor-pointer place-items-center rounded-full outline-none transition-[transform,background-color,color] duration-150 active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-neutral-400/50",
                      chatOpen
                        ? "bg-foreground text-background"
                        : "bg-(--pt-panel) text-foreground",
                    )}
                  >
                    <IconMessageCircleFilled size={15} />
                  </button>
                </div>
              </div>
              <AnimatePresence initial={false}>
                {chatOpen && (
                  <motion.div
                    key="chat"
                    initial={reduce ? false : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.28, ease: EASE_OUT }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-1.5 pt-2.5">
                      <AnimatePresence initial={false} mode="popLayout">
                        {thread.map((m) => (
                          <motion.div
                            key={m.id}
                            layout="position"
                            initial={
                              reduce ? false : { opacity: 0, y: 6, scale: 0.96 }
                            }
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.22, ease: EASE_OUT }}
                            className={cn(
                              "max-w-[85%] rounded-[14px] px-3 py-1.5 text-xs",
                              m.me
                                ? "self-end bg-(--pt-color) text-white"
                                : "self-start bg-(--pt-panel)",
                            )}
                          >
                            {m.text}
                          </motion.div>
                        ))}
                        {typing && (
                          <motion.div
                            key="typing"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex gap-1 self-start rounded-[14px] bg-(--pt-panel) px-3 py-2.5"
                            aria-label={`${driver.name} is typing`}
                          >
                            {[0, 1, 2].map((d) => (
                              <motion.span
                                key={d}
                                className="size-1.5 rounded-full bg-muted-foreground"
                                animate={
                                  reduce ? undefined : { y: [0, -2.5, 0] }
                                }
                                transition={{
                                  duration: 0.6,
                                  repeat: Infinity,
                                  delay: d * 0.12,
                                }}
                              />
                            ))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                      {thread.length === 0 && (
                        <div className="flex flex-wrap gap-1">
                          {quickReplies.map((q) => (
                            <button
                              key={q}
                              type="button"
                              onClick={() => send(q)}
                              className="h-7 cursor-pointer rounded-full bg-(--pt-panel) px-2.5 text-xs outline-none transition-colors duration-150 hover:text-(--pt-color) focus-visible:ring-2 focus-visible:ring-neutral-400/50"
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      )}
                      <form
                        className="flex items-center gap-1 rounded-full bg-(--pt-panel) p-1 pl-3"
                        onSubmit={(e) => {
                          e.preventDefault();
                          send(draft);
                        }}
                      >
                        <input
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          placeholder={`Message ${driver.name.split(" ")[0]}`}
                          aria-label={`Message ${driver.name}`}
                          className="h-7 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                        />
                        <button
                          type="submit"
                          disabled={!draft.trim()}
                          aria-label="Send"
                          className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full bg-(--pt-color) text-white outline-none transition-opacity duration-150 disabled:cursor-default disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-neutral-400/50"
                        >
                          <IconSend size={13} stroke={2.25} />
                        </button>
                      </form>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1 text-xs text-muted-foreground">
              {parcel.weight && (
                <span className="rounded-full bg-(--pt-well) px-2.5 py-1">
                  {parcel.weight}
                </span>
              )}
              {parcel.items != null && (
                <span className="rounded-full bg-(--pt-well) px-2.5 py-1">
                  {parcel.items} {parcel.items === 1 ? "item" : "items"}
                </span>
              )}
              {parcel.signature != null && (
                <span className="rounded-full bg-(--pt-well) px-2.5 py-1">
                  {parcel.signature
                    ? "Signature needed"
                    : "No signature needed"}
                </span>
              )}
            </div>

            {/* Steps */}
            <ol className="mt-3 flex flex-col gap-px" aria-label="Tracking">
              {stops.slice(0, n).map((s, i) => {
                const reached = i <= at;
                const current = !done && i === at + 1;
                const expanded = shownStep === i && !!s.scans?.length;
                return (
                  <li key={i} className="grid grid-cols-[20px_1fr] gap-x-3">
                    {/* Rail */}
                    <div className="relative flex flex-col items-center">
                      <span
                        className={cn(
                          "relative z-[1] mt-2.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] tabular-nums transition-colors duration-300",
                          reached
                            ? "bg-(--pt-color) text-white"
                            : current
                              ? "bg-(--pt-well) text-(--pt-color)"
                              : "bg-(--pt-well) text-muted-foreground",
                        )}
                      >
                        <AnimatePresence initial={false} mode="popLayout">
                          {reached ? (
                            <motion.span
                              key="c"
                              initial={
                                reduce ? false : { scale: 0, rotate: -30 }
                              }
                              animate={{ scale: 1, rotate: 0 }}
                              exit={{ scale: 0 }}
                              transition={{
                                type: "spring",
                                duration: 0.4,
                                bounce: 0.25,
                              }}
                            >
                              <IconCheck size={12} stroke={3} />
                            </motion.span>
                          ) : (
                            <motion.span
                              key="n"
                              initial={false}
                              animate={{ opacity: 1 }}
                            >
                              {i + 1}
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </span>
                      {i < n - 1 && (
                        <span className="relative -mb-2.5 mt-0.5 w-0.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.08]">
                          <motion.span
                            className="absolute inset-0 origin-top rounded-full bg-(--pt-color)"
                            initial={false}
                            animate={{ scaleY: i < at ? 1 : 0 }}
                            transition={{
                              duration: reduce ? 0 : 0.4,
                              ease: EASE_OUT,
                            }}
                          />
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 pb-px">
                      <button
                        type="button"
                        onClick={() => setOpen(shownStep === i ? -1 : i)}
                        aria-expanded={expanded}
                        disabled={!s.scans?.length}
                        className={cn(
                          "flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 rounded-[10px] px-2.5 py-1.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-neutral-400/50 disabled:cursor-default",
                          expanded
                            ? "bg-(--pt-well)"
                            : "hover:bg-(--pt-well)/60",
                        )}
                      >
                        <span className="min-w-0">
                          <span
                            className={cn(
                              "block truncate text-[13px] transition-colors duration-300",
                              reached || current
                                ? "text-foreground"
                                : "text-muted-foreground",
                            )}
                          >
                            {s.title}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {s.place}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {reached ? clock(s.time) : `Est. ${clock(s.time)}`}
                        </span>
                      </button>
                      <AnimatePresence initial={false}>
                        {expanded && (
                          <motion.ul
                            key="scans"
                            initial={reduce ? false : { height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.28, ease: EASE_OUT }}
                            className="overflow-hidden"
                          >
                            {s.scans!.map((sc, k) => (
                              <li
                                key={k}
                                className="flex gap-3 px-2.5 pt-1 text-xs last:pb-1.5"
                              >
                                <span className="w-14 shrink-0 tabular-nums text-muted-foreground">
                                  {clock(sc.time)}
                                </span>
                                <span className="min-w-0 text-muted-foreground">
                                  {sc.text}
                                </span>
                              </li>
                            ))}
                          </motion.ul>
                        )}
                      </AnimatePresence>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── City canvas ──────────────────────────────────────────────────────────────

// Any CSS colour to [r, g, b], through a 1px canvas so oklch and friends work too.
const rgbCache = new Map<string, [number, number, number]>();
function rgb(c: string): [number, number, number] {
  const hit = rgbCache.get(c);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const x = cv.getContext("2d", { willReadFrequently: true });
  if (!x) return [128, 128, 128];
  x.fillStyle = c;
  x.fillRect(0, 0, 1, 1);
  const d = x.getImageData(0, 0, 1, 1).data;
  const out: [number, number, number] = [d[0], d[1], d[2]];
  rgbCache.set(c, out);
  return out;
}
const mix = (
  a: [number, number, number],
  b: [number, number, number],
  k: number,
) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)},${Math.round(a[1] + (b[1] - a[1]) * k)},${Math.round(a[2] + (b[2] - a[2]) * k)})`;

function City({
  n,
  at,
  t,
  done,
  focus,
  color,
  reduce,
  arrivedAt,
  label,
}: {
  n: number;
  at: number;
  t: MotionValue<number>;
  done: boolean;
  focus: number | null;
  color: string;
  reduce: boolean;
  arrivedAt: RefObject<number>;
  label: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const visible = useVisible(wrap);
  const opts = useRef({ n, at, done, focus, color, reduce });
  useEffect(() => {
    opts.current = { n, at, done, focus, color, reduce };
  });
  const view = useRef({ cx: -1, cy: -1, born: 0, doneAt: 0, S: 0, hh: 0 });

  useEffect(() => {
    const cv = canvas.current;
    const el = wrap.current;
    if (!cv || !el || !visible) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let dirty = true;
    let last = "";
    // Colours and font are read once and again only when the theme changes:
    // getComputedStyle every frame forces a style pass and drops frames.
    let theme: { fg: [number, number, number]; well: [number, number, number]; font: string } | null = null;
    const readTheme = () => {
      const cs = getComputedStyle(cv);
      theme = { fg: rgb(cs.color), well: rgb(getComputedStyle(el).backgroundColor), font: cs.fontFamily };
    };
    const resize = () => {
      const r = el.getBoundingClientRect();
      w = r.width;
      h = r.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pw = Math.round(w * dpr);
      const ph = Math.round(h * dpr);
      // Setting a canvas size wipes it, so only do it when the size really
      // changes, and repaint at once so no blank frame shows.
      if (cv.width !== pw || cv.height !== ph) {
        cv.width = pw;
        cv.height = ph;
        dirty = true;
        paint(performance.now());
      }
    };
    const mo = new MutationObserver(() => {
      theme = null;
      dirty = true;
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style", "data-theme"],
    });
    const V = view.current;
    if (!V.born) V.born = performance.now();
    let raf = 0;

    const legs = LEGS.map(legPts);
    const size = N * PITCH + ST;
    const C30 = Math.cos(Math.PI / 6);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      paint(now);
    };

    const paint = (now: number) => {
      if (!w || !h) return;
      const O = opts.current;
      const tv = O.done ? 1 : t.get();
      const legI = Math.min(O.at, O.n - 2);
      const van = along(legs[legI], O.done ? 1 : tv);
      // The camera leans a little toward the van.
      const tx = size / 2 + (van.x - size / 2) * 0.3;
      const ty = size / 2 + (van.y - size / 2) * 0.3;
      if (V.cx < 0) {
        V.cx = tx;
        V.cy = ty;
      }
      const k = O.reduce ? 1 : 0.08;
      V.cx += (tx - V.cx) * k;
      V.cy += (ty - V.cy) * k;
      const panning =
        Math.abs(tx - V.cx) > 0.002 || Math.abs(ty - V.cy) > 0.002;
      const intro = O.reduce ? 1 : Math.min(1, (now - V.born) / 900);
      const ripple = O.reduce
        ? 1
        : Math.min(1, (now - arrivedAt.current) / 900);
      const moving = !O.done && tv > 0 && tv < 1;
      const sig = `${tv.toFixed(4)}|${O.at}|${O.done}|${O.focus}|${O.color}|${intro}|${ripple}`;
      if (O.done && !V.doneAt) V.doneAt = now;
      if (!O.done) V.doneAt = 0;
      // Traffic and clouds keep the city alive, so it paints every frame unless motion is reduced.
      if (O.reduce && !dirty && !panning && !moving && sig === last) return;
      last = sig;
      dirty = false;
      draw(now, tv, legI, van, intro, ripple);
    };

    const draw = (
      now: number,
      tv: number,
      legI: number,
      van: ReturnType<typeof along>,
      intro: number,
      ripple: number,
    ) => {
      const O = opts.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!theme) readTheme();
      const { fg, well, font } = theme!;
      const dark = fg[0] + fg[1] + fg[2] > 384;
      const ac = rgb(O.color);
      const white: [number, number, number] = [255, 255, 255];
      const black: [number, number, number] = [0, 0, 0];
      const leaf: [number, number, number] = [48, 164, 108];

      // Fit the city, a touch larger than the frame so the edges fall away.
      // Scale and centre ease to a new frame size instead of jumping when the
      // details column grows or shrinks beside the city.
      const tS = Math.min(w / (size * 2 * C30), h / (size * 1.12)) * 1.12;
      if (!V.S || O.reduce) {
        V.S = tS;
        V.hh = h;
      } else {
        V.S += (tS - V.S) * 0.12;
        V.hh += (h - V.hh) * 0.12;
      }
      const S = V.S;
      // Whole device pixels, so edges don't shimmer while the camera drifts.
      const snap = (v: number) => Math.round(v * dpr) / dpr;
      const ox = snap(w / 2 - (V.cx - V.cy) * C30 * S);
      const oy = snap(V.hh / 2 - (V.cx + V.cy) * 0.5 * S + S * 0.12);
      const iso = (x: number, y: number, z = 0): [number, number] => [
        ox + (x - y) * C30 * S,
        oy + (x + y) * 0.5 * S - z * S,
      ];
      const poly = (pts: [number, number][], fill: string) => {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      // Top lit, the right face a step down, the left face darker.
      const box = (
        x0: number,
        y0: number,
        x1: number,
        y1: number,
        z0: number,
        z1: number,
        tone: [number, number, number],
        lift = 0,
      ) => {
        const top = dark
          ? mix(tone, white, 0.1 + lift)
          : mix(tone, white, 0.55 + lift);
        const right = dark ? mix(tone, black, 0.25) : mix(tone, black, 0.04);
        const left = dark ? mix(tone, black, 0.45) : mix(tone, black, 0.12);
        poly(
          [iso(x0, y1, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x0, y1, z1)],
          left,
        );
        poly(
          [iso(x1, y0, z0), iso(x1, y1, z0), iso(x1, y1, z1), iso(x1, y0, z1)],
          right,
        );
        poly(
          [iso(x0, y0, z1), iso(x1, y0, z1), iso(x1, y1, z1), iso(x0, y1, z1)],
          top,
        );
      };

      const base = dark ? mix(well, white, 0.03) : mix(well, black, 0.035);
      const walk = dark ? mix(well, white, 0.07) : mix(well, white, 0.7);
      const bldg: [number, number, number] = dark
        ? [44, 44, 48]
        : [214, 214, 220];

      // Streets.
      poly([iso(0, 0), iso(size, 0), iso(size, size), iso(0, size)], base);
      // Pavements under each block.
      for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) {
          const x0 = i * PITCH + ST;
          const y0 = j * PITCH + ST;
          poly(
            [
              iso(x0 - 0.06, y0 - 0.06),
              iso(x0 + 1.06, y0 - 0.06),
              iso(x0 + 1.06, y0 + 1.06),
              iso(x0 - 0.06, y0 + 1.06),
            ],
            walk,
          );
        }

      // Route on the streets: still to drive dashed, driven solid.
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const trace = (pts: Pt[], from: number, to: number) => {
        const total = legLen(pts);
        const steps = 24;
        ctx.beginPath();
        for (let s = 0; s <= steps; s++) {
          const q = along(pts, from + ((to - from) * s) / steps);
          const [x, y] = iso(q.x, q.y);
          if (s) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
        return total;
      };
      const reveal = smoothstep(intro);
      ctx.setLineDash([S * 0.06, S * 0.12]);
      ctx.strokeStyle = `rgba(${fg.join(",")},${dark ? 0.35 : 0.3})`;
      ctx.lineWidth = Math.max(1.5, S * 0.05);
      for (let i = 0; i < O.n - 1; i++)
        if (i >= legI)
          trace(legs[i], i === legI ? tv : 0, i === legI ? 1 : reveal);
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgb(${ac.join(",")})`;
      ctx.lineWidth = Math.max(3, S * 0.12);
      for (let i = 0; i < O.n - 1; i++) {
        if (i < legI || (O.done && i === legI)) trace(legs[i], 0, 1);
        else if (i === legI && tv > 0) trace(legs[i], 0, tv);
      }

      // Arrival ripple on the ground at the stop just reached.
      if (ripple < 1 && O.at > 0) {
        const [sx, sy] = LEGS[Math.min(O.at, O.n - 1) - 1].at(-1)!;
        const [cx, cy] = iso(street(sx), street(sy));
        const r = S * (0.15 + ripple * 0.55);
        ctx.strokeStyle = `rgba(${ac.join(",")},${0.5 * (1 - ripple)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r * C30 * 1.15, r * 0.5 * 1.15, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Cloud shadows drifting across the city.
      if (!O.reduce) {
        for (const [k, sp, sz] of [
          [0, 0.035, 1.5],
          [0.55, 0.026, 1.1],
        ]) {
          const u = ((now / 1000) * sp + k) % 1;
          const cxw = -2 + u * (size + 4);
          const [cx2, cy2] = iso(cxw, size * (0.3 + k * 0.6));
          const g = ctx.createRadialGradient(
            cx2,
            cy2,
            0,
            cx2,
            cy2,
            S * sz * 1.4,
          );
          g.addColorStop(0, `rgba(0,0,0,${dark ? 0.1 : 0.045})`);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(
            cx2,
            cy2,
            S * sz * 1.4 * C30 * 1.6,
            S * sz * 0.8,
            0,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }

      // Everything that stands up, painted back to front.
      type Item = { d: number; paint: () => void };
      const items: Item[] = [];
      for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) {
          const x0 = i * PITCH + ST;
          const y0 = j * PITCH + ST;
          const key = `${i},${j}`;
          if (PARKS.has(key)) {
            // A park: grass and a few trees.
            items.push({
              d: x0 + y0 + 1,
              paint: () => {
                poly(
                  [
                    iso(x0, y0, 0.02),
                    iso(x0 + 1, y0, 0.02),
                    iso(x0 + 1, y0 + 1, 0.02),
                    iso(x0, y0 + 1, 0.02),
                  ],
                  dark ? mix(leaf, black, 0.72) : mix(leaf, white, 0.78),
                );
                for (const [u, v] of [
                  [0.28, 0.3],
                  [0.7, 0.36],
                  [0.4, 0.72],
                  [0.76, 0.76],
                ]) {
                  const [tx, ty] = iso(x0 + u, y0 + v, 0.02);
                  ctx.fillStyle = `rgba(0,0,0,${dark ? 0.35 : 0.08})`;
                  ctx.beginPath();
                  ctx.ellipse(
                    tx + S * 0.04,
                    ty + S * 0.02,
                    S * 0.13,
                    S * 0.065,
                    0,
                    0,
                    Math.PI * 2,
                  );
                  ctx.fill();
                  const [px, py] = iso(x0 + u, y0 + v, 0.24);
                  // Crown: a base circle and a lit cap, flat fills (cheaper than a gradient per tree per frame).
                  ctx.fillStyle = dark ? mix(leaf, black, 0.5) : mix(leaf, black, 0.04);
                  ctx.beginPath();
                  ctx.arc(px, py, S * 0.13, 0, Math.PI * 2);
                  ctx.fill();
                  ctx.fillStyle = dark ? mix(leaf, black, 0.28) : mix(leaf, white, 0.3);
                  ctx.beginPath();
                  ctx.arc(px - S * 0.035, py - S * 0.04, S * 0.075, 0, Math.PI * 2);
                  ctx.fill();
                }
              },
            });
            continue;
          }
          const home = i === HOME[0] && j === HOME[1];
          if (home) {
            items.push({
              d: x0 + y0 + 1,
              paint: () => {
                const tone = O.done ? rgb(GREEN) : ac;
                box(
                  x0 + 0.22,
                  y0 + 0.22,
                  x0 + 0.78,
                  y0 + 0.78,
                  0,
                  0.32,
                  tone,
                  O.done ? 0.1 : 0,
                );
                // Pitched roof along x.
                const z0 = 0.32;
                const z1 = 0.58;
                const ym = y0 + 0.5;
                const rt = dark ? mix(tone, black, 0.3) : mix(tone, black, 0.1);
                const rf = dark
                  ? mix(tone, white, 0.08)
                  : mix(tone, white, 0.35);
                poly(
                  [
                    iso(x0 + 0.78, y0 + 0.2, z0),
                    iso(x0 + 0.78, y0 + 0.8, z0),
                    iso(x0 + 0.78, ym, z1),
                  ],
                  rt,
                );
                poly(
                  [
                    iso(x0 + 0.2, y0 + 0.8, z0),
                    iso(x0 + 0.8, y0 + 0.8, z0),
                    iso(x0 + 0.8, ym, z1),
                    iso(x0 + 0.2, ym, z1),
                  ],
                  rf,
                );
              },
            });
            continue;
          }
          // One to four buildings per block, heights from a hash.
          const split = hash(i, j) > 0.62;
          const parts = split
            ? [
                [0.08, 0.08, 0.46, 0.92],
                [0.54, 0.08, 0.92, 0.46],
                [0.54, 0.54, 0.92, 0.92],
              ]
            : [[0.1, 0.1, 0.9, 0.9]];
          parts.forEach((q, pi) => {
            const ht =
              (0.18 +
                hash(i + pi * 3.1, j + pi * 1.7) * (i + j > 5 ? 0.32 : 0.62)) *
              (0.4 + 0.6 * smoothstep(intro * 1.3 - (i + j) * 0.06));
            const bx0 = x0 + q[0];
            const by0 = y0 + q[1];
            const bx1 = x0 + q[2];
            const by1 = y0 + q[3];
            items.push({
              d: (bx0 + by0 + bx1 + by1) / 2 + 0.001 * pi,
              paint: () => {
                box(bx0, by0, bx1, by1, 0, ht, bldg);
                // Window bands on the two faces we can see.
                if (ht > 0.45) {
                  ctx.strokeStyle = `rgba(${dark ? "255,255,255" : "0,0,0"},${dark ? 0.06 : 0.05})`;
                  ctx.lineWidth = 1;
                  for (let z = 0.16; z < ht - 0.1; z += 0.16) {
                    let [a1, a2] = iso(bx0 + 0.06, by1, z);
                    let [b1, b2] = iso(bx1 - 0.06, by1, z);
                    ctx.beginPath();
                    ctx.moveTo(a1, a2);
                    ctx.lineTo(b1, b2);
                    [a1, a2] = iso(bx1, by0 + 0.06, z);
                    [b1, b2] = iso(bx1, by1 - 0.06, z);
                    ctx.moveTo(a1, a2);
                    ctx.lineTo(b1, b2);
                    ctx.stroke();
                  }
                }
              },
            });
          });
        }

      // Stop pins: a stem and a numbered head.
            for (let s = 0; s < O.n; s++) {
        const [a, b] = s === 0 ? LEGS[0][0] : LEGS[s - 1].at(-1)!;
        const gx = street(a);
        const gy = street(b);
        const reached = s <= O.at;
        const next = !O.done && s === O.at + 1;
        const ring = O.focus === s;
        // The pin just reached drops in from above with a small settle.
        const fresh = s === O.at && s > 0 && ripple < 1;
        const drop = fresh
          ? 0.6 *
            Math.pow(1 - ripple, 2) *
            Math.abs(Math.cos(ripple * Math.PI * 1.5))
          : 0;
        items.push({
          d: gx + gy + 0.2,
          paint: () => {
            const [bx, by] = iso(gx, gy);
            const [hx, hy] = iso(gx, gy, 0.72 + drop);
            ctx.fillStyle = `rgba(0,0,0,${dark ? 0.4 : 0.12})`;
            ctx.beginPath();
            ctx.ellipse(bx, by, S * 0.09, S * 0.045, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle =
              reached || next
                ? `rgb(${ac.join(",")})`
                : `rgba(${fg.join(",")},0.35)`;
            ctx.lineWidth = 1.25;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(hx, hy);
            ctx.stroke();
            const r = Math.max(7, S * 0.15);
            if (ring) {
              ctx.strokeStyle = `rgb(${ac.join(",")})`;
              ctx.lineWidth = 1.5;
              ctx.setLineDash([2, 2]);
              ctx.beginPath();
              ctx.arc(hx, hy, r + 3.5, 0, Math.PI * 2);
              ctx.stroke();
              ctx.setLineDash([]);
            }
            ctx.fillStyle = reached
              ? `rgb(${ac.join(",")})`
              : dark
                ? mix(well, white, 0.14)
                : "#ffffff";
            ctx.beginPath();
            ctx.arc(hx, hy, r, 0, Math.PI * 2);
            ctx.fill();
            if (!reached) {
              ctx.strokeStyle = next
                ? `rgb(${ac.join(",")})`
                : `rgba(${fg.join(",")},0.18)`;
              ctx.lineWidth = 1.25;
              ctx.stroke();
            }
            ctx.font = `500 ${Math.round(r * 1.05)}px ${font}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = reached
              ? "#ffffff"
              : next
                ? `rgb(${ac.join(",")})`
                : `rgba(${fg.join(",")},0.55)`;
            ctx.fillText(String(s + 1), hx, hy + 0.5);
          },
        });
      }

      // The van: a body and a lower cab facing the way it drives, with a shadow.
      if (!O.done || legI >= 0) {
        const along_x = van.dx !== 0;
        const fwd = along_x ? van.dx : van.dy;
        const L = 0.7;
        const Wd = 0.4;
        items.push({
          d: van.x + van.y + 0.5,
          paint: () => {
            const [sx, sy] = iso(van.x, van.y);
            ctx.fillStyle = `rgba(0,0,0,${dark ? 0.45 : 0.14})`;
            ctx.beginPath();
            ctx.ellipse(
              sx + S * 0.03,
              sy + S * 0.02,
              S * 0.3,
              S * 0.15,
              0,
              0,
              Math.PI * 2,
            );
            ctx.fill();
            // Body behind, cab in front.
            const seg = (
              a: number,
              b: number,
              z1: number,
              tone: [number, number, number],
              lift: number,
            ) => {
              const lo = Math.min(a, b);
              const hi = Math.max(a, b);
              if (along_x)
                box(
                  van.x + lo,
                  van.y - Wd / 2,
                  van.x + hi,
                  van.y + Wd / 2,
                  0.04,
                  z1,
                  tone,
                  lift,
                );
              else
                box(
                  van.x - Wd / 2,
                  van.y + lo,
                  van.x + Wd / 2,
                  van.y + hi,
                  0.04,
                  z1,
                  tone,
                  lift,
                );
            };
            const body: [number, number] = [-fwd * (L / 2), fwd * (L * 0.18)];
            const cab: [number, number] = [fwd * (L * 0.18), fwd * (L / 2)];
            const parts = [
              () => seg(body[0], body[1], 0.46, ac, 0.05),
              () =>
                seg(
                  cab[0],
                  cab[1],
                  0.34,
                  dark ? [210, 210, 215] : [250, 250, 252],
                  -0.3,
                ),
            ];
            // Paint the part further from the viewer first.
            if (fwd > 0) parts.forEach((p) => p());
            else parts.reverse().forEach((p) => p());
          },
        });
      }

      // Traffic on the side streets.
      {
        const tsec = O.reduce ? 0 : now / 1000;
        for (const car of TRAFFIC) {
          let u = (car.o + tsec * car.v * 0.12) % 1;
          if (u < 0) u += 1;
          // Stay on the plate: drive between its edges and shrink away at each end.
          const pos = 0.25 + u * (size - 0.5);
          const fade = Math.min(1, u / 0.06, (1 - u) / 0.06);
          if (fade <= 0.02) continue;
          const cxp = car.axis === "x" ? pos : street(car.k);
          const cyp = car.axis === "x" ? street(car.k) : pos;
          // Keep to the right-hand lane.
          const lane = (car.v > 0 ? 1 : -1) * ST * 0.2;
          const x = car.axis === "x" ? cxp : cxp - lane;
          const y = car.axis === "x" ? cyp + lane : cyp;
          const Lc = 0.3 * fade;
          const Wc = 0.18 * fade;
          const H1 = 0.14 * fade;
          const H2 = 0.22 * fade;
          items.push({
            d: x + y + 0.3,
            paint: () => {
              const [sx2, sy2] = iso(x, y);
              ctx.fillStyle = `rgba(0,0,0,${dark ? 0.4 : 0.12})`;
              ctx.beginPath();
              ctx.ellipse(
                sx2,
                sy2,
                S * 0.16 * fade,
                S * 0.08 * fade,
                0,
                0,
                Math.PI * 2,
              );
              ctx.fill();
              if (car.axis === "x") {
                box(
                  x - Lc / 2,
                  y - Wc / 2,
                  x + Lc / 2,
                  y + Wc / 2,
                  0.03,
                  H1,
                  car.c,
                );
                box(
                  x - Lc / 4,
                  y - Wc / 2 + 0.02 * fade,
                  x + Lc / 4,
                  y + Wc / 2 - 0.02 * fade,
                  H1,
                  H2,
                  car.c,
                  0.1,
                );
              } else {
                box(
                  x - Wc / 2,
                  y - Lc / 2,
                  x + Wc / 2,
                  y + Lc / 2,
                  0.03,
                  H1,
                  car.c,
                );
                box(
                  x - Wc / 2 + 0.02 * fade,
                  y - Lc / 4,
                  x + Wc / 2 - 0.02 * fade,
                  y + Lc / 4,
                  H1,
                  H2,
                  car.c,
                  0.1,
                );
              }
            },
          });
        }
      }

      // The parcel: hops from the van to the door once delivered, then waits there.
      if (O.done) {
        const k = O.reduce ? 1 : Math.min(1, (now - V.doneAt) / 750);
        const e = k * k * (3 - 2 * k);
        const door = {
          x: HOME[0] * PITCH + ST + 0.5,
          y: HOME[1] * PITCH + ST + 0.92,
        };
        const px = van.x + (door.x - van.x) * e;
        const py = van.y + (door.y - van.y) * e;
        const pz = 0.32 * (1 - e) + Math.sin(Math.PI * e) * 0.55;
        const tan: [number, number, number] = [200, 156, 104];
        items.push({
          d: px + py + 0.6,
          paint: () => {
            const [gx2, gy2] = iso(px, py);
            ctx.fillStyle = `rgba(0,0,0,${dark ? 0.4 : 0.12})`;
            ctx.beginPath();
            ctx.ellipse(gx2, gy2, S * 0.1, S * 0.05, 0, 0, Math.PI * 2);
            ctx.fill();
            box(
              px - 0.09,
              py - 0.09,
              px + 0.09,
              py + 0.09,
              pz,
              pz + 0.16,
              tan,
              0.05,
            );
          },
        });
      }

      items.sort((a, b) => a.d - b.d);
      for (const it of items) it.paint();
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, [visible, t, arrivedAt]);

  return (
    <div ref={wrap} className="absolute inset-0 bg-(--pt-well)">
      <canvas
        ref={canvas}
        className="absolute inset-0 h-full w-full text-foreground"
        role="img"
        aria-label={label}
      />
    </div>
  );
}

const smoothstep = (x: number) => {
  const v = Math.min(1, Math.max(0, x));
  return v * v * (3 - 2 * v);
};

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

// ─── Sample ───────────────────────────────────────────────────────────────────

// A canned reply so the demo answers; pass your own reply, or one that returns null.
export const DEFAULT_REPLY = (text: string) =>
  /door|leave/i.test(text)
    ? "Will do, I'll leave it by the door."
    : /bell|ring/i.test(text)
      ? "Sure, I'll ring when I'm there."
      : /home/i.test(text)
        ? "Great, see you in a few minutes."
        : "Got it, thanks!";

export const DEFAULT_STOPS: PackageStop[] = [
  {
    title: "Picked up",
    place: "Oakland warehouse",
    time: "07:12",
    scans: [
      { time: "06:48", text: "Label scanned, 1.4 kg" },
      { time: "07:12", text: "Loaded onto trailer 22" },
    ],
  },
  {
    title: "At sort hub",
    place: "Hayward, CA",
    time: "09:40",
    scans: [
      { time: "09:31", text: "Arrived at sort hub" },
      { time: "09:40", text: "Sorted to route SM-14" },
    ],
  },
  {
    title: "At local depot",
    place: "San Mateo, CA",
    time: "12:05",
    scans: [
      { time: "11:58", text: "Arrived at depot, bay 4" },
      { time: "12:05", text: "Assigned to driver Lena" },
    ],
  },
  {
    title: "Out for delivery",
    place: "Burlingame, CA",
    time: "13:20",
    scans: [
      { time: "13:20", text: "On the van, 6 stops before yours" },
      { time: "14:02", text: "2 stops before yours" },
    ],
  },
  {
    title: "Delivered",
    place: "214 Elm St",
    time: "14:36",
    scans: [{ time: "14:36", text: "Left at front door, photo taken" }],
  },
];
