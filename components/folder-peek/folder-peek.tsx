"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
} from "react";
import { AnimatePresence, motion, useReducedMotion, useSpring, useTransform, type Transition } from "motion/react";
import { IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// Folder peek. A folder with a few sheets tucked inside, each a little preview
// of its file. Hovering tips the front flap forward and the sheets rise and fan
// out, leaning toward the cursor. Clicking opens it: the flap drops, the
// sheets fly out one after another and shrink into the thumbnails of a file
// list, and the names settle in beside them. Closing files them back.
//
// Nothing is swapped mid-flight. The folder, the list and the sheets are all
// mounted the whole time and only their poses change, so every transition is
// one continuous motion and can reverse halfway if clicked again. A sheet's
// target is its row's thumbnail slot, measured; thumbnails are the same
// preview at a quarter scale, so a sheet just shrinks into place. Once it has
// landed, the row's own thumbnail takes over (identical, so the hand-off is
// invisible) and the list is free to scroll.
//
// Files can be dropped on it too, from the desktop or anything that drags a
// FolderFile: the folder gapes while one hovers and the new sheet slides in.

const W = 220; // folder width, px
const H = 168; // folder height including the tab, px
const TAB = 14; // tab height, px
const R = 12; // corner radius, px
const FLAP = 120; // height of the front flap, px
const PAPER = { w: 168, h: 124 } as const;
const SINK = 14; // how far a resting sheet's foot sits below the flap's top, px
const THUMB_SCALE = 0.25; // thumbnail size relative to a sheet
const THUMB = { w: PAPER.w * THUMB_SCALE, h: PAPER.h * THUMB_SCALE } as const;
const ROW = 52; // height of a list row, px
const SHOWN = 3; // sheets drawn in the folder
const STAGGER = 0.045; // between sheets taking off, s
const GAPE_DEG = 72; // how far the flap drops when the folder opens

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const FLY = { type: "spring", duration: 0.6, bounce: 0 } as const;
const SETTLE = { type: "spring", duration: 0.45, bounce: 0 } as const;
const HOME = { type: "spring", duration: 0.55, bounce: 0 } as const;
const DRAWER = [0.32, 0.72, 0, 1] as const; // slow, soft finish, for the flap closing
// The flap starts shutting once the last sheet is most of the way home.
const FLAP_SHUT = { duration: 0.4, delay: (n: number) => 0.22 + (n - 1) * STAGGER } as const;
const DRAG_TYPE = "application/x-folder-file";

export type FolderFileKind = "doc" | "slides" | "image" | "text";

export type FolderFile = {
  name: string;
  /** Second line, e.g. size or date. */
  meta?: string;
  /** What the drawn preview looks like. Inferred from the extension when left out. */
  kind?: FolderFileKind;
  /** Image URL shown as the preview instead of a drawn one, for any kind. */
  preview?: string;
};

const FILES: FolderFile[] = [
  { name: "Brand guidelines.pdf", meta: "2.4 MB" },
  { name: "Q3 roadmap.key", meta: "8.1 MB" },
  { name: "Moodboard.png", meta: "1.2 MB" },
  { name: "Interview notes.md", meta: "14 KB" },
];

export type FolderPeekProps = {
  /** Folder name, under the folder and atop the list. */
  name?: string;
  /** Files on mount, newest first. The first three are drawn as sheets. */
  files?: readonly FolderFile[];
  /** Folder colour. The back is drawn a shade darker, the flap a shade lighter. */
  color?: string;
  /** How far the sheets rise on hover, px. */
  rise?: number;
  /** Degrees the outer sheets turn as they fan. */
  fan?: number;
  /** Degrees the front flap tips forward on hover. */
  tilt?: number;
  /** Lean the fanned sheets toward the cursor. */
  parallax?: boolean;
  /** Accept files dropped on the folder or the open list. */
  droppable?: boolean;
  /** Rows the open list shows before it scrolls. */
  maxRows?: number;
  onSelect?: (file: FolderFile, index: number) => void;
  /** Called with files dropped in, after they've been added. */
  onAdd?: (files: FolderFile[]) => void;
  className?: string;
};

// "leaving" lasts one frame: sheets reappear exactly over their rows before
// they set off, so closing starts from wherever the list was scrolled.
type Phase = "closed" | "open" | "leaving" | "closing";
// Where each sheet sets off from on the way home, and whether its row was in view.
type Departure = { y: number; seen: boolean }[];
type Item = { key: string; file: FolderFile };
type Point = { x: number; y: number };
type Geometry = { folder: Point; slots: Point[] };

const KINDS: Record<string, FolderFileKind> = {
  key: "slides", ppt: "slides", pptx: "slides",
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", avif: "image",
  md: "text", txt: "text",
};
const kindOf = (f: FolderFile): FolderFileKind => f.kind ?? KINDS[f.name.split(".").pop()?.toLowerCase() ?? ""] ?? "doc";

const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

// Back of the folder, tab on the left.
const BACK = `M0 ${R} Q0 0 ${R} 0 H72 C82 0 80 ${TAB} 92 ${TAB} H${W - R} Q${W} ${TAB} ${W} ${TAB + R} V${H - R} Q${W} ${H} ${W - R} ${H} H${R} Q0 ${H} 0 ${H - R} Z`;

// ─── Previews ────────────────────────────────────────────────────────────────
// Drawn at sheet size; thumbnails are the same drawing scaled down.

function Preview({ file }: { file: FolderFile }) {
  if (file.preview)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={file.preview} alt="" draggable={false} className="size-full object-cover" />;

  const kind = kindOf(file);
  if (kind === "image")
    // A drawn landscape: sky, sun, two hills.
    return (
      <svg viewBox={`0 0 ${PAPER.w} ${PAPER.h}`} className="size-full" aria-hidden>
        <rect width={PAPER.w} height={PAPER.h} fill="#e3e8ee" />
        <rect y={PAPER.h * 0.45} width={PAPER.w} height={PAPER.h * 0.55} fill="#efe7dc" />
        <circle cx="122" cy="40" r="14" fill="#f3d3a2" />
        <path d={`M0 92 C30 70 52 72 78 86 C100 98 120 74 ${PAPER.w} 80 V${PAPER.h} H0 Z`} fill="#bac4b1" />
        <path d={`M0 104 C36 92 70 100 98 108 C128 116 146 100 ${PAPER.w} 102 V${PAPER.h} H0 Z`} fill="#909d89" />
      </svg>
    );
  if (kind === "slides")
    return (
      <div className="flex size-full flex-col justify-between p-4">
        <div className="flex flex-col gap-1.5">
          <div className="h-2.5 w-3/5 rounded-full bg-white/85" />
          <div className="h-1.5 w-2/5 rounded-full bg-white/35" />
        </div>
        <div className="flex h-10 items-end gap-1.5">
          {[0.35, 0.55, 0.45, 0.8, 1].map((h, i) => (
            <div key={i} className="flex-1 rounded-sm bg-white/40" style={{ height: `${h * 100}%` }} />
          ))}
        </div>
      </div>
    );
  if (kind === "text")
    return (
      <div className="flex flex-col gap-2 p-4">
        <div className="h-2 w-2/5 rounded-full bg-neutral-400" />
        {[0.8, 0.65, 0.75, 0.5].map((w, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="size-1.5 shrink-0 rounded-full bg-neutral-300" />
            <div className="h-1.5 rounded-full bg-neutral-200" style={{ width: `${w * 100}%` }} />
          </div>
        ))}
      </div>
    );
  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="h-2 w-1/2 rounded-full bg-neutral-400" />
      {[0.9, 0.75, 0.85].map((w, i) => (
        <div key={i} className="h-1.5 rounded-full bg-neutral-200" style={{ width: `${w * 100}%` }} />
      ))}
      <div className="mt-0.5 flex gap-2">
        <div className="h-7 w-1/3 rounded-sm bg-neutral-200" />
        <div className="flex flex-1 flex-col gap-1.5 pt-0.5">
          <div className="h-1.5 rounded-full bg-neutral-200" />
          <div className="h-1.5 w-2/3 rounded-full bg-neutral-200" />
        </div>
      </div>
    </div>
  );
}

