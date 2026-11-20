"use client";

import { IconDownload, IconLink, IconPrinter } from "@tabler/icons-react";
import React, { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import useMeasure from "react-use-measure";

// Icons: Tabler Icons (MIT).
const DownloadIcon = ({ className }: { className?: string }) => (
  <IconDownload aria-hidden="true" size={18} stroke={1.75} className={className} />
);

const LinkIcon = ({ className }: { className?: string }) => (
  <IconLink aria-hidden="true" size={18} stroke={1.75} className={className} />
);

const PrintIcon = ({ className }: { className?: string }) => (
  <IconPrinter aria-hidden="true" size={18} stroke={1.75} className={className} />
);

// Round up to an even integer so that centering (a 50% split of the box) always
// lands on a whole pixel instead of a half pixel.
const toEven = (value: number) => Math.ceil(value / 2) * 2;

// The size spring dips ~1px under its target on the way to settling. Without
// slack the pill would clip its own centered content at that moment, which
// shimmers along the options' left edge where the icons all line up.
const CLIP_SLACK = 2;

export type ShareOption = {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  onSelect?: () => void;
};

const OPTIONS: ShareOption[] = [
  { label: "Copy Link", Icon: LinkIcon },
  { label: "Download", Icon: DownloadIcon },
  { label: "Print", Icon: PrintIcon },
];

// Shared by the real rows and their hidden measuring twin so the two cannot
// drift apart — any difference would make the pill animate to the wrong size.
const optionListClassName = "flex flex-col gap-2 px-5 py-3";
const optionRowClassName = "flex items-center gap-2.5 whitespace-nowrap";
// 1em, so icons track the text size and sit centred on the 20px glyphs.
const iconClassName = "size-[1em] shrink-0";

export type ShareMenuProps = {
  /** Text on the closed pill. */
  label?: string;
  /** Rows in the open menu. */
  options?: ShareOption[];
  /** Seconds the pill takes to resize. */
  duration?: number;
  /** Spring bounce of the resize. */
  bounce?: number;
  /** Blur in px as the label and options swap. */
  blur?: number;
};

export function ShareMenu({
  label = "Share",
  options = OPTIONS,
  duration = 0.5,
  bounce = 0,
  blur = 4,
}: ShareMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  // Reduced motion: no blur, and the pill snaps to size instead of springing.
  const swapBlur = reduceMotion ? 0 : blur;

  const [shareRef, shareBounds] = useMeasure();
  const [optionsRef, optionsBounds] = useMeasure();

  const shareWidth = toEven(shareBounds.width);
  const shareHeight = toEven(shareBounds.height);
  const optionsWidth = toEven(optionsBounds.width);
  const optionsHeight = toEven(optionsBounds.height);

  return (
    <>
      {/* Hidden measuring elements — must mirror the real ones exactly */}
      <div className="pointer-events-none absolute -z-50 opacity-0">
        <div
          ref={shareRef}
          className="w-fit px-5 py-3 text-xl font-medium tracking-[-0.02em]"
        >
          {label}
        </div>

        <div
          ref={optionsRef}
          className={`${optionListClassName} w-fit text-xl font-medium tracking-[-0.02em]`}
        >
          {options.map(({ label, Icon }, i) => (
            <div key={`${i}-${label}`} className={optionRowClassName}>
              <Icon className={iconClassName} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <motion.div
        animate={{
          width: (isOpen ? optionsWidth : shareWidth) + CLIP_SLACK,
          height: (isOpen ? optionsHeight : shareHeight) + CLIP_SLACK,
        }}
        initial={false}
        whileTap={isOpen ? undefined : { scale: 0.95 }}
        transition={{
          ...(reduceMotion ? { duration: 0 } : { type: "spring", duration, bounce }),
          scale: {
            duration: 0.15,
          },
        }}
        className="relative overflow-hidden squircle-mask squircle-3xl bg-muted text-xl font-medium tracking-[-0.02em] transform-gpu [backface-visibility:hidden] [will-change:transform]"
      >
        <AnimatePresence mode="wait" initial={false}>
          {!isOpen ? (
            <motion.button
              key="share"
              onClick={() => setIsOpen(true)}
              initial={{
                opacity: 0,
                filter: `blur(${swapBlur}px)`,
              }}
              animate={{
                opacity: 1,
                filter: "blur(0px)",
              }}
              exit={{
                opacity: 1,
                filter: "blur(0px)",
              }}
              transition={{
                duration: 0.1,
              }}
              style={{
                width: shareWidth,
                height: shareHeight,
                x: "-50%",
                y: "-50%",
              }}
              className="absolute left-1/2 top-1/2 flex cursor-pointer items-center justify-center whitespace-nowrap px-6 py-3 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100 transition-colors [backface-visibility:hidden]"
            >
              {label}
            </motion.button>
          ) : (
            <motion.div
              key="options"
              initial={{
                opacity: 1,
                filter: "blur(0px)",
              }}
              animate={{
                opacity: 1,
                filter: "blur(0px)",
              }}
              exit={{
                opacity: 0,
                filter: `blur(${swapBlur}px)`,
              }}
              transition={{
                duration: 0.1,
              }}
              style={{
                width: optionsWidth,
                height: optionsHeight,
                x: "-50%",
                y: "-50%",
              }}
              className={`${optionListClassName} absolute left-1/2 top-1/2 justify-center text-neutral-500 dark:text-neutral-400 [backface-visibility:hidden]`}
            >
              {options.map(({ label, Icon, onSelect }, i) => (
                <button
                  key={`${i}-${label}`}
                  onClick={() => {
                    onSelect?.();
                    setIsOpen(false);
                  }}
                  className={`${optionRowClassName} origin-left cursor-pointer transition-[color,scale] duration-150 ease-out hover:text-neutral-800 active:scale-[0.97] dark:hover:text-neutral-100`}
                >
                  <Icon className={iconClassName} />
                  <span>{label}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
}
