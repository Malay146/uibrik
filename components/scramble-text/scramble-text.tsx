"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";

gsap.registerPlugin(ScrambleTextPlugin);

export type ScrambleCharacters = "upperAndLowerCase" | "upperCase" | "lowerCase" | "numbers" | "symbols";

const CHARACTER_SETS: Record<ScrambleCharacters, string> = {
  upperAndLowerCase: "upperAndLowerCase",
  upperCase: "upperCase",
  lowerCase: "lowerCase",
  numbers: "0123456789",
  symbols: "!<>-_\\/[]{}=+*^?#",
};

export type ScrambleTextProps = {
  text: string;
  className?: string;
  /** Seconds each letter takes to settle. */
  duration?: number;
  /** Delay between letters, in seconds. */
  stagger?: number;
  /** Starting blur in px. */
  blur?: number;
  /** How fast the random characters cycle. */
  scrambleSpeed?: number;
  /** Which characters flicker before each letter lands. */
  characters?: ScrambleCharacters;
};

export function ScrambleText({
  text,
  className,
  duration = 1,
  stagger = 0.07,
  blur = 4,
  scrambleSpeed = 0.9,
  characters = "upperAndLowerCase",
}: ScrambleTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const words = text.split(" ");

  useGSAP(
    () => {
      const chars =
        containerRef.current?.querySelectorAll<HTMLSpanElement>(".char") ??
        [];

      gsap.set(chars, { opacity: 0, filter: `blur(${blur}px)` });

      chars.forEach((char, index) => {
        const finalText = char.textContent;

        gsap.to(char, {
          opacity: 1,
          filter: "blur(0px)",
          duration,
          delay: index * stagger,
          ease: "power2.out",
          scrambleText: {
            text: finalText,
            chars: CHARACTER_SETS[characters],
            speed: scrambleSpeed,
          },
        });
      });
    },
    // any change replays the reveal
    { scope: containerRef, dependencies: [text, duration, stagger, blur, scrambleSpeed, characters], revertOnUpdate: true }
  );

  return (
    <span
      ref={containerRef}
      className={className}
    >
      <span className="inline-flex flex-wrap gap-x-[0.28em]">
        {words.map((word, wordIndex) => (
          <span
            key={wordIndex}
            className="inline-flex"
          >
            {word.split("").map((char, charIndex) => (
              <span
                key={charIndex}
                className="char inline-block"
              >
                {char}
              </span>
            ))}
          </span>
        ))}
      </span>
    </span>
  );
}
