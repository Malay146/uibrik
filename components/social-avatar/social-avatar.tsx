"use client";

import { IconCheck } from "@tabler/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { BRANDS, isInk, type Brand, type BrandKey } from "../_brands/brands";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export type SocialLink = {
  /** One of the built-in marks, or your own `{ name, color, path }` on a 24 × 24 grid. */
  brand: BrandKey | Brand;
  /** Shown above the mark, and what a press copies when there's no href. */
  handle: string;
  /** Open this link instead of copying the handle. */
  href?: string;
};

export type SocialAvatarProps = {
  /** Avatar image. Without one, the initials show. */
  src?: string;
  name: string;
  /** Line under the name. */
  subtitle?: string;
  links: SocialLink[];
  /** Avatar diameter in px. */
  size?: number;
  /** Width of the arc the marks fan across, in degrees. */
  spread?: number;
  /** What opens the marks. Touch always opens on tap. */
  trigger?: "hover" | "click";
  /** Controlled open state. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Called after a handle is copied. */
  onCopy?: (link: SocialLink) => void;
  className?: string;
};

const TILE = 40;
const GAP = 18;

const brandOf = (b: BrandKey | Brand): Brand => (typeof b === "string" ? BRANDS[b] : b);

/**
 * An avatar that fans the person's social accounts out of itself along an arc.
 * Each mark is the real logo in its own colour; pressing one copies the handle
 * (or opens the link), and the label above it turns into a check.
 */
