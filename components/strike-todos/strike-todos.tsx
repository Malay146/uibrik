"use client";

import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Item = { id: number; label: string; done: boolean };

export const SAMPLE_TODOS = [
  "Design the interface",
  "Build the components",
  "Polish the details",
  "Ship it to production",
];

export type StrikeTodosProps = {
  /** To-dos listed at the start. */
  initialItems?: string[];
  placeholder?: string;
  /** Longest to-do, in characters. */
  maxLength?: number;
  /** Seconds the line takes to cross a to-do. */
  strikeDuration?: number;
  /** Fade finished to-dos so the open ones stand out. */
  dim?: boolean;
  /** Width of the list in px. */
  width?: number;
  onAdd?: (label: string) => void;
  /** Called with the to-do and its new state when it is checked or unchecked. */
  onToggle?: (label: string, done: boolean) => void;
  className?: string;
};

/** A plain to-do list: checking an item draws a line through it. */
export function StrikeTodos({
  initialItems = SAMPLE_TODOS,
  placeholder = "Add a to-do",
  maxLength = 32,
  strikeDuration = 0.35,
  dim = true,
  width = 416,
  onAdd,
  onToggle,
  className,
}: StrikeTodosProps) {
  const [items, setItems] = useState<Item[]>(() => initialItems.map((label, id) => ({ id, label, done: false })));
  const [text, setText] = useState("");
  const nextId = useRef(initialItems.length);
  const inputId = useId();

  const add = () => {
    const value = text.trim();
    if (!value) return;
    onAdd?.(value);
    setText("");
    setItems((prev) => [{ id: nextId.current++, label: value, done: false }, ...prev]);
  };

  const toggle = (item: Item) => {
    onToggle?.(item.label, !item.done);
    setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, done: !it.done } : it)));
  };

  return (
    <div className={cn("flex max-w-[calc(100vw-2rem)] flex-col", className)} style={{ width }}>
      <div className="flex items-center gap-3 pb-8">
        <input
          id={inputId}
          value={text}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-label="New to-do"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          className="h-11 min-w-0 flex-1 bg-neutral-100 px-4 text-xl font-medium tracking-tight text-zinc-700 outline-none placeholder:text-zinc-400 squircle-mask squircle-2xl squircle-smooth-xl dark:bg-neutral-800 dark:text-zinc-200 dark:placeholder:text-zinc-500"
        />
        <button
          type="button"
          aria-label="Add to-do"
          disabled={!text.trim()}
          onClick={add}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center bg-zinc-700 transition-opacity duration-150 squircle-mask squircle-2xl squircle-smooth-xl disabled:cursor-default disabled:opacity-40 dark:bg-zinc-200"
        >
          <svg viewBox="0 0 24 24" className="size-5 text-white dark:text-zinc-900" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
            <path d="M5 12h14M12 5v14" />
          </svg>
        </button>
      </div>

      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-6">
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              aria-label={item.label}
              onClick={() => toggle(item)}
              className={cn(
                "flex size-6 shrink-0 cursor-pointer items-center justify-center transition-colors duration-200 squircle-mask squircle-lg squircle-smooth-xl",
                item.done ? "bg-zinc-700 dark:bg-zinc-200" : "bg-neutral-100 dark:bg-neutral-800",
              )}
            >
              <svg
                viewBox="0 0 24 24"
                className={cn("size-3.5 text-white transition-opacity duration-150 dark:text-zinc-900", item.done ? "opacity-100" : "opacity-0")}
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </button>
            <span
              className={cn(
                "relative whitespace-nowrap text-xl font-medium tracking-tight text-zinc-700 transition-opacity dark:text-zinc-200",
                dim && item.done && "opacity-45",
              )}
              style={{ transitionDuration: `${strikeDuration}s` }}
            >
              {item.label}
              {/* the line draws left to right when checked and retracts when unchecked */}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-current transition-transform ease-out motion-reduce:transition-none",
                  item.done ? "origin-left scale-x-100" : "origin-right scale-x-0",
                )}
                style={{ transitionDuration: `${strikeDuration}s` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
