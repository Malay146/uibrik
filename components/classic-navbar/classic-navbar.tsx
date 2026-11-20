"use client";

// A full-width bar for any site: a hairline appears under it once the page
// scrolls, it steps out of the way while you scroll down and returns as soon
// as you scroll up, and an underline slides to the current page. On small
// screens the menu is a full-screen sheet that wipes down from under the bar,
// with large links rising in one after another. Links sit left, centred or
// right; zero, one or two CTAs.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const SPRING = { type: "spring", duration: 0.35, bounce: 0 } as const;

const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export type NavLink = { label: string; href?: string };

export type NavbarProps = {
  /** Text beside the mark. */
  brand?: string;
  /** Your own logo; replaces the default mark (the brand text still shows). */
  logo?: ReactNode;
  links?: readonly (string | NavLink)[];
  /** Where the links sit: beside the logo, centred, or beside the CTAs. */
  align?: "left" | "center" | "right";
  /** How many call-to-action buttons. */
  ctas?: "none" | "one" | "two";
  primaryLabel?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  /** Label of the current page's link. */
  current?: string;
  className?: string;
};

const DEFAULT_LINKS = ["Product", "Features", "Pricing", "Customers", "Docs"] as const;

const toLink = (l: string | NavLink): NavLink => (typeof l === "string" ? { label: l, href: "#" } : { href: "#", ...l });

/** A neutral default mark: two offset rounded squares. */
function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="14" height="14" rx="4" className="fill-foreground" />
      <rect x="8" y="8" width="14" height="14" rx="4" className="fill-foreground/35" />
    </svg>
  );
}

function Logo({ brand, logo }: { brand?: string; logo?: ReactNode }) {
  return (
    <a href="#" className={cn("flex shrink-0 items-center gap-2 rounded-lg text-[15px] font-semibold tracking-tight text-foreground", FOCUS)}>
      {logo ?? <Mark />}
      {brand && <span>{brand}</span>}
    </a>
  );
}

const BUTTON = "inline-flex h-9 shrink-0 items-center justify-center rounded-full px-4 text-sm font-medium transition-colors duration-150";

const PRIMARY = cn(BUTTON, "bg-foreground text-background hover:bg-foreground/90", FOCUS);

const SECONDARY = cn(BUTTON, "text-foreground hover:bg-muted", FOCUS);

function Ctas({
  ctas = "two",
  primaryLabel = "Get started",
  primaryHref = "#",
  secondaryLabel = "Sign in",
  secondaryHref = "#",
  stacked = false,
}: Pick<NavbarProps, "ctas" | "primaryLabel" | "primaryHref" | "secondaryLabel" | "secondaryHref"> & { stacked?: boolean }) {
  if (ctas === "none") return null;
  return (
    <div className={cn("flex items-center gap-1.5", stacked && "flex-col-reverse items-stretch gap-2")}>
      {ctas === "two" && (
        <a href={secondaryHref} className={cn(SECONDARY, stacked && "h-11 bg-muted")}>
          {secondaryLabel}
        </a>
      )}
      <a href={primaryHref} className={cn(PRIMARY, stacked && "h-11")}>
        {primaryLabel}
      </a>
    </div>
  );
}

/**
 * Lays out the three zones for an alignment. Centred links use a three-column
 * grid so they sit at the true centre whatever the logo and CTA widths are.
 * `links` and `ctas` are hidden below lg; `menu` (the mobile toggle) shows there.
 */
function Zones({
  align = "center",
  logo,
  links,
  ctas,
  menu,
  className,
}: {
  align?: NavbarProps["align"];
  logo: ReactNode;
  links: ReactNode;
  ctas: ReactNode;
  menu: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-2",
        align === "center" && "lg:grid lg:grid-cols-[1fr_auto_1fr]",
        className,
      )}
    >
      <div className="flex min-w-0 items-center">{logo}</div>
      <div
        className={cn(
          "hidden lg:flex",
          align === "left" && "ml-6",
          align === "center" && "justify-center",
          align === "right" && "ml-auto",
        )}
      >
        {links}
      </div>
      <div className={cn("hidden items-center lg:flex", align === "left" && "ml-auto", align === "center" && "justify-end", align === "right" && "ml-2")}>
        {ctas}
      </div>
      <div className="ml-auto lg:hidden">{menu}</div>
    </div>
  );
}

