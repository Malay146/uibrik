"use client";

import { type ReactNode, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { IconChevronRight, IconCornerDownLeft, IconSearch } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export type CommandItem = {
  id: string;
  label: string;
  /** Which filter the item belongs to. Also picks its group heading. */
  type: string;
  icon?: ReactNode;
  /** Quiet text after the label. Searched, but never highlighted. */
  description?: string;
  /** Extra words that find the item, e.g. "add member" for "Invite teammate". */
  keywords?: string[];
  /** Keys shown on the right, one chip each. "mod" becomes ⌘ or Ctrl. With `hotkeys` on, ["mod", "N"] is a chord and ["G", "D"] a sequence. */
  shortcut?: string[];
  /** Shown dimmed and skipped by the keyboard; it can't be run. */
  disabled?: boolean;
  /** Opens a nested page of commands instead of running. */
  children?: CommandItem[];
  onSelect?: () => void;
};

export type CommandFilter = {
  id: string;
  label: string;
};

/** Every piece of text the menu shows. `{query}` and `{count}` are filled in. */
export type CommandLabels = {
  /** Accessible name of the dialog. */
  dialog: string;
  /** The chip beside the field. */
  esc: string;
  /** Field placeholder inside a nested page. */
  nestedPlaceholder: string;
  /** Heading above recently run commands. */
  recent: string;
  /** The first filter pill. */
  all: string;
  empty: string;
  emptyHint: string;
  /** Button in the empty state when another filter has matches. */
  showAll: string;
  /** Empty list with no search yet. */
  nothingYet: string;
  /** While `onSearch` is loading and nothing has matched yet. */
  searching: string;
  /** When `onSearch` rejects. */
  failed: string;
  navigate: string;
  select: string;
  back: string;
  filter: string;
  result: string;
  results: string;
};

export const SAMPLE_FILTERS: CommandFilter[] = [
  { id: "docs", label: "Get started" },
  { id: "components", label: "Components" },
  { id: "actions", label: "Actions" },
];

export const SAMPLE_ITEMS: CommandItem[] = [
  { id: "intro", type: "docs", label: "Introduction", keywords: ["overview", "about"] },
  { id: "install", type: "docs", label: "Installation", keywords: ["setup", "cli", "npm"] },
  { id: "theming", type: "docs", label: "Theming", keywords: ["colors", "tokens", "dark"] },
  { id: "mcp", type: "docs", label: "MCP", keywords: ["assistant", "ai"] },
  { id: "changelog", type: "docs", label: "Changelog", keywords: ["releases", "updates"] },

  { id: "blur-reveal", type: "components", label: "Blur Reveal", description: "Entrances" },
  { id: "domino-letters", type: "components", label: "Domino Letters", description: "Entrances" },
  { id: "fade-in", type: "components", label: "Fade In Left to Right", description: "Entrances" },
  { id: "bookmark", type: "components", label: "Bookmark Button", description: "Buttons" },
  { id: "tactile", type: "components", label: "Tactile Toggle", description: "Buttons" },
  { id: "otp", type: "components", label: "OTP Input", description: "Inputs" },

  { id: "copy-link", type: "actions", label: "Copy link to this page", shortcut: ["mod", "shift", "C"], keywords: ["url", "share"] },
  {
    id: "theme",
    type: "actions",
    label: "Change theme",
    keywords: ["dark", "light", "appearance"],
    children: [
      { id: "theme-light", type: "actions", label: "Light" },
      { id: "theme-dark", type: "actions", label: "Dark" },
      { id: "theme-system", type: "actions", label: "System" },
    ],
  },
];


export const DEFAULT_LABELS: CommandLabels = {
  dialog: "Command menu",
  esc: "Esc",
  nestedPlaceholder: "Search…",
  recent: "Recent",
  all: "All",
  empty: "No results for “{query}”",
  emptyHint: "Check the spelling or try a different word.",
  showAll: "Show all {count}",
  nothingYet: "Nothing here yet",
  searching: "Searching…",
  failed: "Some results couldn't be loaded.",
  navigate: "Navigate",
  select: "Select",
  back: "Back",
  filter: "Filter",
  result: "result",
  results: "results",
};

const fill = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

// ─── Search ───────────────────────────────────────────────────────────────────

type Hit = { item: CommandItem; score: number; /** Matched positions in the label, for highlighting. */ idx: number[] | null };

const WORD_START = /[\s\-_/.]/;

/** Substring first (best), then letters in order ("nd" finds "New document"). */
function match(query: string, text: string): { score: number; idx: number[] } | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const at = t.indexOf(q);
  if (at !== -1) {
    const bonus = at === 0 ? 30 : WORD_START.test(t[at - 1]) ? 15 : 0;
    return { score: 100 + bonus - at * 0.5, idx: Array.from({ length: q.length }, (_, i) => at + i) };
  }
  const letters = q.replace(/\s/g, "");
  if (letters.length < 2) return null;
  const idx: number[] = [];
  let score = 0;
  let from = 0;
  for (const ch of letters) {
    const found = t.indexOf(ch, from);
    if (found === -1) return null;
    const run = idx.length > 0 && found === idx[idx.length - 1] + 1;
    const start = found === 0 || WORD_START.test(t[found - 1]);
    score += 10 + (run ? 8 : 0) + (start ? 6 : 0);
    idx.push(found);
    from = found + 1;
  }
  return { score, idx };
}