export function SocialAvatar({
  src,
  name,
  subtitle,
  links,
  size = 72,
  spread = 150,
  trigger = "hover",
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  onCopy,
  className,
}: SocialAvatarProps) {
  const reduce = useReducedMotion();
  const [inner, setInner] = useState(defaultOpen);
  const open = openProp ?? inner;
  const [copied, setCopied] = useState<number | null>(null);
  const [hot, setHot] = useState<number | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const leave = useRef<ReturnType<typeof setTimeout>>(undefined);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const listId = useId();

  const setOpen = (v: boolean) => {
    clearTimeout(leave.current);
    if (v === open) return;
    if (openProp === undefined) setInner(v);
    onOpenChange?.(v);
    if (!v) setHot(null);
  };

  useEffect(() => () => {
    clearTimeout(leave.current);
    clearTimeout(copyTimer.current);
  }, []);

  // Escape and presses outside close it.
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  });

  // Marks sit on an arc centred above the avatar, far enough out that
  // neighbours never touch however many there are.
  const n = links.length;
  const arc = n > 1 ? Math.min(Math.max(spread, (n - 1) * 30), 300) : 0;
  const step = n > 1 ? (arc / (n - 1)) * (Math.PI / 180) : 0;
  const reach = Math.max(size / 2 + GAP + TILE / 2, n > 1 ? (TILE + 8) / step : 0);
  const pos = links.map((_, i) => {
    const a = (-90 - arc / 2) * (Math.PI / 180) + i * step;
    return { x: Math.cos(a) * reach, y: Math.sin(a) * reach };
  });

  const press = async (link: SocialLink, i: number) => {
    if (link.href) return;
    try {
      await navigator.clipboard?.writeText(link.handle);
    } catch {
      return;
    }
    setCopied(i);
    onCopy?.(link);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(null), 1400);
  };

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

  return (
    <div
      ref={root}
      className={cn("relative inline-flex flex-col items-center gap-3", className)}
      onPointerEnter={(e) => trigger === "hover" && e.pointerType === "mouse" && setOpen(true)}
      onPointerLeave={(e) => {
        if (trigger !== "hover" || e.pointerType !== "mouse") return;
        clearTimeout(leave.current);
        leave.current = setTimeout(() => setOpen(false), 160);
      }}
    >
      <div className="relative" style={{ width: size, height: size }}>
        {/* Marks start tucked behind the avatar and spring out to the arc. */}
        <ul id={listId} aria-label={`${name} elsewhere`} className="absolute left-1/2 top-1/2 size-0">
          <AnimatePresence>
            {open &&
              links.map((link, i) => {
                const b = brandOf(link.brand);
                const ink = isInk(b.color);
                const out = i - (n - 1) / 2;
                const label = copied === i ? "Copied" : link.handle;
                const Tag = link.href ? "a" : "button";
                return (
                  <motion.li
                    key={b.name + link.handle}
                    className="absolute"
                    style={{ left: -TILE / 2, top: -TILE / 2, zIndex: hot === i ? 2 : 1 }}
                    initial={reduce ? { opacity: 0 } : { x: 0, y: 0, scale: 0.4, opacity: 0, rotate: out * -24 }}
                    animate={{ x: pos[i].x, y: pos[i].y, scale: 1, opacity: 1, rotate: 0 }}
                    exit={
                      reduce
                        ? { opacity: 0, transition: { duration: 0.1 } }
                        : { x: 0, y: 0, scale: 0.4, opacity: 0, transition: { duration: 0.2, ease: EASE_OUT, delay: (n - 1 - i) * 0.015 } }
                    }
                    transition={reduce ? { duration: 0.15 } : { type: "spring", duration: 0.5, bounce: 0.28, delay: Math.abs(out) * 0.035 }}
                  >
                    <Tag
                      {...(link.href ? { href: link.href, target: "_blank", rel: "noopener noreferrer" } : { type: "button" as const })}
                      aria-label={link.href ? `${b.name}: ${link.handle}` : `Copy ${b.name} handle ${link.handle}`}
                      onClick={() => press(link, i)}
                      onPointerEnter={() => setHot(i)}
                      onPointerLeave={() => setHot((h) => (h === i ? null : h))}
                      onFocus={() => setHot(i)}
                      onBlur={() => setHot((h) => (h === i ? null : h))}
                      className={cn(
                        "flex cursor-pointer items-center justify-center rounded-full outline-none transition-transform duration-150 ease-out hover:scale-110 active:scale-95",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400",
                        ink ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "text-white",
                      )}
                      style={{ width: TILE, height: TILE, backgroundColor: ink ? undefined : b.color }}
                    >
                      <svg viewBox="0 0 24 24" width={18} height={18} fill="currentColor" aria-hidden>
                        <path d={b.path} />
                      </svg>
                    </Tag>
                    {/* The handle floats above whichever mark you're on. */}
                    <AnimatePresence>
                      {(hot === i || copied === i) && (
                        <motion.span
                          aria-hidden
                          className="pointer-events-none absolute bottom-full left-1/2 mb-2 flex items-center gap-1 whitespace-nowrap rounded-full bg-neutral-900 px-2.5 py-1 text-xs font-medium tracking-tight text-white dark:bg-white dark:text-neutral-900"
                          initial={{ opacity: 0, x: "-50%", y: 4 }}
                          animate={{ opacity: 1, x: "-50%", y: 0 }}
                          exit={{ opacity: 0, x: "-50%", y: 2, transition: { duration: 0.1 } }}
                          transition={{ duration: reduce ? 0 : 0.16, ease: EASE_OUT }}
                        >
                          <AnimatePresence mode="popLayout" initial={false}>
                            <motion.span
                              key={label}
                              className="flex items-center gap-1"
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -6 }}
                              transition={{ duration: reduce ? 0 : 0.18, ease: EASE_OUT }}
                            >
                              {copied === i && <IconCheck size={12} stroke={2.5} />}
                              {label}
                            </motion.span>
                          </AnimatePresence>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.li>
                );
              })}
          </AnimatePresence>
        </ul>
        <motion.button
          type="button"
          aria-label={`${name}: ${open ? "hide" : "show"} social accounts`}
          aria-expanded={open}
          aria-controls={listId}
          onClick={(e) => {
            // Mouse hover already opened it; a click there shouldn't snap it shut.
            if (trigger === "hover" && (e.nativeEvent as PointerEvent).pointerType === "mouse") return setOpen(true);
            setOpen(!open);
          }}
          animate={{ scale: open && !reduce ? 0.94 : 1 }}
          transition={{ type: "spring", duration: 0.35, bounce: 0.3 }}
          className="relative z-[3] block size-full cursor-pointer rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="" width={size} height={size} decoding="async" draggable={false} className="size-full rounded-full bg-neutral-100 object-cover dark:bg-neutral-800" />
          ) : (
            <span className="flex size-full items-center justify-center rounded-full bg-neutral-100 font-medium tracking-tight text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300" style={{ fontSize: size * 0.34 }}>
              {initials}
            </span>
          )}
        </motion.button>
      </div>
      <div className="flex flex-col items-center">
        <span className="text-[15px] font-medium tracking-tight text-neutral-900 dark:text-neutral-100">{name}</span>
        {subtitle && <span className="text-[13px] tracking-tight text-neutral-500 dark:text-neutral-400">{subtitle}</span>}
      </div>
    </div>
  );
}