/** Two lines that turn into a cross. */
function MenuToggle({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  const t = { duration: 0.25, ease: EASE_OUT };
  return (
    <button
      type="button"
      aria-label={open ? "Close menu" : "Open menu"}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className={cn("grid size-9 cursor-pointer place-items-center rounded-full text-foreground transition-colors hover:bg-muted", FOCUS)}
    >
      <svg aria-hidden width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
        {/* Same commands in both states (M, L), so the lines morph rather than snap. */}
        <motion.path initial={false} animate={{ d: open ? "M4.5 4.5L13.5 13.5" : "M3 6.5L15 6.5" }} transition={t} />
        <motion.path initial={false} animate={{ d: open ? "M4.5 13.5L13.5 4.5" : "M3 11.5L15 11.5" }} transition={t} />
      </svg>
    </button>
  );
}

/** Closes the mobile menu on Escape, and once the screen is wide enough for the full bar. */
function useMenuDismiss(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && close();
    const mq = window.matchMedia("(min-width: 1024px)");
    const wide = () => mq.matches && close();
    document.addEventListener("keydown", key);
    mq.addEventListener("change", wide);
    return () => {
      document.removeEventListener("keydown", key);
      mq.removeEventListener("change", wide);
    };
  }, [open, close]);
}

/** Stops the page scrolling behind a full-screen menu, without a layout jump. */
function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    const gap = window.innerWidth - html.clientWidth;
    const prev = { overflow: html.style.overflow, paddingRight: html.style.paddingRight };
    html.style.overflow = "hidden";
    if (gap > 0) html.style.paddingRight = `${gap}px`;
    return () => {
      html.style.overflow = prev.overflow;
      html.style.paddingRight = prev.paddingRight;
    };
  }, [active]);
}

/** Mobile menu state plus the ids that tie the toggle to its panel. */
function useMobileMenu() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);
  useMenuDismiss(open, close);
  return { open, setOpen, id, toggle: () => setOpen((o) => !o), close };
}