const paper = "overflow-hidden shadow-[0_1px_2px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.05)]";

// The sheet's own fill matches its preview's edge. A white sheet behind a dark
// slide or a photo shows through as a light hairline where the rounded,
// transformed corners anti-alias.
const tone = (file: FolderFile) =>
  file.preview
    ? "bg-neutral-300"
    : ({ slides: "bg-neutral-900", image: "bg-linear-to-b from-[#e3e8ee] to-[#909d89]", doc: "bg-white dark:bg-neutral-100", text: "bg-white dark:bg-neutral-100" } as const)[kindOf(file)];

function Thumb({ file }: { file: FolderFile }) {
  return (
    <span className="block origin-top-left" style={{ width: PAPER.w, height: PAPER.h, scale: THUMB_SCALE }}>
      <Preview file={file} />
    </span>
  );
}

// ─── Folder ──────────────────────────────────────────────────────────────────

let uid = 0;
const toItems = (files: readonly FolderFile[]): Item[] => files.map((file) => ({ key: `f${uid++}`, file }));

export function FolderPeek({
  name = "Launch assets",
  files = FILES,
  color = "#a1a1aa",
  rise = 44,
  fan = 7,
  tilt = 22,
  parallax = true,
  droppable = true,
  maxRows = 5,
  onSelect,
  onAdd,
  className,
}: FolderPeekProps) {
  const panelId = useId();
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("closed");
  // Sheets have reached their rows; the rows' own thumbnails show from here.
  const [landed, setLanded] = useState(false);
  const [items, setItems] = useState(() => toItems(files));
  const [source, setSource] = useState(files);
  const [hover, setHover] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [geo, setGeo] = useState<Geometry | null>(null);
  const [departure, setDeparture] = useState<Departure>([]);
  const dragDepth = useRef(0);
  const stage = useRef<HTMLDivElement>(null);
  const folderBox = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const slots = useRef<(HTMLSpanElement | null)[]>([]);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  // A new `files` prop starts the folder over.
  if (source !== files) {
    setSource(files);
    setItems(toItems(files));
  }

  const n = Math.min(SHOWN, items.length);
  const sheets = items.slice(0, n);
  const extra = items.length - n;
  const open = phase === "open";
  const closed = phase === "closed";
  const instant = { duration: 0 };

  // ─── Geometry ──────────────────────────────────────────────────────────────
  // Where the folder sits and where each sheet's row thumbnail goes, in stage
  // space, measured with the list scrolled to the top.

  useLayoutEffect(() => {
    const measure = () => {
      const s = stage.current?.getBoundingClientRect();
      const f = folderBox.current?.getBoundingClientRect();
      if (!s || !f) return;
      const scrolled = list.current?.scrollTop ?? 0;
      setGeo({
        folder: { x: f.left - s.left, y: f.top - s.top },
        slots: slots.current.slice(0, SHOWN).map((el) => {
          const r = el?.getBoundingClientRect();
          return r ? { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 + scrolled } : { x: 0, y: 0 };
        }),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (stage.current) ro.observe(stage.current);
    return () => ro.disconnect();
  }, [items.length, maxRows]);

  // Cursor lean, as springs so the sheets drift rather than snap.
  const leanX = useSpring(0, { stiffness: 220, damping: 24 });
  const leanY = useSpring(0, { stiffness: 220, damping: 24 });
  const leanTurn = useTransform(leanX, (v) => v * 7);
  const leanTip = useTransform(leanY, (v) => v * -4);
  const lean = (e: PointerEvent<HTMLElement>) => {
    if (!parallax || reduceMotion || !closed) return;
    const box = e.currentTarget.getBoundingClientRect();
    leanX.set(((e.clientX - box.left) / box.width - 0.5) * 2);
    leanY.set(((e.clientY - box.top) / box.height - 0.5) * 2);
  };
  const unlean = () => {
    leanX.set(0);
    leanY.set(0);
  };

  // ─── Phases ────────────────────────────────────────────────────────────────

  const openFolder = () => {
    if (open) return;
    // Straighten at once: sheets fly from where they are, not from a lean.
    leanX.jump(0);
    leanY.jump(0);
    setHover(false);
    setPhase("open");
  };

  const close = () => {
    // The list stays where it was scrolled. Each sheet sets off from its row's
    // thumbnail as it is now; a row scrolled out of view lends its sheet the
    // list's nearest edge, and the sheet fades in on the way instead.
    const s = stage.current?.getBoundingClientRect();
    const l = list.current?.getBoundingClientRect();
    const scrolled = list.current?.scrollTop ?? 0;
    if (geo && s && l) {
      const top = l.top - s.top + THUMB.h / 2;
      const bottom = l.bottom - s.top - THUMB.h / 2;
      setDeparture(
        geo.slots.slice(0, n).map((slot) => {
          const y = slot.y - scrolled;
          return { y: Math.min(bottom, Math.max(top, y)), seen: y >= top && y <= bottom };
        }),
      );
    }
    setLanded(false);
    setPhase("leaving");
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (phase !== "leaving") return;
    const raf = requestAnimationFrame(() => setPhase("closing"));
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // After the last sheet lands, the rows take over its thumbnail.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setLanded(true), reduceMotion ? 0 : (0.04 + (n - 1) * STAGGER + FLY.duration) * 1000);
    return () => clearTimeout(t);
  }, [open, n, reduceMotion]);

  // Once the sheets are home, the flap swings shut.
  useEffect(() => {
    if (phase !== "closing") return;
    const t = setTimeout(() => setPhase("closed"), reduceMotion ? 0 : (FLAP_SHUT.delay(n) + FLAP_SHUT.duration) * 1000);
    return () => clearTimeout(t);
  }, [phase, n, reduceMotion]);

  // Escape or a click outside the list puts the files back.
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    const onDown = (e: globalThis.PointerEvent) => !panel.current?.contains(e.target as Node) && closeRef.current();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    panel.current?.querySelector<HTMLElement>("[data-row]")?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // Tab stays inside the open list.
  const trapFocus = (e: ReactKeyboardEvent) => {
    if (e.key !== "Tab" || !panel.current) return;
    const focusable = [...panel.current.querySelectorAll<HTMLElement>("button")];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };

  // ─── Dropping ──────────────────────────────────────────────────────────────

  const accepts = (e: DragEvent) =>
    droppable && (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes(DRAG_TYPE));

  const dropHandlers = {
    onDragEnter: (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      dragDepth.current++;
      setDropping(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDropping(false);
    },
    onDrop: (e: DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDropping(false);
      let added: FolderFile[] = [];
      const custom = e.dataTransfer.getData(DRAG_TYPE);
      if (custom) {
        try {
          added = [JSON.parse(custom) as FolderFile];
        } catch {}
      } else {
        added = [...e.dataTransfer.files].map((f) => ({
          name: f.name,
          meta: formatSize(f.size),
          preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
        }));
      }
      if (!added.length) return;
      setItems((list) => [...toItems(added), ...list]);
      onAdd?.(added);
    },
  };

  // ─── Poses ─────────────────────────────────────────────────────────────────

  // Sheet `i` (its row), drawn at `j` of `n` from the back.
  const sheetPose = (i: number) => {
    const j = n - 1 - i;
    const side = n === 1 ? 0 : (j / (n - 1)) * 2 - 1; // -1 … 1
    const fanned = (lift: number) => ({
      x: side * 18,
      y: -rise * lift + Math.abs(side) * 8,
      rotate: side * fan,
      scale: 1,
      borderRadius: 8,
    });
    const leaving = phase === "leaving";
    if ((open || leaving) && geo?.slots[i]) {
      // Origin is the sheet's foot, so a scaled sheet's centre is half its scaled height above it.
      const footX = geo.folder.x + W / 2;
      const footY = geo.folder.y + H - FLAP - SINK + PAPER.h;
      const y = leaving && departure[i] ? departure[i].y : geo.slots[i].y;
      return {
        x: geo.slots[i].x - footX,
        y: y - footY + (PAPER.h * THUMB_SCALE) / 2,
        rotate: 0,
        scale: THUMB_SCALE,
        borderRadius: 16, // 4px once scaled
        opacity: open && landed ? 0 : leaving && departure[i] && !departure[i].seen ? 0 : 1,
      };
    }
    if (dropping) return fanned(1.15);
    if (hover) return fanned(1);
    // Back sheets sit a little higher and askew, so the closed folder looks full.
    // Closing flies straight here, one unbroken path, while the flap rises over them.
    return { x: (j - (n - 1) / 2) * 2, y: -(n - 1 - j) * 4, rotate: [-1.5, 1.2, -0.6][j % 3], scale: 1, borderRadius: 8 };
  };

  const sheetTransition = (i: number): Transition => {
    if (reduceMotion) return instant;
    const hide = { opacity: instant };
    if (open || phase === "leaving") return { ...FLY, delay: 0.04 + i * STAGGER, ...hide };
    // Home: the bottom row leaves first, each sheet shrinking back up to size on
    // the same spring as it travels, and fading in if its row was out of view.
    if (phase === "closing") return { ...HOME, delay: (n - 1 - i) * STAGGER, opacity: { duration: 0.2 } };
    return SETTLE;
  };

  // Closing, the flap fades back in still dropped, then swings up over the
  // sheets as they arrive, catching the last one just before it lands.
  const flapPose =
    open || phase === "leaving"
      ? { rotateX: -GAPE_DEG, opacity: 0 }
      : phase === "closing"
        ? { rotateX: 0, opacity: 1 }
        : { rotateX: dropping ? -Math.min(GAPE_DEG, tilt * 1.8) : hover ? -tilt : 0, opacity: 1 };
  const flapTransition: Transition = reduceMotion
    ? instant
    : open
      ? { rotateX: { duration: 0.18, ease: EASE_OUT }, opacity: { duration: 0.2, delay: 0.14 } }
      : phase === "leaving"
        ? instant
        : phase === "closing"
          ? {
              opacity: { duration: 0.25, ease: EASE_OUT, delay: 0.06 },
              rotateX: { duration: FLAP_SHUT.duration, ease: DRAWER, delay: FLAP_SHUT.delay(n) },
            }
          : { duration: 0.35, ease: EASE_OUT };

  const fade = (on: boolean, delay = 0): Transition =>
    reduceMotion ? instant : on ? { duration: 0.3, ease: EASE_OUT, delay } : { duration: 0.14, ease: EASE_OUT };

  const vars = {
    "--folder-back": `color-mix(in oklab, ${color}, black 14%)`,
    "--folder-front": `color-mix(in oklab, ${color}, white 22%)`,
    "--folder-front-top": `color-mix(in oklab, ${color}, white 34%)`,
  } as CSSProperties;

  return (
    <div ref={stage} className={cn("relative grid place-items-center", className)} style={vars} {...dropHandlers}>
      {/* ── The list. Always laid out, so its thumbnail slots can be measured, but out of flow:
          adding a file must never resize the stage and push its surroundings around. ── */}
      <div
        ref={panel}
        id={panelId}
        role="dialog"
        aria-modal={open}
        aria-label={name}
        aria-hidden={!open}
        inert={!open}
        onKeyDown={trapFocus}
        className={cn("absolute top-1/2 left-1/2 flex w-85 -translate-x-1/2 -translate-y-1/2 flex-col gap-1 p-1", !open && "pointer-events-none")}
      >
        {/* Surfaces grow and fade on their own layers, never the sheets riding over them. */}
        <motion.div
          aria-hidden
          initial={false}
          animate={open ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.94 }}
          transition={
            reduceMotion ? instant : open ? { type: "spring", duration: 0.5, bounce: 0, delay: 0.06 } : { duration: 0.3, ease: EASE_OUT, delay: 0.04 }
          }
          className={cn(
            "absolute inset-0 rounded-2xl bg-muted edge-outer transition-shadow duration-200",
            dropping && open && "ring-2 ring-foreground/15",
          )}
        />

        <div className="relative flex items-center justify-between py-2 pr-1.5 pl-3">
          <motion.span
            initial={false}
            animate={open ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 0, y: 6, filter: "blur(2px)" }}
            transition={fade(open, 0.12)}
            className="text-sm font-medium text-foreground"
          >
            {name}
          </motion.span>
          <motion.button
            type="button"
            aria-label="Close"
            onClick={close}
            initial={false}
            animate={{ opacity: open ? 1 : 0 }}
            transition={fade(open, 0.16)}
            className="grid size-7 cursor-pointer place-items-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/20"
          >
            <IconX size={16} stroke={2} />
          </motion.button>
        </div>

        <div className="relative">
          <motion.div
            aria-hidden
            initial={false}
            animate={{ opacity: open ? 1 : 0 }}
            transition={fade(open, 0.1)}
            className="absolute inset-0 rounded-xl bg-background shadow-(--edge-inner)"
          />
          {/* Scrolls past `maxRows`, but only once the sheets have landed in it. */}
          <ul
            ref={list}
            className={cn("scrollbar-soft relative flex flex-col p-1", landed ? "overflow-y-auto" : "overflow-hidden")}
            style={{ maxHeight: maxRows * ROW + 8 }}
          >
            {items.map(({ key, file }, i) => {
              const isSheet = i < n;
              return (
                <li key={key} className="shrink-0">
                  <button
                    type="button"
                    data-row
                    onClick={() => onSelect?.(file, i)}
                    className="group flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-left outline-none transition-colors hover:bg-foreground/4 focus-visible:bg-foreground/4"
                    style={{ height: ROW }}
                  >
                    {/* A sheet lands here and hands over; other files pop their thumbnail in place. */}
                    <span
                      ref={(el) => {
                        slots.current[i] = el;
                      }}
                      className="shrink-0"
                      style={{ width: THUMB.w, height: THUMB.h }}
                    >
                      {(isSheet ? landed : true) && (
                        <motion.span
                          initial={false}
                          animate={open ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.6, y: -6 }}
                          transition={
                            reduceMotion || isSheet
                              ? instant
                              : open
                                ? { ...SETTLE, delay: 0.18 + Math.min(i, 8) * STAGGER }
                                : { duration: 0.15 }
                          }
                          className={cn("block transition-transform duration-200 ease-out group-hover:-rotate-2 group-hover:scale-106", paper, tone(file))}
                          style={{ width: THUMB.w, height: THUMB.h, borderRadius: 4 }}
                        >
                          <Thumb file={file} />
                        </motion.span>
                      )}
                    </span>
                    <motion.span
                      initial={false}
                      animate={open ? { opacity: 1, x: 0, filter: "blur(0px)" } : { opacity: 0, x: -6, filter: "blur(2px)" }}
                      transition={fade(open, 0.16 + Math.min(i, 8) * STAGGER)}
                      className="flex min-w-0 flex-col"
                    >
                      <span className="truncate text-sm font-medium text-foreground">{file.name}</span>
                      {file.meta && <span className="text-xs text-muted-foreground">{file.meta}</span>}
                    </motion.span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* ── The folder's back and label. ── */}
      <motion.button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        tabIndex={open ? -1 : 0}
        onClick={openFolder}
        onPointerEnter={() => closed && setHover(true)}
        onPointerLeave={() => {
          setHover(false);
          unlean();
        }}
        onPointerMove={lean}
        onFocus={(e) => closed && e.currentTarget.matches(":focus-visible") && setHover(true)}
        onBlur={() => setHover(false)}
        initial={false}
        animate={open ? { opacity: 0, scale: 0.96 } : { opacity: 1, scale: 1 }}
        transition={reduceMotion ? instant : open ? { duration: 0.28, ease: EASE_OUT, delay: 0.1 } : { duration: 0.32, ease: EASE_OUT, delay: 0.08 }}
        className={cn(
          "relative col-start-1 row-start-1 flex cursor-pointer flex-col items-center gap-4 rounded-2xl p-3 outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
          open && "pointer-events-none",
        )}
      >
        <div ref={folderBox} className="relative" style={{ width: W, height: H }}>
          <svg className="absolute inset-0" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
            <path d={BACK} fill="var(--folder-back)" />
          </svg>
          {/* Shade inside the back, where the sheets sit. */}
          <div
            aria-hidden
            className="absolute inset-x-0 h-12 bg-linear-to-b from-black/12 to-transparent"
            style={{ top: TAB, borderTopLeftRadius: R, borderTopRightRadius: R }}
          />
        </div>
        <span className="flex flex-col items-center gap-0.5">
          <span className="text-sm font-medium text-foreground">{name}</span>
          <span className="text-xs text-muted-foreground">
            {dropping ? "Drop to add" : `${items.length} ${items.length === 1 ? "file" : "files"}`}
          </span>
        </span>
      </motion.button>

      {/* ── Sheets and flap, above both, so the sheets can travel between them. ── */}
      {geo && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <motion.div className="absolute inset-0" style={{ rotateY: leanTurn, rotateX: leanTip, transformPerspective: 900 }}>
            <AnimatePresence initial={false}>
              {[...sheets].reverse().map(({ key, file }) => {
                const i = sheets.findIndex((s) => s.key === key);
                return (
                  <motion.div
                    key={key}
                    initial={{ y: -150, opacity: 0, rotate: -4, scale: 1 }}
                    animate={{ opacity: 1, ...sheetPose(i) }}
                    exit={{ opacity: 0, transition: { duration: 0.15 } }}
                    transition={sheetTransition(i)}
                    className={cn("absolute", paper, tone(file))}
                    style={{
                      width: PAPER.w,
                      height: PAPER.h,
                      left: geo.folder.x + (W - PAPER.w) / 2,
                      top: geo.folder.y + H - FLAP - SINK,
                      originX: 0.5,
                      originY: 1,
                    }}
                  >
                    <Preview file={file} />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>

          <motion.div
            className="absolute"
            style={{ left: geo.folder.x, top: geo.folder.y + H - FLAP, width: W, height: FLAP, transformPerspective: 700, originY: 1 }}
            initial={false}
            animate={flapPose}
            transition={flapTransition}
          >
            <div className="size-full rounded-xl bg-linear-to-b from-(--folder-front-top) to-(--folder-front) shadow-[inset_0_1px_0_rgb(255_255_255/0.45),inset_0_-1px_0_rgb(0_0_0/0.06),0_-1px_6px_rgb(0_0_0/0.06)]">
              {extra > 0 && (
                <span className="absolute right-3 bottom-2.5 text-xs font-medium text-black/40 tabular-nums">+{extra}</span>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