function rank(items: CommandItem[], query: string): Hit[] {
  const q = query.trim();
  if (!q) return items.map((item) => ({ item, score: 0, idx: null }));
  const hits: Hit[] = [];
  for (const item of items) {
    const byLabel = match(q, item.label);
    let best: Hit | null = byLabel ? { item, score: byLabel.score, idx: byLabel.idx } : null;
    // Descriptions and keywords only count as whole substrings, and rank below a label match.
    for (const text of [item.description, ...(item.keywords ?? [])]) {
      if (!text || !text.toLowerCase().includes(q.toLowerCase())) continue;
      if (!best || best.score < 40) best = { item, score: 40, idx: null };
    }
    if (best) hits.push(best);
  }
  return hits.sort((a, b) => b.score - a.score);
}

// ─── Recents ──────────────────────────────────────────────────────────────────

function readRecents(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function writeRecents(key: string, ids: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // storage blocked: recents just won't persist
  }
}

// ─── Hotkeys ──────────────────────────────────────────────────────────────────

const MODIFIERS = ["mod", "shift", "alt"];

/** Items that can run without opening the menu: leaves with a shortcut. */
function withShortcuts(items: CommandItem[]): CommandItem[] {
  return items.flatMap((i) => (i.children?.length ? withShortcuts(i.children) : i.shortcut?.length && !i.disabled ? [i] : []));
}

// ─── Small parts ──────────────────────────────────────────────────────────────

const noop = () => () => {};
const detectMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

function keyLabel(key: string, mac: boolean) {
  if (key === "mod") return mac ? "⌘" : "Ctrl";
  if (key === "shift") return mac ? "⇧" : "Shift";
  if (key === "alt") return mac ? "⌥" : "Alt";
  return key;
}

function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-foreground/[0.06] px-1 font-sans text-[11px] font-medium text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

