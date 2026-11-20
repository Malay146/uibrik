"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import type { HighlighterCore } from "shiki/core";
import { cn } from "@/lib/utils";

// A code block for docs and landing pages. The code renders as plain text
// straight away (and on the server), then Shiki colours it in place once the
// block is near the viewport, so nothing shifts and pages with many blocks
// only pay for the ones being read. Shiki, its regex engine and each grammar
// are loaded on demand and shared by every block on the page.
//
// One soft, borderless surface: a header row (tabs or a caption, the
// language, copy) over the code. Tabs slide an underline between them and the body eases to the
// new height.
// Blocks given the same `syncKey` switch tabs together, and the choice is
// remembered, so picking pnpm once picks it everywhere. Lines can be marked,
// diffs get +/- gutters (copy gives you the result, not the patch), and long
// snippets can collapse behind a "Show all" that eases open.

export type CodeLang = "tsx" | "jsx" | "ts" | "js" | "bash" | "json" | "css" | "html" | "python" | "text";

export type CodeTab = {
  /** Shown on the tab, e.g. a file name or a package manager. */
  label: string;
  code: string;
  lang?: CodeLang;
};

export type CodeBlockProps = {
  /** A single snippet. Use `tabs` for several. */
  code?: string;
  lang?: CodeLang;
  /** Several snippets, one per tab. */
  tabs?: readonly CodeTab[];
  /** A file name or caption for a single snippet. */
  title?: string;
  /** Selected tab label (controlled). */
  value?: string;
  defaultValue?: string;
  onValueChange?: (label: string) => void;
  /** Blocks sharing a key switch tabs together and remember the choice. */
  syncKey?: string;
  lineNumbers?: boolean;
  /** 1-based line numbers to mark, e.g. [3, 4, 5]. */
  highlightLines?: readonly number[];
  /** Treat lines starting with + or - as added or removed. */
  diff?: boolean;
  /** Wrap long lines instead of scrolling sideways. */
  wrap?: boolean;
  /** Collapse to this many lines behind a "Show all" button. 0 never collapses. */
  collapseAfter?: number;
  /** The copy button. */
  copyable?: boolean;
  className?: string;
};

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const SPRING = { type: "spring", duration: 0.4, bounce: 0 } as const;
const LINE = 22; // px, matches leading-[22px]
const PAD = 28; // body padding top and bottom

// ─── Highlighter (one per page, grammars on demand) ──────────────────────────

