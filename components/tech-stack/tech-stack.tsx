"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { BRANDS, isInk, type Brand, type BrandKey } from "../_brands/brands";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

export type TechItem = {
  /** One of the built-in marks, or your own `{ name, color, path }` on a 24 × 24 grid. */
  brand: BrandKey | Brand;
  /** Overrides the brand's name in the label. */
  label?: string;
  href?: string;
};

export type TechStackProps = {
  items: TechItem[];
  /** Logos in their brand colours, or all in the text colour. */
  tone?: "brand" | "mono";
  size?: "sm" | "md" | "lg";
  /** Label every badge all the time instead of on hover. */
  labels?: boolean;
  /** Badges rise in one after another when the row scrolls into view. */
  animate?: boolean;
  className?: string;
};

const SIZES = {
  sm: { h: 32, icon: 16, text: "text-xs", pad: 8 },
  md: { h: 40, icon: 20, text: "text-[13px]", pad: 10 },
  lg: { h: 48, icon: 24, text: "text-sm", pad: 12 },
};

const brandOf = (b: BrandKey | Brand): Brand => (typeof b === "string" ? BRANDS[b] : b);

/**
 * A row of real brand logos for the tools behind a product. Hovering or
 * focusing a badge opens it into a pill tinted with the brand's colour and
 * names it, while its neighbours slide aside to make room.
 */
export function TechStack({ items, tone = "brand", size = "md", labels = false, animate = true, className }: TechStackProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLUListElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const [hot, setHot] = useState<number | null>(null);
  const z = SIZES[size];
  const play = animate && !reduce;

  return (
    <ul
      ref={ref}
      className={cn("flex flex-wrap items-center justify-center gap-2 [--ts-ink:#171717] dark:[--ts-ink:#fafafa]", className)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setHot(null)}
    >
      {items.map((item, i) => {
        const b = brandOf(item.brand);
        const name = item.label ?? b.name;
        const ink = tone === "mono" || isInk(b.color);
        const tint = ink ? "var(--ts-ink)" : b.color;
        const open = labels || hot === i;
        const Tag = item.href ? "a" : "span";
        return (
          <motion.li
            key={name}
            initial={play ? { opacity: 0, y: 10, scale: 0.85 } : false}
            animate={!play || inView ? { opacity: 1, y: 0, scale: 1 } : undefined}
            transition={{ type: "spring", duration: 0.5, bounce: 0.3, delay: play ? i * 0.045 : 0 }}
          >
            <Tag
              {...(item.href ? { href: item.href, target: "_blank", rel: "noopener noreferrer" } : { role: "img" })}
              tabIndex={0}
              aria-label={name}
              onPointerEnter={(e: React.PointerEvent) => e.pointerType === "mouse" && setHot(i)}
              onPointerDown={(e: React.PointerEvent) => e.pointerType !== "mouse" && setHot((h) => (h === i ? null : i))}
              onFocus={() => setHot(i)}
              onBlur={() => setHot((h) => (h === i ? null : h))}
              className={cn(
                "flex items-center rounded-full bg-neutral-100 outline-none transition-colors duration-200 ease-out dark:bg-neutral-900",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400",
                open && "bg-[color-mix(in_oklab,var(--ts-c)_12%,#f5f5f5)] dark:bg-[color-mix(in_oklab,var(--ts-c)_18%,#171717)]",
                item.href ? "cursor-pointer" : "cursor-default",
              )}
              style={{ "--ts-c": tint, height: z.h, paddingInline: (z.h - z.icon) / 2 } as CSSProperties}
            >
              <motion.svg
                viewBox="0 0 24 24"
                width={z.icon}
                height={z.icon}
                fill={ink ? "var(--ts-ink)" : b.color}
                aria-hidden
                className="shrink-0"
                animate={{ rotate: open && !labels && !reduce ? -8 : 0, scale: open && !labels && !reduce ? 1.08 : 1 }}
                transition={{ type: "spring", duration: 0.4, bounce: 0.4 }}
              >
                <path d={b.path} />
              </motion.svg>
              <motion.span
                aria-hidden
                className="overflow-hidden"
                initial={false}
                animate={{ width: open ? "auto" : 0, opacity: open ? 1 : 0 }}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { width: { type: "spring", duration: 0.35, bounce: 0.05 }, opacity: { duration: open ? 0.2 : 0.1, ease: EASE_OUT, delay: open ? 0.06 : 0 } }
                }
              >
                <span
                  className={cn("block whitespace-nowrap font-medium tracking-tight text-[color-mix(in_oklab,var(--ts-c)_70%,var(--ts-ink))]", z.text)}
                  style={{ paddingLeft: z.pad * 0.7, paddingRight: z.pad * 0.3 }}
                >
                  {name}
                </span>
              </motion.span>
            </Tag>
          </motion.li>
        );
      })}
    </ul>
  );
}