function Highlight({ text, idx }: { text: string; idx: number[] | null }) {
  if (!idx?.length) return <>{text}</>;
  const hit = new Set(idx);
  const parts: { text: string; on: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const on = hit.has(i);
    const last = parts[parts.length - 1];
    if (last && last.on === on) last.text += text[i];
    else parts.push({ text: text[i], on });
  }
  return (
    <>
      {parts.map((p, i) =>
        p.on ? (
          <span key={i} className="font-semibold text-foreground">{p.text}</span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

// ─── Palette ──────────────────────────────────────────────────────────────────

type Group = { id: string; label: string; hits: Hit[] };
type Remote = { query: string; items: CommandItem[]; failed: boolean };

export type CommandRowState = {
  /** The row is the keyboard-selected one. */
  active: boolean;
  /** The label, with the letters that matched the search already bolded. */
  label: ReactNode;
};

type PaletteProps = {
  items: CommandItem[];
  filters: CommandFilter[];
  labels: CommandLabels;
  placeholder: string;
  showFilters: boolean;
  highlight: boolean;
  footer: boolean;
  blur: boolean;
  width: number;
  maxRecents: number;
  maxResults: number;
  recentsKey: string;
  mac: boolean;
  searchDelay: number;
  onSearch?: (query: string, signal: AbortSignal) => Promise<CommandItem[]>;
  renderItem?: (item: CommandItem, state: CommandRowState) => ReactNode;
  onSelect?: (item: CommandItem) => void;
  onClose: () => void;
};

/** The dialog itself. Mounted only while open, so every open starts fresh. */
function Palette({
  items,
  filters,
  labels: L,
  placeholder,
  showFilters,
  highlight,
  footer,
  blur,
  width,
  maxRecents,
  maxResults,
  recentsKey,
  mac,
  searchDelay,
  onSearch,
  renderItem,
  onSelect,
  onClose,
}: PaletteProps) {
  const uid = useId();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [stack, setStack] = useState<CommandItem[]>([]);
  const [active, setActive] = useState(0);
  const [recentIds, setRecentIds] = useState(() => (maxRecents > 0 ? readRecents(recentsKey) : []));
  const [remote, setRemote] = useState<Remote | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const byKeyboard = useRef(false);
  // The latest onSearch, so an inline function doesn't restart the request on every render.
  const searchRef = useRef(onSearch);
  useEffect(() => {
    searchRef.current = onSearch;
  });
  const hasSearch = !!onSearch;

  const page = stack[stack.length - 1];
  const source = page?.children ?? items;
  const q = query.trim();
  const searching = q.length > 0;

  // Remote results: debounced, and an older request is cancelled when the query changes.
  useEffect(() => {
    if (!hasSearch || page || !q) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      searchRef.current?.(q, ctrl.signal).then(
        (found) => !ctrl.signal.aborted && setRemote({ query: q, items: found, failed: false }),
        () => !ctrl.signal.aborted && setRemote({ query: q, items: [], failed: true }),
      );
    }, searchDelay);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, page, hasSearch, searchDelay]);

  const live = hasSearch && !page && searching && remote?.query === q ? remote : null;
  const loading = hasSearch && !page && searching && !live;

  const hits = useMemo(() => {
    const local = rank(source, query);
    if (!live?.items.length) return local;
    const have = new Set(local.map((h) => h.item.id));
    const extra = live.items
      .filter((i) => !have.has(i.id))
      .map((item) => ({ item, score: 0, idx: match(q, item.label)?.idx ?? null }));
    return [...local, ...extra];
  }, [source, query, live, q]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const h of hits) c[h.item.type] = (c[h.item.type] ?? 0) + 1;
    return c;
  }, [hits]);

  const groups = useMemo<Group[]>(() => {
    const out: Group[] = [];
    if (page) {
      out.push({ id: "page", label: "", hits });
    } else {
      const shown = filter === "all" ? hits : hits.filter((h) => h.item.type === filter);
      let rest = shown;
      if (!searching && filter === "all" && recentIds.length) {
        const byId = new Map(items.map((i) => [i.id, i]));
        const recent = recentIds
          .map((id) => byId.get(id))
          .filter((i): i is CommandItem => !!i)
          .slice(0, maxRecents)
          .map((item) => ({ item, score: 0, idx: null }));
        if (recent.length) {
          out.push({ id: "recent", label: L.recent, hits: recent });
          const taken = new Set(recent.map((h) => h.item.id));
          rest = shown.filter((h) => !taken.has(h.item.id));
        }
      }
      const known = new Set(filters.map((f) => f.id));
      const types = [...filters, ...[...new Set(rest.map((h) => h.item.type))].filter((t) => !known.has(t)).map((t) => ({ id: t, label: t }))];
      for (const f of types) {
        const group = rest.filter((h) => h.item.type === f.id);
        if (group.length) out.push({ id: f.id, label: f.label, hits: group });
      }
    }
    // Long lists are cut off here: keep searching to narrow them.
    let budget = maxResults;
    return out
      .map((g) => {
        const kept = g.hits.slice(0, Math.max(budget, 0));
        budget -= kept.length;
        return { ...g, hits: kept };
      })
      .filter((g) => g.hits.length);
  }, [page, hits, filter, searching, recentIds, items, maxRecents, maxResults, filters, L.recent]);

  const rows = useMemo(() => groups.flatMap((g) => g.hits), [groups]);
  // Disabled rows are shown but never selected.
  const enabled = useMemo(() => rows.flatMap((r, i) => (r.item.disabled ? [] : [i])), [rows]);
  const current = enabled.includes(active) ? active : (enabled[0] ?? -1);
  const optionId = (item: CommandItem) => `${uid}-${item.id}`;

  // Arrow keys keep the active row in view; hovering never scrolls.
  useEffect(() => {
    if (!byKeyboard.current) return;
    byKeyboard.current = false;
    if (current === enabled[0]) listRef.current?.scrollTo({ top: 0 });
    else document.getElementById(`${uid}-${rows[current]?.item.id}`)?.scrollIntoView({ block: "nearest" });
  }, [current, enabled, rows, uid]);

  const reset = () => setActive(0);

  // A new query, filter or page starts at the top of the list.
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [query, filter, stack.length]);

  const run = (item: CommandItem) => {
    if (item.disabled) return;
    if (item.children?.length) {
      setStack((s) => [...s, item]);
      setQuery("");
      reset();
      return;
    }
    if (maxRecents > 0) {
      const next = [item.id, ...recentIds.filter((id) => id !== item.id)].slice(0, maxRecents);
      setRecentIds(next);
      writeRecents(recentsKey, next);
    }
    item.onSelect?.();
    onSelect?.(item);
    onClose();
  };

  const pickFilter = (id: string) => {
    setFilter(id);
    reset();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return;
    const filterIds = ["all", ...filters.map((f) => f.id)];
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        onClose();
        break;
      case "ArrowDown":
      case "ArrowUp": {
        e.preventDefault();
        if (!enabled.length) break;
        byKeyboard.current = true;
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActive(enabled[(enabled.indexOf(current) + step + enabled.length) % enabled.length]);
        break;
      }
      case "Enter":
        e.preventDefault();
        if (rows[current]) run(rows[current].item);
        break;
      case "Tab":
        if (!showFilters || page) break;
        e.preventDefault();
        pickFilter(filterIds[(filterIds.indexOf(filter) + (e.shiftKey ? -1 : 1) + filterIds.length) % filterIds.length]);
        break;
      case "Backspace":
        if (query === "" && page) {
          e.preventDefault();
          setStack((s) => s.slice(0, -1));
          reset();
        }
        break;
    }
  };

  const filterTabs = [{ id: "all", label: L.all }, ...filters];
  const total = rows.length;
  let rowIndex = 0;

  return (
    // Fades in quickly and leaves instantly: a menu you summon should never make you wait.
    <motion.div
      className={cn(
        "fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]",
        "bg-black/25 dark:bg-black/50",
        blur && "backdrop-blur-[3px]",
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={L.dialog}
        onKeyDown={onKeyDown}
        className="w-full overflow-hidden rounded-3xl bg-muted p-2 text-foreground shadow-[0_0_0_1px_var(--border),0_24px_60px_-16px_rgb(0_0_0/0.35)]"
        style={{ maxWidth: width }}
      >
        <div className="flex h-12 items-center gap-3 pl-3 pr-1">
          <IconSearch className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
          {page && (
            <span className="shrink-0 rounded-md bg-background px-2 py-0.5 text-[13px] font-medium text-muted-foreground">
              {page.label}
            </span>
          )}
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={`${uid}-list`}
            aria-activedescendant={rows[current] ? optionId(rows[current].item) : undefined}
            aria-label={page ? page.label : placeholder}
            autoComplete="off"
            spellCheck={false}
            value={query}
            placeholder={page ? L.nestedPlaceholder : placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              reset();
            }}
            className="h-full min-w-0 flex-1 bg-transparent text-base font-normal tracking-tight text-foreground outline-none placeholder:text-muted-foreground"
          />
          {loading && <Spinner />}
          <kbd className="hidden h-7 items-center rounded-lg bg-background px-2.5 font-sans text-[13px] font-medium text-muted-foreground sm:inline-flex">
            {L.esc}
          </kbd>
        </div>

        {showFilters && !page && (
          <div
            role="tablist"
            aria-label="Filter results"
            className="flex gap-1 overflow-x-auto px-1 pb-2 [scrollbar-width:none]"
          >
            {filterTabs.map((f) => {
              const on = filter === f.id;
              const n = f.id === "all" ? hits.length : (counts[f.id] ?? 0);
              return (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  tabIndex={-1}
                  // keeps focus in the input so typing and arrow keys carry on
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickFilter(f.id)}
                  className={cn(
                    "flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium",
                    on ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground",
                    !n && !on && "opacity-50",
                  )}
                >
                  {f.label}
                  <span className="text-xs tabular-nums text-muted-foreground">{n}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="overflow-hidden rounded-[18px] bg-background shadow-[inset_0_0_0_1px_var(--border)]">
          <div
            ref={listRef}
            role="listbox"
            id={`${uid}-list`}
            aria-label="Results"
            aria-busy={loading}
            className="max-h-[min(26rem,56vh)] overflow-y-auto overscroll-contain p-2"
          >
            {total === 0 ? (
              <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
                {loading ? (
                  <p className="text-sm text-muted-foreground" role="status">{L.searching}</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground">
                      {searching ? fill(L.empty, { query: q }) : L.nothingYet}
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      {live?.failed ? L.failed : L.emptyHint}
                    </p>
                    {filter !== "all" && hits.length > 0 && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickFilter("all")}
                        className="mt-1 cursor-pointer text-[13px] font-medium text-foreground underline underline-offset-2"
                      >
                        {fill(L.showAll, { count: hits.length })}
                      </button>
                    )}
                  </>
                )}
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.id} role="group" aria-labelledby={group.label ? `${uid}-g-${group.id}` : undefined} className="pb-1 last:pb-0">
                  {group.label && (
                    <div id={`${uid}-g-${group.id}`} className="px-3 pb-1.5 pt-3 text-sm text-muted-foreground">
                      {group.label}
                    </div>
                  )}
                  {group.hits.map((hit) => {
                    const i = rowIndex++;
                    const isActive = i === current;
                    const { item } = hit;
                    const label = highlight ? <Highlight text={item.label} idx={hit.idx} /> : item.label;
                    return (
                      <div
                        key={item.id}
                        id={optionId(item)}
                        role="option"
                        aria-selected={isActive}
                        aria-disabled={item.disabled || undefined}
                        onMouseDown={(e) => e.preventDefault()}
                        onPointerMove={() => !item.disabled && i !== current && setActive(i)}
                        onClick={() => run(item)}
                        className={cn(
                          "flex min-h-10 items-center gap-3 rounded-xl px-3",
                          item.disabled ? "cursor-not-allowed opacity-45" : "cursor-pointer",
                          isActive && "bg-muted shadow-[inset_0_0_0_1px_var(--border)]",
                        )}
                      >
                        {renderItem ? (
                          renderItem(item, { active: isActive, label })
                        ) : (
                          <>
                            {item.icon && (
                              <span className={cn("grid size-6 shrink-0 place-items-center", isActive ? "text-foreground" : "text-muted-foreground")}>
                                {item.icon}
                              </span>
                            )}
                            <span className="flex min-w-0 flex-1 items-baseline gap-2">
                              <span className={cn("truncate text-base tracking-tight", isActive ? "text-foreground" : "text-foreground/70")}>
                                {label}
                              </span>
                              {item.description && (
                                <span className="truncate text-sm text-muted-foreground">{item.description}</span>
                              )}
                            </span>
                            {item.children?.length ? (
                              <IconChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                            ) : isActive ? (
                              <IconCornerDownLeft className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                            ) : item.shortcut?.length ? (
                              <span className="flex shrink-0 gap-1">
                                {item.shortcut.map((k, n) => (
                                  <Kbd key={n}>{keyLabel(k, mac)}</Kbd>
                                ))}
                              </span>
                            ) : null}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
            {live?.failed && total > 0 && (
              <p className="px-3 py-2 text-[13px] text-muted-foreground">{L.failed}</p>
            )}
          </div>
        </div>

        {footer && (
          <div className="flex items-center justify-between gap-4 px-2 pb-0.5 pt-2.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-3.5">
              <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd>{L.navigate}</span>
              <span className="flex items-center gap-1.5"><Kbd>↵</Kbd>{L.select}</span>
              {page ? (
                <span className="hidden items-center gap-1.5 sm:flex"><Kbd>⌫</Kbd>{L.back}</span>
              ) : (
                showFilters && <span className="hidden items-center gap-1.5 sm:flex"><Kbd>Tab</Kbd>{L.filter}</span>
              )}
            </div>
            <span className="tabular-nums" role="status" aria-live="polite">
              {total} {total === 1 ? L.result : L.results}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Command menu ─────────────────────────────────────────────────────────────

export type CommandMenuProps = {
  /** Everything the menu can find or run. */
  items?: CommandItem[];
  /** Filter pills under the field, in order. "All" is always first. */
  filters?: CommandFilter[];
  /** Text in the empty field and on the trigger. */
  placeholder?: string;
  /** Key that toggles the menu with ⌘ / Ctrl. Empty turns the shortcut off. */
  shortcut?: string;
  /** Show the filter pills. Tab cycles them from the keyboard. */
  showFilters?: boolean;
  /** Bold the letters of the label that matched the search. */
  highlight?: boolean;
  /** Keyboard hints and the result count under the list. */
  footer?: boolean;
  /** Blur the page behind the menu. */
  blur?: boolean;
  /** Widest the menu gets, in px. */
  width?: number;
  /** Recently run commands listed first while the field is empty. 0 turns them off. */
  maxRecents?: number;
  /** Most rows shown at once. Longer lists are cut off; searching narrows them. */
  maxResults?: number;
  /** localStorage key for recents. */
  recentsKey?: string;
  /**
   * Fetches results from a server as the user types, shown beside the local
   * ones. Called once typing pauses; abort `signal` when a newer search starts.
   */
  onSearch?: (query: string, signal: AbortSignal) => Promise<CommandItem[]>;
  /** Wait after the last keystroke before calling `onSearch`, in ms. */
  searchDelay?: number;
  /** Run an item's shortcut from anywhere on the page while the menu is closed. */
  hotkeys?: boolean;
  /** Draws a row's contents yourself; the row's highlight, height and click stay. */
  renderItem?: (item: CommandItem, state: CommandRowState) => ReactNode;
  /** Replaces any of the menu's text, for translation or your own wording. */
  labels?: Partial<CommandLabels>;
  /** Controlled open state. Leave out to let the menu keep its own. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Called after a command runs, alongside its own onSelect. */
  onSelect?: (item: CommandItem) => void;
  className?: string;
};

/** A ⌘K command menu: fuzzy search, server results, filter pills, nested pages, recents and full keyboard control. */
export function CommandMenu({
  items = SAMPLE_ITEMS,
  filters = SAMPLE_FILTERS,
  placeholder = "Search docs and components",
  shortcut = "k",
  showFilters = true,
  highlight = true,
  footer = true,
  blur = true,
  width = 580,
  maxRecents = 4,
  maxResults = 100,
  recentsKey = "command-menu-recents",
  onSearch,
  searchDelay = 200,
  hotkeys = true,
  renderItem,
  labels,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  onSelect,
  className,
}: CommandMenuProps) {
  const [inner, setInner] = useState(defaultOpen);
  const open = openProp ?? inner;
  const mac = useSyncExternalStore(noop, detectMac, () => false);
  const client = useSyncExternalStore(noop, () => true, () => false);
  const resolved = useMemo<CommandLabels>(() => ({ ...DEFAULT_LABELS, ...labels }), [labels]);

  const setOpen = (next: boolean) => {
    setInner(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === shortcut.toLowerCase()) {
        e.preventDefault();
        setInner(!open);
        onOpenChange?.(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcut, open, onOpenChange]);

  // Item shortcuts while the menu is closed. With a modifier it is a chord
  // (["mod", "N"]); without one it is a sequence of keys pressed in turn (["G", "D"]).
  const shortcuts = useMemo(() => (hotkeys ? withShortcuts(items) : []), [hotkeys, items]);
  useEffect(() => {
    if (!shortcuts.length || open) return;
    let typed: string[] = [];
    let timer = 0;
    const fire = (e: globalThis.KeyboardEvent, item: CommandItem) => {
      e.preventDefault();
      typed = [];
      item.onSelect?.();
      onSelect?.(item);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.isComposing || target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "")) return;
      const key = e.key.toLowerCase();
      const command = mac ? e.metaKey : e.ctrlKey;
      for (const item of shortcuts) {
        const mods = item.shortcut!.filter((k) => MODIFIERS.includes(k));
        const keys = item.shortcut!.filter((k) => !MODIFIERS.includes(k));
        if (
          mods.length &&
          keys.length === 1 &&
          keys[0].toLowerCase() === key &&
          command === mods.includes("mod") &&
          e.shiftKey === mods.includes("shift") &&
          e.altKey === mods.includes("alt")
        ) {
          return fire(e, item);
        }
      }
      if (e.metaKey || e.ctrlKey || e.altKey) {
        typed = [];
        return;
      }
      typed = [...typed, key].slice(-4);
      clearTimeout(timer);
      timer = window.setTimeout(() => (typed = []), 1000);
      for (const item of shortcuts) {
        const keys = item.shortcut!.filter((k) => !MODIFIERS.includes(k)).map((k) => k.toLowerCase());
        if (!item.shortcut!.some((k) => MODIFIERS.includes(k)) && keys.length && typed.slice(-keys.length).join("\0") === keys.join("\0")) {
          return fire(e, item);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [shortcuts, open, mac, onSelect]);

  // While open: lock page scroll, and hand focus back to whatever opened the menu.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts={shortcut ? `Control+${shortcut.toUpperCase()} Meta+${shortcut.toUpperCase()}` : undefined}
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-10 w-full max-w-xs cursor-pointer items-center gap-2.5 rounded-xl bg-muted px-3 text-sm font-medium text-muted-foreground shadow-[inset_0_0_0_1px_var(--border)] outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          className,
        )}
      >
        <IconSearch className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate text-left">{placeholder}</span>
        {shortcut && (
          <span className="flex gap-1">
            <Kbd>{mac ? "⌘" : "Ctrl"}</Kbd>
            <Kbd>{shortcut.toUpperCase()}</Kbd>
          </span>
        )}
      </button>

      {client &&
        createPortal(
          open && (
            <Palette
              items={items}
              filters={filters}
              labels={resolved}
              placeholder={placeholder}
              showFilters={showFilters && filters.length > 0}
              highlight={highlight}
              footer={footer}
              blur={blur}
              width={width}
              maxRecents={maxRecents}
              maxResults={maxResults}
              recentsKey={recentsKey}
              mac={mac}
              searchDelay={searchDelay}
              onSearch={onSearch}
              renderItem={renderItem}
              onSelect={onSelect}
              onClose={() => setOpen(false)}
            />
          ),
          document.body,
        )}
    </>
  );
}