const GRAMMARS: Record<Exclude<CodeLang, "text">, () => Promise<unknown>> = {
  tsx: () => import("shiki/langs/tsx.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  ts: () => import("shiki/langs/typescript.mjs"),
  js: () => import("shiki/langs/javascript.mjs"),
  bash: () => import("shiki/langs/bash.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  python: () => import("shiki/langs/python.mjs"),
};
const SHIKI_ID: Record<Exclude<CodeLang, "text">, string> = {
  tsx: "tsx", jsx: "jsx", ts: "typescript", js: "javascript", bash: "bash", json: "json", css: "css", html: "html", python: "python",
};

let core: Promise<HighlighterCore> | undefined;
const loaded = new Map<string, Promise<void>>();

async function highlighter(lang: Exclude<CodeLang, "text">) {
  core ??= Promise.all([import("shiki/core"), import("shiki/engine/javascript")]).then(([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
    createHighlighterCore({
      themes: [import("shiki/themes/github-light-default.mjs"), import("shiki/themes/github-dark-default.mjs")],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    }),
  );
  const h = await core;
  if (!loaded.has(lang)) loaded.set(lang, h.loadLanguage(GRAMMARS[lang]() as never));
  await loaded.get(lang);
  return h;
}

type Token = { content: string; style?: CSSProperties };

const tokenCache = new Map<string, Token[][]>();

async function tokenize(code: string, lang: CodeLang): Promise<Token[][] | null> {
  if (lang === "text") return null;
  const key = `${lang}\0${code}`;
  const hit = tokenCache.get(key);
  if (hit) return hit;
  const h = await highlighter(lang);
  const { tokens } = h.codeToTokens(code, {
    lang: SHIKI_ID[lang],
    themes: { light: "github-light-default", dark: "github-dark-default" },
    defaultColor: false,
  });
  const out = tokens.map((line) => line.map((t) => ({ content: t.content, style: t.htmlStyle as CSSProperties | undefined })));
  tokenCache.set(key, out);
  return out;
}

// ─── Synced tabs (shared across blocks, remembered per browser) ──────────────

const synced = new Map<string, string>();
const listeners = new Set<() => void>();
const STORE = "code-block:";

function readSynced(key: string) {
  if (!synced.has(key)) {
    try {
      const v = localStorage.getItem(STORE + key);
      if (v) synced.set(key, v);
    } catch {}
  }
  return synced.get(key);
}

function writeSynced(key: string, label: string) {
  synced.set(key, label);
  try {
    localStorage.setItem(STORE + key, label);
  } catch {}
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// ─── Diff ─────────────────────────────────────────────────────────────────────

type Kind = "add" | "remove" | null;

function parse(code: string, diff: boolean) {
  const raw = code.replace(/\n$/, "").split("\n");
  if (!diff) return { lines: raw, kinds: raw.map((): Kind => null) };
  const kinds = raw.map((l): Kind => (l.startsWith("+") ? "add" : l.startsWith("-") ? "remove" : null));
  // Drop the marker column (and the space that usually pads unchanged lines).
  const lines = raw.map((l) => (l.startsWith("+") || l.startsWith("-") || l.startsWith(" ") ? l.slice(1) : l));
  return { lines, kinds };
}

/** What the copy button writes: for a diff, the code after the change. */
const result = (lines: string[], kinds: Kind[]) => lines.filter((_, i) => kinds[i] !== "remove").join("\n");

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}

/** An element's border-box size, kept current with a ResizeObserver. */
function useSize() {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    const read = () => setSize((s) => (s.w === el.offsetWidth && s.h === el.offsetHeight ? s : { w: el.offsetWidth, h: el.offsetHeight }));
    read();
    ro.current = new ResizeObserver(read);
    ro.current.observe(el);
  }, []);
  return [ref, size] as const;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CodeBlock({
  code = "",
  lang = "tsx",
  tabs,
  title,
  value,
  defaultValue,
  onValueChange,
  syncKey,
  lineNumbers = true,
  highlightLines,
  diff = false,
  wrap = false,
  collapseAfter = 0,
  copyable = true,
  className,
}: CodeBlockProps) {
  const uid = useId();
  const list: readonly CodeTab[] = tabs?.length ? tabs : [{ label: title ?? "", code, lang }];
  const labels = list.map((t) => t.label);

  const [inner, setInner] = useState(defaultValue ?? labels[0]);
  const shared = useSyncExternalStore(
    subscribe,
    () => (syncKey ? readSynced(syncKey) : undefined),
    () => undefined,
  );
  const wanted = value ?? (shared && labels.includes(shared) ? shared : inner);
  const current = list.find((t) => t.label === wanted) ?? list[0];

  const select = (label: string) => {
    if (value === undefined) setInner(label);
    if (syncKey) writeSynced(syncKey, label);
    onValueChange?.(label);
  };

  const { lines, kinds } = parse(current.code, diff);
  const curLang = current.lang ?? lang;

  // Colour in once the block is close to the viewport.
  const root = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = root.current;
    if (!el || near) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setNear(true), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);

  const source = lines.join("\n");
  const [tokens, setTokens] = useState<{ key: string; lines: Token[][] } | null>(null);
  const tokenKey = `${curLang}\0${source}`;
  useEffect(() => {
    if (!near || curLang === "text") return;
    let live = true;
    tokenize(source, curLang).then(
      (t) => live && t && setTokens({ key: tokenKey, lines: t }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [near, source, curLang, tokenKey]);
  // Warm the other tabs so switching never shows them uncoloured.
  const others = list.filter((t) => t !== current).map((t) => [parse(t.code, diff).lines.join("\n"), t.lang ?? lang] as const);
  const othersKey = others.map(([s, l]) => `${l}\0${s}`).join("\u0001");
  useEffect(() => {
    if (!near) return;
    const id = setTimeout(() => others.forEach(([s, l]) => tokenize(s, l).catch(() => {})), 200);
    return () => clearTimeout(id);
    // othersKey stands in for `others`, which is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, othersKey]);
  const colored = tokens?.key === tokenKey ? tokens.lines : (tokenCache.get(tokenKey) ?? null);

  // Collapsing.
  const [expanded, setExpanded] = useState(false);
  const collapsible = collapseAfter > 0 && lines.length > collapseAfter + 2;
  const folded = collapsible && !expanded;
  const [contentRef, bounds] = useSize();
  const full = bounds.h;
  const height = full === 0 ? undefined : folded ? Math.min(full, collapseAfter * LINE + PAD) : full;

  // Which way the code slides when the tab changes.
  const index = labels.indexOf(current.label);
  const [prev, setPrev] = useState(index);
  const [dir, setDir] = useState(1);
  if (prev !== index) {
    setPrev(index);
    setDir(index > prev ? 1 : -1);
  }

  const marked = new Set(highlightLines);
  const digits = String(lines.length).length;
  const multi = list.length > 1;
  const caption = multi ? null : list[0].label;
  const showHeader = multi || !!caption || copyable;

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={root}
        className={cn("w-full min-w-0 overflow-hidden rounded-3xl bg-neutral-100 text-foreground dark:bg-neutral-900", className)}
      >
        {showHeader && (
          <div className="flex h-12 items-center gap-2 px-2 pt-2">
            {multi ? (
              <div role="tablist" aria-label="Code" className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none]">
                {list.map((t, i) => {
                  const on = i === index;
                  return (
                    <button
                      key={t.label}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      aria-controls={`${uid}-panel`}
                      tabIndex={on ? 0 : -1}
                      data-tab={t.label}
                      onClick={() => select(t.label)}
                      onKeyDown={(e) => {
                        const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? labels.length - 1 : null;
                        if (to === null) return;
                        e.preventDefault();
                        const next = labels[(to + labels.length) % labels.length];
                        select(next);
                        e.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(next)}"]`)?.focus();
                      }}
                      className={cn(
                        "relative h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-neutral-400",
                        on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {on && (
                        <motion.span
                          layoutId={`${uid}-tab`}
                          aria-hidden
                          className="absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.06)] dark:bg-white/[0.08] dark:shadow-none"
                          transition={SPRING}
                        />
                      )}
                      <span className="relative">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <span className="min-w-0 flex-1 truncate pl-2.5 font-mono text-[13px] text-muted-foreground">{caption}</span>
            )}
            {curLang !== "text" && (
              <span className="relative hidden h-5 shrink-0 overflow-hidden font-mono text-xs text-muted-foreground sm:block">
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={curLang}
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -8, opacity: 0 }}
                    transition={{ duration: 0.2, ease: EASE_OUT }}
                    className="block leading-5"
                  >
                    {curLang}
                  </motion.span>
                </AnimatePresence>
              </span>
            )}
            {copyable && <Copy text={result(lines, kinds)} />}
          </div>
        )}

        <motion.div
          id={`${uid}-panel`}
          role={multi ? "tabpanel" : undefined}
          initial={false}
          animate={{ height: height ?? "auto" }}
          transition={SPRING}
          className="relative overflow-hidden"
        >
          <div ref={contentRef}>
            <AnimatePresence initial={false} mode="popLayout" custom={dir}>
              <motion.div
                key={current.label}
                custom={dir}
                variants={SLIDE}
                initial="enter"
                animate="center"
                exit="exit"
                className={cn("overscroll-x-contain", wrap ? "overflow-x-hidden" : "overflow-x-auto")}
                style={{ paddingBlock: PAD / 2 }}
              >
                <pre
                  className={cn(
                    "m-0 min-w-full bg-transparent font-mono text-[13px] leading-[22px]",
                    wrap ? "whitespace-pre-wrap break-words" : "w-max whitespace-pre",
                    "[&_[data-t]]:text-(--shiki-light) dark:[&_[data-t]]:text-(--shiki-dark)",
                  )}
                >
                  <code>
                    {lines.map((line, i) => {
                      const kind = kinds[i];
                      const mark = marked.has(i + 1);
                      return (
                        <span
                          key={i}
                          className={cn(
                            "flex pr-6",
                            !lineNumbers && !diff && "pl-5",
                            mark && "bg-black/[0.04] shadow-[inset_2px_0_0_var(--color-neutral-400)] dark:bg-white/[0.05] dark:shadow-[inset_2px_0_0_var(--color-neutral-500)]",
                            kind === "add" && "bg-emerald-500/[0.08] dark:bg-emerald-400/[0.08]",
                            kind === "remove" && "bg-red-500/[0.07] dark:bg-red-400/[0.08]",
                          )}
                        >
                          {lineNumbers && (
                            <span
                              aria-hidden
                              className={cn(
                                "shrink-0 select-none pl-5 pr-4 text-right tabular-nums",
                                mark ? "text-muted-foreground" : "text-muted-foreground/45",
                              )}
                              style={{ width: `calc(${digits}ch + 2.25rem)` }}
                            >
                              {i + 1}
                            </span>
                          )}
                          {diff && (
                            <span
                              aria-hidden
                              className={cn(
                                "w-5 shrink-0 select-none",
                                !lineNumbers && "ml-4",
                                kind === "add" ? "text-emerald-600 dark:text-emerald-400" : kind === "remove" ? "text-red-600 dark:text-red-400" : "",
                              )}
                            >
                              {kind === "add" ? "+" : kind === "remove" ? "−" : ""}
                            </span>
                          )}
                          <span className={cn("min-w-0", kind === "remove" && "opacity-55")}>
                            {colored?.[i]
                              ? colored[i].map((t, j) => (
                                  <span key={j} data-t="" style={t.style}>
                                    {t.content}
                                  </span>
                                ))
                              : line}
                            {line === "" && "​"}
                          </span>
                        </span>
                      );
                    })}
                  </code>
                </pre>
              </motion.div>
            </AnimatePresence>
          </div>

          <motion.div
            aria-hidden
            initial={false}
            animate={{ opacity: folded ? 1 : 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-neutral-100 to-transparent dark:from-neutral-900"
          />
        </motion.div>

        {collapsible && (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`${uid}-panel`}
            onClick={() => {
              setExpanded((v) => !v);
              if (expanded) root.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            }}
            className="flex h-11 w-full items-center justify-center gap-1.5 text-[13px] font-medium text-muted-foreground outline-none transition-colors duration-150 hover:bg-black/[0.03] hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-400 dark:hover:bg-white/[0.03]"
          >
            <span className="relative h-5 overflow-hidden">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span
                  key={expanded ? "less" : "more"}
                  initial={{ y: expanded ? -12 : 12, opacity: 0, filter: "blur(2px)" }}
                  animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                  exit={{ y: expanded ? 12 : -12, opacity: 0, filter: "blur(2px)" }}
                  transition={{ duration: 0.25, ease: EASE_OUT }}
                  className="block whitespace-nowrap leading-5"
                >
                  {expanded ? "Show less" : `Show all ${lines.length} lines`}
                </motion.span>
              </AnimatePresence>
            </span>
            <motion.svg
              aria-hidden
              width={14}
              height={14}
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={SPRING}
            >
              <path d="M3.5 5.25 7 8.75l3.5-3.5" />
            </motion.svg>
          </button>
        )}
      </div>
    </MotionConfig>
  );
}

// Tab changes: the code slides a few px the way the tabs moved, with a light blur.
const SLIDE = {
  enter: (d: number) => ({ opacity: 0, x: d * 12, filter: "blur(3px)" }),
  center: { opacity: 1, x: 0, filter: "blur(0px)", transition: { duration: 0.28, ease: EASE_OUT } },
  exit: (d: number) => ({ opacity: 0, x: d * -12, filter: "blur(3px)", transition: { duration: 0.16, ease: EASE_OUT } }),
};

// The copy button grows to fit "Copied" beside the icon, then shrinks back.
function Copy({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [ref, { w: width }] = useSize();
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <motion.button
      type="button"
      aria-label={copied ? "Copied" : "Copy code"}
      onClick={async () => {
        if (!(await writeClipboard(text))) return;
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1600);
      }}
      whileTap={{ scale: 0.95 }}
      initial={false}
      animate={{ width: width || "auto" }}
      transition={{ type: "spring", duration: 0.35, bounce: 0 }}
      className="relative h-8 shrink-0 overflow-hidden rounded-full text-muted-foreground outline-none transition-colors duration-150 hover:bg-black/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-neutral-400 pointer-coarse:h-10 dark:hover:bg-white/[0.06]"
    >
      <span ref={ref} className="flex h-full w-max items-center gap-1.5 px-2">
        <CopyIcon copied={copied} />
        <AnimatePresence initial={false} mode="popLayout">
          {copied && (
            <motion.span
              key="copied"
              initial={{ opacity: 0, x: -4, filter: "blur(2px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -4, filter: "blur(2px)", transition: { duration: 0.12 } }}
              transition={{ duration: 0.25, ease: EASE_OUT, delay: 0.05 }}
              className="pr-0.5 text-[13px] font-medium text-foreground"
            >
              Copied
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </motion.button>
  );
}

// One icon that changes in place: the back sheet slides onto the front one,
// both fold away, and a check draws in where they met.
function CopyIcon({ copied }: { copied: boolean }) {
  const t = { duration: 0.25, ease: EASE_OUT };
  return (
    <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 overflow-visible">
      <motion.path
        d="M16 8V6a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v7a3 3 0 0 0 3 3h2"
        initial={false}
        animate={copied ? { x: 5, y: 5, opacity: 0 } : { x: 0, y: 0, opacity: 0.55 }}
        transition={t}
      />
      <motion.rect
        x={8}
        y={8}
        width={13}
        height={13}
        rx={3}
        initial={false}
        animate={copied ? { x: -2.5, y: -2.5, opacity: 0, scale: 0.6 } : { x: 0, y: 0, opacity: 1, scale: 1 }}
        transition={t}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      />
      <motion.path
        d="M5.5 12.5l4.5 4.5 8.5-10"
        className="text-foreground"
        initial={false}
        animate={copied ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
        transition={copied ? { duration: 0.3, ease: EASE_OUT, delay: 0.12 } : { duration: 0.15 }}
      />
    </svg>
  );
}
