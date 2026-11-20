"use client";

// A file and folder tree. Folders ease open to their height, guide lines show
// what sits inside what, and the selected row's highlight slides to the next
// one instead of blinking. Full tree keyboard support: Up/Down move, Right
// opens or steps in, Left closes or steps out, Home/End jump, Enter selects,
// and typing a letter jumps to the next name starting with it.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  IconBraces,
  IconFile,
  IconFileCode,
  IconFileText,
  IconFolder,
  IconFolderOpen,
  IconPhoto,
} from "@tabler/icons-react";
import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TreeNode = {
  name: string;
  /** Present (even empty) makes it a folder. */
  children?: readonly TreeNode[];
  /** Overrides the icon picked from the file extension. */
  icon?: ReactNode;
};

export type TreeViewProps = {
  data: readonly TreeNode[];
  /** Folder paths open at first ("src/app"), or "all". */
  defaultExpanded?: readonly string[] | "all";
  /** Path selected at first. */
  defaultSelected?: string;
  /** Called with the path and node when a row is selected. */
  onSelect?: (path: string, node: TreeNode) => void;
  /** Vertical lines linking children to their folder. */
  guides?: boolean;
  /** Indent per level in px. */
  indent?: number;
  /** Accessible name for the tree. */
  label?: string;
  className?: string;
};

type Flat = { path: string; node: TreeNode; level: number; parent: string | null };

const isFolder = (n: TreeNode) => n.children !== undefined;
const ICON = { size: 16, stroke: 1.75 };

function fileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["ts", "tsx", "js", "jsx", "mjs", "css", "html"].includes(ext)) return <IconFileCode {...ICON} />;
  if (["md", "mdx", "txt"].includes(ext)) return <IconFileText {...ICON} />;
  if (["png", "jpg", "jpeg", "svg", "webp", "gif", "ico"].includes(ext)) return <IconPhoto {...ICON} />;
  if (ext === "json") return <IconBraces {...ICON} />;
  return <IconFile {...ICON} />;
}

// Folders first, then files, each alphabetical: the order file browsers use.
const sorted = (nodes: readonly TreeNode[]) =>
  [...nodes].sort((a, b) => Number(isFolder(b)) - Number(isFolder(a)) || a.name.localeCompare(b.name));

function allFolders(nodes: readonly TreeNode[], base = ""): string[] {
  return nodes.flatMap((n) => (isFolder(n) ? [base + n.name, ...allFolders(n.children!, `${base}${n.name}/`)] : []));
}

