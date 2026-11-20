"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { IconArrowRight } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// Soft button. A plain button made with care: a gentle top-to-bottom gradient,
// a faint highlight along the inside of the top edge and a little shade along
// the bottom, and a crisp 1px border a step darker than the fill. Hover lifts
// the fill a touch; a press sinks it half a pixel and deepens the inner shade.

export type SoftButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Dark on light (flips in dark mode), quiet neutral, or your accent colour. */
  variant?: "primary" | "secondary" | "accent";
  /** Accent colour, for the accent variant. */
  color?: string;
  size?: "sm" | "md" | "lg";
  /** Shown before the label. */
  icon?: ReactNode;
  /** Shown after the label. */
  iconRight?: ReactNode;
  /** Corner radius, px. */
  radius?: number;
};

const SIZES = {
  sm: "h-8 gap-1.5 px-3 text-[13px]",
  md: "h-9 gap-2 px-4 text-sm",
  lg: "h-11 gap-2 px-5 text-[15px]",
} as const;

// Each variant: fill gradient, border, and the inner highlight and shade, in both themes.
const VARIANTS = {
  primary: cn(
    "text-white [--top:#3f3f46] [--mid:#2a2a2f] [--bottom:#18181b] [--edge:#09090b] [--lip:rgb(255_255_255/0.16)] [--shade:rgb(0_0_0/0.3)] [--wash:#fff]",
    // In dark mode a white fill needs more shape: a gloss on the top half, a deeper
    // fall-off toward the bottom, a firmer edge and a soft bloom so it sits on the page.
    "dark:text-zinc-900 dark:[--top:#ffffff] dark:[--mid:#f1f1f3] dark:[--bottom:#c9c9cf] dark:[--edge:#a1a1a9] dark:[--lip:rgb(255_255_255/1)] dark:[--shade:rgb(0_0_0/0.16)] dark:[--wash:#000]",
    "dark:[--drop:0_1px_2px_rgb(0_0_0/0.6),0_6px_16px_-6px_rgb(255_255_255/0.18)]",
  ),
  secondary: cn(
    "text-zinc-900 [--top:#ffffff] [--mid:#fafafa] [--bottom:#f4f4f5] [--edge:#e4e4e7] [--lip:rgb(255_255_255/1)] [--shade:rgb(0_0_0/0.05)] [--wash:#000]",
    "dark:[--drop:0_1px_2px_rgb(0_0_0/0.4)] dark:text-zinc-100 dark:[--top:#2c2c31] dark:[--mid:#252529] dark:[--bottom:#1f1f23] dark:[--edge:#3a3a40] dark:[--lip:rgb(255_255_255/0.08)] dark:[--shade:rgb(0_0_0/0.3)] dark:[--wash:#fff]",
  ),
  accent: cn(
    "text-white [--top:color-mix(in_oklab,var(--c)_82%,white)] [--mid:color-mix(in_oklab,var(--c)_91%,white)] [--bottom:var(--c)] [--edge:color-mix(in_oklab,var(--c)_72%,black)] [--lip:rgb(255_255_255/0.28)] [--shade:rgb(0_0_0/0.18)] [--wash:#fff] dark:[--drop:0_1px_2px_rgb(0_0_0/0.4)]",
  ),
} as const;

export function SoftButton({
  variant = "primary",
  color = "#4f46e5",
  size = "md",
  icon,
  iconRight = <IconArrowRight size={16} stroke={2} />,
  radius = 10,
  className,
  style,
  children = "Continue",
  ...rest
}: SoftButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center justify-center font-medium whitespace-nowrap select-none",
        // Gradient fill, the border, a soft drop, and the inner light and shade.
        "border border-(--edge) bg-[linear-gradient(180deg,var(--top),var(--mid)_48%,var(--bottom))]",
        "shadow-[inset_0_1px_0_var(--lip),inset_0_-2px_3px_var(--shade),var(--drop,0_1px_2px_rgb(0_0_0/0.08))]",
        // Hover: a faint wash over the fill (lighter on dark fills, darker on light ones). Press: sink half a pixel, deeper shade.
        "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-(--wash) after:opacity-0 after:transition-opacity after:duration-150 hover:after:opacity-[0.05]",
        "transition-[transform,box-shadow] duration-100 ease-out active:translate-y-[0.5px] active:shadow-[inset_0_1px_2px_var(--shade),inset_0_-1px_0_var(--lip)]",
        "outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      style={{ borderRadius: radius, "--c": color, ...style } as CSSProperties}
      {...rest}
    >
      {icon && (
        <span aria-hidden className="grid shrink-0 place-items-center [&_svg]:size-4">
          {icon}
        </span>
      )}
      <span className="drop-shadow-[0_1px_0_rgb(0_0_0/0.08)]">{children}</span>
      {iconRight && (
        <span aria-hidden className="grid shrink-0 place-items-center opacity-80 [&_svg]:size-4">
          {iconRight}
        </span>
      )}
    </button>
  );
}