/** Whether the page has scrolled past `threshold` px, and the last scroll direction. */
function useScroll(threshold = 8) {
  const [state, setState] = useState({ scrolled: false, down: false });
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      // Ignore tiny jitters so the direction doesn't flicker.
      const down = Math.abs(y - last) < 4 ? undefined : y > last;
      last = y;
      setState((s) => {
        const next = { scrolled: y > threshold, down: down ?? s.down };
        return next.scrolled === s.scrolled && next.down === s.down ? s : next;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return state;
}

export type ClassicNavbarProps = NavbarProps & {
  /** Slide up out of view while scrolling down; come back on scroll up. */
  hideOnScroll?: boolean;
  /** Width of the content inside the bar, in px. */
  maxWidth?: number;
  /** Called with a link's label when it's chosen (for client-side routing). */
  onNavigate?: (label: string) => void;
};

export function ClassicNavbar({
  brand = "Acme",
  logo,
  links = DEFAULT_LINKS,
  align = "left",
  ctas = "two",
  primaryLabel = "Get started",
  primaryHref,
  secondaryLabel = "Sign in",
  secondaryHref,
  current: currentProp,
  hideOnScroll = true,
  maxWidth = 1120,
  onNavigate,
  className,
}: ClassicNavbarProps) {
  const reduce = useReducedMotion();
  const { scrolled, down } = useScroll();
  const menu = useMobileMenu();
  const items = links.map(toLink);
  const [own, setOwn] = useState(currentProp ?? items[0]?.label);
  const current = currentProp ?? own;
  const [hover, setHover] = useState<string | null>(null);
  const hidden = hideOnScroll && scrolled && down && !menu.open;
  useScrollLock(menu.open);
  const cta = { ctas, primaryLabel, primaryHref, secondaryLabel, secondaryHref };
  // The underline rests on the current link and leans toward the hovered one.
  const marked = hover ?? current;

  return (
    <>
      <motion.header
        initial={false}
        animate={{ y: hidden ? "-100%" : "0%" }}
        transition={reduce ? { duration: 0 } : { duration: 0.3, ease: EASE_OUT }}
        className={cn(
          "sticky top-0 z-50 bg-background/80 backdrop-blur-xl backdrop-saturate-150 transition-shadow duration-300",
          scrolled ? "shadow-[inset_0_-1px_0_var(--border)]" : "shadow-[inset_0_-1px_0_transparent]",
          className,
        )}
      >
        <div className="relative mx-auto px-4 sm:px-6" style={{ maxWidth }}>
          <nav aria-label="Main" className="flex h-16 items-center">
            <Zones
              align={align}
              logo={<Logo brand={brand} logo={logo} />}
              links={
                <ul className="flex h-16 items-stretch gap-1" onPointerLeave={() => setHover(null)}>
                  {items.map((l) => (
                    <li key={l.label} className="relative flex">
                      <a
                        href={l.href}
                        aria-current={l.label === current ? "page" : undefined}
                        onPointerEnter={() => setHover(l.label)}
                        onFocus={() => setHover(l.label)}
                        onBlur={() => setHover(null)}
                        onClick={() => {
                          setOwn(l.label);
                          onNavigate?.(l.label);
                        }}
                        className={cn(
                          "flex items-center rounded-md px-3 text-sm transition-colors duration-150",
                          l.label === marked ? "text-foreground" : "text-muted-foreground",
                          FOCUS,
                        )}
                      >
                        {l.label}
                      </a>
                      {l.label === marked && (
                        <motion.span
                          layoutId="classic-nav-line"
                          aria-hidden
                          className={cn("absolute inset-x-3 bottom-0 h-[2px] rounded-full", hover && hover !== current ? "bg-foreground/35" : "bg-foreground")}
                          transition={SPRING}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              }
              ctas={<Ctas {...cta} />}
              menu={<MenuToggle open={menu.open} onToggle={menu.toggle} controls={menu.id} />}
            />
          </nav>
        </div>
      </motion.header>
      {/* Full-screen sheet under the bar: wipes down, then the links rise in. It sits
          outside the header because the header's blur and transform would otherwise
          make it the box that fixed children are placed in. */}
      <AnimatePresence>
        {menu.open && (
          <motion.div
            id={menu.id}
            initial={reduce ? { opacity: 0 } : { clipPath: "inset(0 0 100% 0)" }}
            animate={reduce ? { opacity: 1 } : { clipPath: "inset(0 0 0% 0)" }}
            exit={reduce ? { opacity: 0 } : { clipPath: "inset(0 0 100% 0)", transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } }}
            transition={{ duration: 0.5, ease: EASE_OUT }}
            className="fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col bg-background px-4 pb-6 pt-4 sm:px-6 lg:hidden"
          >
            <nav aria-label="Main" className="flex flex-col">
              {items.map((l, i) => (
                <motion.a
                  key={l.label}
                  href={l.href}
                  onClick={() => {
                    setOwn(l.label);
                    onNavigate?.(l.label);
                    menu.close();
                  }}
                  aria-current={l.label === current ? "page" : undefined}
                  initial={reduce ? false : { opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE_OUT, delay: reduce ? 0 : 0.12 + i * 0.05 }}
                  className={cn(
                    "flex h-16 items-center justify-between border-b border-border text-[28px] font-medium tracking-tight transition-colors",
                    l.label === current ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    FOCUS,
                  )}
                >
                  {l.label}
                  {l.label === current && <span aria-hidden className="size-2 rounded-full bg-foreground" />}
                </motion.a>
              ))}
            </nav>
            {ctas !== "none" && (
              <motion.div
                initial={reduce ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: EASE_OUT, delay: reduce ? 0 : 0.2 + items.length * 0.05 }}
                className="mt-auto"
              >
                <Ctas {...cta} stacked />
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