export function TreeView({
  data,
  defaultExpanded = [],
  defaultSelected,
  onSelect,
  guides = true,
  indent = 16,
  label = "Files",
  className,
}: TreeViewProps) {
  const reduce = useReducedMotion();
  const uid = useId();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(defaultExpanded === "all" ? allFolders(data) : defaultExpanded));
  const [selected, setSelected] = useState<string | null>(defaultSelected ?? null);
  const [focused, setFocused] = useState<string | null>(null);
  const [keyboard, setKeyboard] = useState(false);
  const rows = useRef(new Map<string, HTMLLIElement>());

  // Visible rows in order, for keyboard movement.
  const visible = useMemo(() => {
    const out: Flat[] = [];
    const walk = (nodes: readonly TreeNode[], level: number, parent: string | null) => {
      for (const node of sorted(nodes)) {
        const path = parent ? `${parent}/${node.name}` : node.name;
        out.push({ path, node, level, parent });
        if (isFolder(node) && expanded.has(path)) walk(node.children!, level + 1, path);
      }
    };
    walk(data, 1, null);
    return out;
  }, [data, expanded]);

  // The one row in the tab order: focused, else selected, else the first.
  const tabStop = focused ?? (selected && visible.some((v) => v.path === selected) ? selected : visible[0]?.path);

  const toggle = (path: string, open?: boolean) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (open ?? !next.has(path)) next.add(path);
      else next.delete(path);
      return next;
    });

  const focus = (path: string) => {
    setFocused(path);
    rows.current.get(path)?.focus();
  };

  const choose = (f: Flat) => {
    setSelected(f.path);
    onSelect?.(f.path, f.node);
  };

  const onKeyDown = (e: KeyboardEvent, f: Flat) => {
    const i = visible.findIndex((v) => v.path === f.path);
    const folder = isFolder(f.node);
    const open = expanded.has(f.path);
    setKeyboard(true);
    switch (e.key) {
      case "ArrowDown":
        if (i < visible.length - 1) focus(visible[i + 1].path);
        break;
      case "ArrowUp":
        if (i > 0) focus(visible[i - 1].path);
        break;
      case "ArrowRight":
        if (folder && !open) toggle(f.path, true);
        else if (folder && open && visible[i + 1]?.parent === f.path) focus(visible[i + 1].path);
        break;
      case "ArrowLeft":
        if (folder && open) toggle(f.path, false);
        else if (f.parent) focus(f.parent);
        break;
      case "Home":
        focus(visible[0].path);
        break;
      case "End":
        focus(visible[visible.length - 1].path);
        break;
      case "Enter":
      case " ":
        choose(f);
        if (folder) toggle(f.path);
        break;
      default: {
        // Type a letter: jump to the next visible name that starts with it.
        if (e.key.length !== 1 || e.metaKey || e.ctrlKey) return;
        const k = e.key.toLowerCase();
        for (let o = 1; o <= visible.length; o++) {
          const v = visible[(i + o) % visible.length];
          if (v.node.name.toLowerCase().startsWith(k)) {
            focus(v.path);
            break;
          }
        }
      }
    }
    e.preventDefault();
  };

  const renderLevel = (nodes: readonly TreeNode[], level: number, parent: string | null): ReactNode =>
    sorted(nodes).map((node) => {
      const path = parent ? `${parent}/${node.name}` : node.name;
      const folder = isFolder(node);
      const open = folder && expanded.has(path);
      const isSelected = selected === path;
      const f = { path, node, level, parent };
      return (
        <li
          key={path}
          ref={(el) => {
            if (el) rows.current.set(path, el);
            else rows.current.delete(path);
          }}
          role="treeitem"
          aria-level={level}
          aria-expanded={folder ? open : undefined}
          aria-selected={isSelected}
          tabIndex={tabStop === path ? 0 : -1}
          onKeyDown={(e) => {
            // Each row handles only its own keys, not those bubbling from its children.
            if (e.target !== e.currentTarget) return;
            onKeyDown(e, f);
          }}
          onFocus={(e) => e.target === e.currentTarget && setFocused(path)}
          className="outline-none"
        >
          <div
            onClick={() => {
              setKeyboard(false);
              setFocused(path);
              choose(f);
              if (folder) toggle(path);
            }}
            className={cn(
              "relative flex h-8 cursor-pointer items-center gap-2 rounded-lg pr-2 text-sm transition-colors duration-150",
              isSelected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              keyboard && focused === path && "ring-2 ring-neutral-400",
            )}
            style={{ paddingLeft: 8 + (level - 1) * indent }}
          >
            {isSelected && (
              <motion.span
                layoutId={`${uid}-sel`}
                aria-hidden
                className="absolute inset-0 rounded-lg bg-muted"
                transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0 }}
              />
            )}
            <span className="relative grid size-4 shrink-0 place-items-center">
              {folder && (
                <motion.svg
                  aria-hidden
                  width={12}
                  height={12}
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={false}
                  animate={{ rotate: open ? 90 : 0 }}
                  transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                >
                  <path d="M4.5 2.5 8 6l-3.5 3.5" />
                </motion.svg>
              )}
            </span>
            <span className="relative shrink-0 [&_svg]:size-4">
              {node.icon ?? (folder ? open ? <IconFolderOpen {...ICON} /> : <IconFolder {...ICON} /> : fileIcon(node.name))}
            </span>
            <span className="relative truncate">{node.name}</span>
          </div>

          <AnimatePresence initial={false}>
            {open && (
              <motion.ul
                role="group"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.35, bounce: 0, opacity: { duration: 0.2 } }}
                className="relative overflow-hidden"
              >
                {guides && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-1 w-px bg-border"
                    // Under the folder's chevron, so each line reads as "these are inside this".
                    style={{ left: 8 + (level - 1) * indent + 7.5 }}
                  />
                )}
                {renderLevel(node.children!, level + 1, path)}
              </motion.ul>
            )}
          </AnimatePresence>
        </li>
      );
    });

  return (
    <ul role="tree" aria-label={label} className={cn("w-full select-none", className)} onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFocused(null)}>
      {renderLevel(data, 1, null)}
    </ul>
  );
}
