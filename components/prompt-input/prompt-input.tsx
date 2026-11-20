"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  IconArrowUp,
  IconCheck,
  IconChevronDown,
  IconFile,
  IconLoader2,
  IconMicrophone,
  IconPaperclip,
  IconPlayerStopFilled,
  IconX,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

// The box people type a prompt into. What you type is drawn by a mirror under
// a transparent textarea, so a /command or an @mention can be tinted while the
// field stays a plain textarea (native undo, IME, autocorrect and selection all
// keep working). Typing / at the start or @ after a space opens a list above
// the box; picking an item types it in through the browser, so Cmd+Z undoes it.
//
// Dictation turns the toolbar into a recorder: a waveform that scrolls in from
// the right as you speak, a timer, cancel and done. Words land in the field as
// they are heard, faint and blurred while the browser is still guessing, and
// settle to solid once it is sure. Cancel puts back what was there before.
// With `transcribe`, the audio is recorded instead and handed to your own
// speech-to-text, and the words it returns settle in the same way.

export type PromptModel = { id: string; name: string; description?: string };
export type PromptCommand = { name: string; description?: string };
export type PromptMention = { id: string; label: string; description?: string; avatar?: string };
export type PromptStatus = "idle" | "submitting" | "streaming";

export type PromptSubmission = {
  /** The whole prompt, including any /command and @mentions. */
  text: string;
  files: File[];
  model?: string;
  /** The /command the prompt starts with, without the slash. */
  command?: string;
  mentions: PromptMention[];
};

export type PromptInputProps = {
  /** Text (controlled). Pair with `onValueChange`. */
  value?: string;
  /** Text on mount (uncontrolled). */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Called on Enter or the send button. The field clears straight away and comes back if this throws. */
  onSubmit?: (prompt: PromptSubmission) => void | Promise<void>;
  /** "streaming" turns send into stop. Leave out to have the box track a returned promise itself. */
  status?: PromptStatus;
  onStop?: () => void;
  /** Models for the picker. Leave out to hide it. */
  models?: readonly PromptModel[];
  model?: string;
  defaultModel?: string;
  onModelChange?: (id: string) => void;
  /** Offered after / at the start of the prompt. */
  commands?: readonly PromptCommand[];
  /** Offered after @. */
  mentions?: readonly PromptMention[];
  /** File button, drag and drop, and paste. */
  attach?: boolean;
  /** Which files to take, as an <input accept> string such as "image/*,.pdf". Empty takes any. */
  accept?: string;
  maxFiles?: number;
  maxFileSizeMb?: number;
  /** Dictation button. Shows only where the browser can listen, or where `transcribe` can record. */
  voice?: boolean;
  /** Your own speech-to-text. When given, dictation records audio and inserts what this returns. */
  transcribe?: (audio: Blob, signal: AbortSignal) => Promise<string>;
  /** Rows the field grows to before it scrolls. */
  maxRows?: number;
  placeholder?: string;
  /** Where the suggestion lists open. Use "bottom" when the box sits at the top of a screen. */
  side?: "top" | "bottom";
  /** Names the field for screen readers. */
  label?: string;
  disabled?: boolean;
  className?: string;
};

const EASE = [0.23, 1, 0.32, 1] as const;
const CSS_EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
const LINE = 24; // px, the field's line height
const PAD_Y = 8; // px, the field's vertical padding
const TEXT = "px-3 py-2 text-[15px] leading-6 whitespace-pre-wrap [overflow-wrap:anywhere]";
const TOOL =
  "grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/40 disabled:pointer-events-none disabled:opacity-40 pointer-coarse:size-10";
const PRIMARY =
  "grid size-8 shrink-0 place-items-center rounded-[10px] bg-foreground text-background transition-opacity duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground/50 disabled:opacity-25 pointer-coarse:size-10";
const TOKEN = "rounded-[4px] bg-sky-500/10 text-sky-600 shadow-[0_0_0_1.5px_rgb(14_165_233/0.1)] dark:text-sky-400";

// ─── Text tokens ─────────────────────────────────────────────────────────────

type Token =
  | { start: number; end: number; type: "command"; name: string }
  | { start: number; end: number; type: "mention"; item: PromptMention };

/** The /command at the start and every @mention that matches a known label. */
function findTokens(text: string, commands: readonly PromptCommand[], mentions: readonly PromptMention[]): Token[] {
  const out: Token[] = [];
  if (commands.length) {
    const m = /^\/(\S+)(?=\s|$)/.exec(text);
    const hit = m && commands.find((c) => c.name === m[1]);
    if (m && hit) out.push({ start: 0, end: m[0].length, type: "command", name: hit.name });
  }
  if (mentions.length) {
    // Longest first, so "@Ada Park" wins over "@Ada".
    const byLength = [...mentions].sort((a, b) => b.label.length - a.label.length);
    for (let i = text.indexOf("@"); i !== -1; i = text.indexOf("@", i + 1)) {
      if (i > 0 && !/\s/.test(text[i - 1])) continue;
      const rest = text.slice(i + 1);
      const hit = byLength.find((p) => rest.startsWith(p.label) && !/[\p{L}\p{N}_]/u.test(rest[p.label.length] ?? ""));
      if (!hit) continue;
      out.push({ start: i, end: i + 1 + hit.label.length, type: "mention", item: hit });
      i += hit.label.length;
    }
  }
  return out;
}

type Trigger = { char: "/" | "@"; start: number; query: string };

/** A / or @ the caret is still typing after, if any. */
function findTrigger(text: string, caret: number, commands: boolean, mentions: boolean): Trigger | null {
  const m = /(^|\s)([@/])([^\s@/]*)$/.exec(text.slice(0, caret));
  if (!m) return null;
  const char = m[2] as "/" | "@";
  const start = m.index + m[1].length;
  if (char === "/" && (start !== 0 || !commands)) return null;
  if (char === "@" && !mentions) return null;
  return { char, start, query: m[3] };
}

type Option = { key: string; label: string; hint?: string; avatar?: string; insert: string; mention: boolean };

function rank<T>(list: readonly T[], query: string, text: (t: T) => string) {
  const q = query.toLowerCase();
  const starts = list.filter((t) => text(t).toLowerCase().startsWith(q));
  const contains = list.filter((t) => !text(t).toLowerCase().startsWith(q) && text(t).toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, 8);
}

/** Dictated words, as offsets into the text. Words past `settled` are still a guess. */
type Dictation = { id: number; start: number; settled: number; end: number };

// ─── Files ───────────────────────────────────────────────────────────────────

type Attachment = { id: string; file: File; url?: string };

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function matchesAccept(file: File, accept: string) {
  const rules = accept.split(",").map((r) => r.trim().toLowerCase()).filter(Boolean);
  if (!rules.length) return true;
  const name = file.name.toLowerCase();
  return rules.some((rule) =>
    rule.startsWith(".") ? name.endsWith(rule) : rule.endsWith("/*") ? file.type.startsWith(rule.slice(0, -1)) : file.type === rule,
  );
}

// ─── Speech ──────────────────────────────────────────────────────────────────

// The browser's own recognition: nothing leaves the page and no key is needed.
// Firefox has none, so without `transcribe` the mic button stays hidden there.
type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getRecognition(): (new () => Recognition) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const noSubscribe = () => () => {};

type VoiceSession = {
  id: number;
  base: string; // the text before dictation, put back on cancel
  stream: MediaStream | null;
  recognition?: Recognition;
  recorder?: MediaRecorder;
  chunks: Blob[];
  keep: boolean;
  abort?: AbortController;
};

const stopTracks = (stream: MediaStream | null) => stream?.getTracks().forEach((t) => t.stop());

// ─── Component ───────────────────────────────────────────────────────────────

export function PromptInput({
  value,
  defaultValue = "",
  onValueChange,
  onSubmit,
  status: statusProp,
  onStop,
  models = [],
  model: modelProp,
  defaultModel,
  onModelChange,
  commands = [],
  mentions = [],
  attach = true,
  accept = "",
  maxFiles = 6,
  maxFileSizeMb = 10,
  voice = true,
  transcribe,
  maxRows = 8,
  placeholder = "Ask anything",
  side = "top",
  label = "Message",
  disabled = false,
  className,
}: PromptInputProps) {
  const id = useId();
  const reduce = !!useReducedMotion();
  const [inner, setInner] = useState(defaultValue);
  const text = value ?? inner;
  const setText = (next: string) => {
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  };

  const [innerModel, setInnerModel] = useState(defaultModel);
  const model = modelProp ?? innerModel ?? models[0]?.id;
  const pickModel = (next: string) => {
    if (modelProp === undefined) setInnerModel(next);
    onModelChange?.(next);
  };

  const [pending, setPending] = useState(false);
  const status: PromptStatus = statusProp ?? (pending ? "submitting" : "idle");

  const [files, setFiles] = useState<Attachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [notice, setNotice] = useState<{ id: number; text: string } | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const field = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [dictation, setDictation] = useState<Dictation | null>(null);

  const [voiceState, setVoiceState] = useState<"off" | "listening" | "transcribing">("off");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const session = useRef<VoiceSession | null>(null);
  const sessionCount = useRef(0);
  const canListen = useSyncExternalStore(
    noSubscribe,
    () => (transcribe ? !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined" : !!getRecognition()),
    () => false,
  );
  const listening = voiceState !== "off";

  const flash = (message: string) => {
    clearTimeout(noticeTimer.current);
    setNotice((n) => ({ id: (n?.id ?? 0) + 1, text: message }));
    noticeTimer.current = setTimeout(() => setNotice(null), 3200);
  };

  // ─── Field ────────────────────────────────────────────────────────────────

  const syncScroll = () => {
    const el = field.current;
    if (el && mirror.current) mirror.current.style.transform = `translateY(${-el.scrollTop}px)`;
  };

  // The field grows with its text up to `maxRows`, then scrolls.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    const max = maxRows * LINE + PAD_Y * 2;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
    syncScroll();
  }, [text, maxRows]);

  // A caret position to restore once React has written the new text.
  const caretAfter = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (caretAfter.current === null || !field.current) return;
    field.current.setSelectionRange(caretAfter.current, caretAfter.current);
    caretAfter.current = null;
  });

  /** Replaces a range through the browser's editing, so it lands on the undo stack. */
  const replaceRange = (start: number, end: number, insert: string) => {
    const el = field.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(start, end);
    const done = insert ? document.execCommand("insertText", false, insert) : document.execCommand("delete");
    if (!done) {
      setText(text.slice(0, start) + insert + text.slice(end));
      caretAfter.current = start + insert.length;
    }
  };

  const tokens = findTokens(text, commands, mentions);
  const dict = dictation && dictation.end <= text.length ? dictation : null;

  // ─── Suggestions ──────────────────────────────────────────────────────────

  const trigger = focused && !listening && !disabled ? findTrigger(text, caret, commands.length > 0, mentions.length > 0) : null;
  const triggerKey = trigger ? `${trigger.char}${trigger.start}` : "";
  const [dismissed, setDismissed] = useState("");
  const options: Option[] =
    !trigger || triggerKey === dismissed
      ? []
      : trigger.char === "/"
        ? rank(commands, trigger.query, (c) => c.name).map((c) => ({
            key: c.name,
            label: `/${c.name}`,
            hint: c.description,
            insert: `/${c.name} `,
            mention: false,
          }))
        : rank(mentions, trigger.query, (p) => p.label).map((p) => ({
            key: p.id,
            label: p.label,
            hint: p.description,
            avatar: p.avatar,
            insert: `@${p.label} `,
            mention: true,
          }));
  const menuOpen = options.length > 0;

  // The highlight goes back to the top whenever the query changes.
  const queryKey = trigger ? `${triggerKey}:${trigger.query}` : "";
  const [active, setActive] = useState(0);
  const [activeFor, setActiveFor] = useState(queryKey);
  if (activeFor !== queryKey) {
    setActiveFor(queryKey);
    setActive(0);
  }
  const activeIndex = Math.min(active, options.length - 1);
  const optionId = (i: number) => `${id}-option-${i}`;

  useEffect(() => {
    if (menuOpen) document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
  });

  const choose = (option: Option) => {
    if (!trigger) return;
    replaceRange(trigger.start, caret, option.insert);
  };

  // ─── Files ────────────────────────────────────────────────────────────────

  const filesRef = useRef(files);
  useEffect(() => {
    filesRef.current = files;
  });
  useEffect(
    () => () => {
      filesRef.current.forEach((f) => f.url && URL.revokeObjectURL(f.url));
      clearTimeout(noticeTimer.current);
    },
    [],
  );

  const addFiles = (list: FileList | File[]) => {
    if (!attach || disabled) return;
    const incoming = Array.from(list);
    if (!incoming.length) return;
    const room = maxFiles - files.length;
    const fits = incoming.filter((f) => matchesAccept(f, accept));
    const small = fits.filter((f) => f.size <= maxFileSizeMb * 1024 * 1024);
    const taken = small.slice(0, Math.max(0, room));
    if (fits.length < incoming.length) flash("That file type isn't supported");
    else if (small.length < fits.length) flash(`Files can be up to ${maxFileSizeMb} MB`);
    else if (taken.length < small.length) flash(`Up to ${maxFiles} files`);
    if (!taken.length) return;
    setFiles((all) => [
      ...all,
      ...taken.map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        url: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      })),
    ]);
  };

  const removeFile = (fileId: string) => {
    setFiles((all) => {
      const gone = all.find((f) => f.id === fileId);
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return all.filter((f) => f.id !== fileId);
    });
    field.current?.focus();
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!attach || !e.clipboardData.files.length) return;
    e.preventDefault();
    addFiles(e.clipboardData.files);
  };

  const hasFiles = (e: DragEvent) => attach && !disabled && Array.from(e.dataTransfer.types).includes("Files");
  const onDragEnter = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragLeave = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  // ─── Sending ──────────────────────────────────────────────────────────────

  const canSend = !disabled && !listening && status === "idle" && (text.trim().length > 0 || files.length > 0);

  const submit = async () => {
    if (!canSend) return;
    const sentText = text;
    const sentFiles = files;
    const prompt: PromptSubmission = {
      text: sentText.trim(),
      files: sentFiles.map((f) => f.file),
      model,
      command: tokens.find((t) => t.type === "command")?.name,
      mentions: [...new Map(tokens.flatMap((t) => (t.type === "mention" ? [[t.item.id, t.item] as const] : []))).values()],
    };
    setText("");
    setFiles([]);
    setDictation(null);
    setPending(true);
    try {
      await onSubmit?.(prompt);
      sentFiles.forEach((f) => f.url && URL.revokeObjectURL(f.url));
    } catch {
      setText(sentText);
      setFiles(sentFiles);
      flash("Couldn't send. Try again.");
    } finally {
      setPending(false);
    }
  };

  // ─── Voice ────────────────────────────────────────────────────────────────

  const endSession = (s: VoiceSession) => {
    stopTracks(s.stream);
    if (session.current === s) {
      session.current = null;
      setMicStream(null);
    }
  };

  const startVoice = async () => {
    if (listening || disabled || !canListen) return;
    const base = text;
    const lead = base && !/\s$/.test(base) ? `${base} ` : base;
    const s: VoiceSession = { id: ++sessionCount.current, base, stream: null, chunks: [], keep: false };
    session.current = s;
    setDictation(null);
    setVoiceState("listening");
    // The mic button is about to go, so keys (Enter keeps, Esc cancels) go to the field.
    // Touch screens skip this, so the keyboard doesn't open over the recorder.
    if (!window.matchMedia("(pointer: coarse)").matches) field.current?.focus();

    try {
      s.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      s.stream = null;
    }
    if (session.current !== s) return stopTracks(s.stream);
    setMicStream(s.stream);

    if (transcribe) {
      if (!s.stream) {
        endSession(s);
        setVoiceState("off");
        return flash("Microphone access is blocked");
      }
      const recorder = new MediaRecorder(s.stream);
      s.recorder = recorder;
      recorder.ondataavailable = (e) => e.data.size && s.chunks.push(e.data);
      recorder.onstop = async () => {
        endSession(s);
        if (!s.keep) return;
        const ctrl = new AbortController();
        s.abort = ctrl;
        session.current = s;
        try {
          const said = (await transcribe(new Blob(s.chunks, { type: recorder.mimeType }), ctrl.signal)).trim();
          if (ctrl.signal.aborted || session.current !== s) return;
          if (said) {
            const next = lead + said;
            setText(next);
            setDictation({ id: s.id, start: lead.length, settled: next.length, end: next.length });
            caretAfter.current = next.length;
          }
        } catch {
          if (!ctrl.signal.aborted) flash("Couldn't transcribe that");
        } finally {
          if (session.current === s) {
            session.current = null;
            setVoiceState("off");
          }
        }
      };
      recorder.start();
      return;
    }

    const Ctor = getRecognition();
    if (!Ctor) return;
    const rec = new Ctor();
    s.recognition = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    rec.onresult = (e) => {
      if (session.current !== s) return;
      let sure = "";
      let guess = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) sure += e.results[i][0].transcript;
        else guess += e.results[i][0].transcript;
      }
      const heard = (sure + guess).replace(/^\s+/, "");
      const sureLength = Math.max(0, sure.replace(/^\s+/, "").length);
      setText(lead + heard);
      setDictation({ id: s.id, start: lead.length, settled: lead.length + sureLength, end: lead.length + heard.length });
    };
    rec.onerror = (e) => {
      if (session.current !== s) return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        flash("Microphone access is blocked");
        cancelVoice();
      } else if (e.error === "no-speech") flash("Didn't catch that");
    };
    // The browser stops on its own after a long silence: keep what was heard.
    rec.onend = () => {
      if (session.current === s) finishVoice();
    };
    try {
      rec.start();
    } catch {
      endSession(s);
      setVoiceState("off");
    }
  };

  /** Keeps what was heard. */
  const finishVoice = () => {
    const s = session.current;
    if (!s) return;
    s.keep = true;
    if (s.recorder) {
      // The recorder's stop handler takes it from here.
      setVoiceState("transcribing");
      if (s.recorder.state !== "inactive") s.recorder.stop();
      return;
    }
    s.recognition?.abort();
    endSession(s);
    setVoiceState("off");
    setDictation((d) => (d ? { ...d, settled: d.end } : d));
    caretAfter.current = (field.current?.value ?? text).length;
  };

  /** Throws away what was heard and puts the earlier text back. */
  const cancelVoice = () => {
    const s = session.current;
    if (!s) return;
    s.keep = false;
    s.abort?.abort();
    s.recognition?.abort();
    if (s.recorder?.state === "recording") s.recorder.stop();
    endSession(s);
    session.current = null;
    setVoiceState("off");
    setDictation(null);
    if (s.recognition) setText(s.base);
    field.current?.focus();
  };

  useEffect(
    () => () => {
      const s = session.current;
      session.current = null;
      if (!s) return;
      s.abort?.abort();
      s.recognition?.abort();
      if (s.recorder?.state === "recording") s.recorder.stop();
      stopTracks(s.stream);
    },
    [],
  );

  // ─── Keys ─────────────────────────────────────────────────────────────────

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    if (listening) {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelVoice();
      } else if (e.key === "Enter" && voiceState === "listening") {
        e.preventDefault();
        finishVoice();
      }
      return;
    }

    if (menuOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setActive((activeIndex + step + options.length) % options.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        choose(options[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDismissed(triggerKey);
        return;
      }
    }

    // A tinted /command or @mention goes in one Backspace.
    if (e.key === "Backspace" && !e.metaKey && !e.altKey && !e.ctrlKey) {
      const el = e.currentTarget;
      if (el.selectionStart === el.selectionEnd) {
        const hit = tokens.find((t) => t.end === el.selectionStart);
        if (hit) {
          e.preventDefault();
          replaceRange(hit.start, hit.end, "");
          return;
        }
      }
    }

    // On touch keyboards Enter starts a new line; the button sends.
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (e.key === "Enter" && !e.shiftKey && !touch) {
      e.preventDefault();
      void submit();
    }
  };

  const readCaret = () => setCaret(field.current?.selectionStart ?? 0);

  // ─── Render ───────────────────────────────────────────────────────────────

  const showVoice = voice && canListen;
  const listId = `${id}-list`;

  return (
    <div
      className={cn("relative w-full max-w-2xl", disabled && "opacity-60", className)}
      onDragEnter={onDragEnter}
      onDragOver={(e) => hasFiles(e) && e.preventDefault()}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="menu"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: side === "top" ? 4 : -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: side === "top" ? 4 : -4, scale: 0.98 }}
            transition={{ duration: 0.18, ease: EASE }}
            style={{ transformOrigin: side === "top" ? "bottom center" : "top center" }}
            className={cn(
              "edge-outer absolute inset-x-0 z-20 rounded-2xl bg-background p-1 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.25)]",
              side === "top" ? "bottom-full mb-2" : "top-full mt-2",
            )}
          >
            <div id={listId} role="listbox" aria-label={trigger?.char === "/" ? "Commands" : "People"} className="max-h-64 overflow-y-auto">
              {options.map((o, i) => (
                <div
                  key={o.key}
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === activeIndex}
                  onPointerDown={(e) => e.preventDefault()}
                  onPointerMove={() => i !== activeIndex && setActive(i)}
                  onClick={() => choose(o)}
                  className={cn(
                    "flex h-10 cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-sm pointer-coarse:h-11",
                    i === activeIndex && "bg-muted",
                  )}
                >
                  {o.mention && <Avatar label={o.label} src={o.avatar} />}
                  <span className="shrink-0 font-medium text-foreground">{o.label}</span>
                  {o.hint && <span className="min-w-0 truncate text-muted-foreground">{o.hint}</span>}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className="edge-tile rounded-2xl bg-muted p-1.5 transition-shadow duration-200 focus-within:shadow-[0_0_0_4px_color-mix(in_srgb,var(--foreground)_5%,transparent)]"
        onPointerDown={(e) => {
          // A click on the box's padding still lands in the field.
          if (e.target === e.currentTarget) {
            e.preventDefault();
            field.current?.focus();
          }
        }}
      >
        <AnimatePresence initial={false}>
          {files.length > 0 && (
            <motion.div
              key="files"
              initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.26, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="flex gap-1.5 overflow-x-auto pb-1.5 [scrollbar-width:none]">
                <AnimatePresence mode="popLayout" initial={false}>
                  {files.map((f) => (
                    <motion.div
                      key={f.id}
                      layout={!reduce}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92, filter: "blur(3px)" }}
                      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92, filter: "blur(3px)" }}
                      transition={{ duration: 0.22, ease: EASE }}
                      className="shrink-0"
                    >
                      <FileChip item={f} onRemove={() => removeFile(f.id)} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div ref={mirror} className={cn(TEXT, "text-foreground")}>
              <Mirror text={text} tokens={tokens} dictation={dict} reduce={reduce} />
            </div>
          </div>
          <textarea
            ref={field}
            rows={1}
            value={text}
            disabled={disabled}
            readOnly={listening}
            placeholder={listening ? (voiceState === "transcribing" ? "Transcribing…" : "Listening…") : placeholder}
            aria-label={label}
            role={commands.length || mentions.length ? "combobox" : undefined}
            aria-expanded={commands.length || mentions.length ? menuOpen : undefined}
            aria-controls={menuOpen ? listId : undefined}
            aria-autocomplete={commands.length || mentions.length ? "list" : undefined}
            aria-activedescendant={menuOpen ? optionId(activeIndex) : undefined}
            onChange={(e) => {
              setText(e.target.value);
              setCaret(e.target.selectionStart);
              if (dictation) setDictation(null);
            }}
            onSelect={readCaret}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onScroll={syncScroll}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={cn(
              TEXT,
              "relative block min-h-10 w-full resize-none bg-transparent text-transparent caret-foreground outline-none [scrollbar-width:none] placeholder:text-muted-foreground selection:bg-foreground/15 [&::-webkit-scrollbar]:hidden",
            )}
          />
        </div>

        {/* Above the box's edge highlight, so the model list isn't drawn under it. */}
        <div className="relative z-10 flex h-8 items-center gap-1 pointer-coarse:h-10">
          <AnimatePresence mode="popLayout" initial={false}>
            {listening ? (
              <motion.div
                key="recorder"
                initial={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(2px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(2px)" }}
                transition={{ duration: 0.2, ease: EASE }}
                className="flex min-w-0 flex-1 items-center gap-1"
              >
                <button type="button" className={TOOL} aria-label="Cancel dictation" onClick={cancelVoice}>
                  <IconX size={16} />
                </button>
                <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1">
                  {voiceState === "transcribing" ? (
                    <Shimmer reduce={reduce}>Transcribing</Shimmer>
                  ) : (
                    <>
                      <Waveform stream={micStream} reduce={reduce} />
                      <Elapsed />
                    </>
                  )}
                </div>
                <button
                  type="button"
                  className={PRIMARY}
                  aria-label="Done"
                  disabled={voiceState === "transcribing"}
                  onClick={finishVoice}
                >
                  <Swap id={voiceState === "transcribing" ? "wait" : "done"} reduce={reduce}>
                    {voiceState === "transcribing" ? <IconLoader2 size={16} className="animate-spin" /> : <IconCheck size={16} stroke={2.25} />}
                  </Swap>
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="tools"
                initial={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(2px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, filter: "blur(2px)" }}
                transition={{ duration: 0.2, ease: EASE }}
                className="flex min-w-0 flex-1 items-center gap-1"
              >
                {attach && (
                  <>
                    <input
                      ref={picker}
                      type="file"
                      multiple
                      accept={accept || undefined}
                      hidden
                      onChange={(e) => {
                        if (e.target.files) addFiles(e.target.files);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      className={TOOL}
                      aria-label="Attach files"
                      disabled={disabled || files.length >= maxFiles}
                      onClick={() => picker.current?.click()}
                    >
                      <IconPaperclip size={16} />
                    </button>
                  </>
                )}
                {models.length > 0 && (
                  <ModelPicker models={models} value={model} onChange={pickModel} side={side} reduce={reduce} disabled={disabled} />
                )}
                <div className="flex min-w-0 flex-1 items-center px-1.5">
                  <AnimatePresence mode="wait" initial={false}>
                    {notice && (
                      <motion.p
                        key={notice.id}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 3, filter: "blur(2px)" }}
                        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2, ease: EASE }}
                        className="truncate text-xs text-muted-foreground"
                      >
                        {notice.text}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
                {showVoice && (
                  <button type="button" className={TOOL} aria-label="Dictate" disabled={disabled || status !== "idle"} onClick={startVoice}>
                    <IconMicrophone size={16} />
                  </button>
                )}
                <motion.button
                  type="button"
                  onClick={status === "streaming" ? onStop : () => void submit()}
                  disabled={status === "streaming" ? !onStop : !canSend}
                  aria-label={status === "streaming" ? "Stop" : status === "submitting" ? "Sending" : "Send"}
                  whileTap={reduce ? undefined : { scale: 0.92 }}
                  className={PRIMARY}
                >
                  <Swap id={status} reduce={reduce}>
                    {status === "streaming" ? (
                      <IconPlayerStopFilled size={14} />
                    ) : status === "submitting" ? (
                      <IconLoader2 size={16} className="animate-spin" />
                    ) : (
                      <IconArrowUp size={16} stroke={2.25} />
                    )}
                  </Swap>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {dragging && (
          <motion.div
            key="drop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl border border-dashed border-foreground/20 bg-background/85 backdrop-blur-[2px]"
          >
            <motion.div
              initial={reduce ? false : { scale: 0.96, y: 3 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="edge-tile flex items-center gap-2 rounded-xl bg-muted px-3.5 py-2.5 text-sm"
            >
              <IconPaperclip size={16} />
              Drop to attach
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <span className="sr-only" role="status">
        {notice?.text ?? (voiceState === "listening" ? "Listening" : voiceState === "transcribing" ? "Transcribing" : "")}
      </span>
    </div>
  );
}

// ─── Mirror ──────────────────────────────────────────────────────────────────

// Spans that have already played their entrance, so a re-render never replays it.
const entered = new WeakSet<Element>();

/** The text, drawn exactly where the textarea draws its own (transparent) copy. */
function Mirror({ text, tokens, dictation, reduce }: { text: string; tokens: Token[]; dictation: Dictation | null; reduce: boolean }) {
  type Piece = { start: number; end: number; kind: "plain" | "token" | "spoken" };
  const marks: Piece[] = tokens
    .filter((t) => !dictation || t.end <= dictation.start || t.start >= dictation.end)
    .map((t) => ({ start: t.start, end: t.end, kind: "token" as const }));
  if (dictation && dictation.end > dictation.start) marks.push({ start: dictation.start, end: dictation.end, kind: "spoken" });
  marks.sort((a, b) => a.start - b.start);

  const pieces: Piece[] = [];
  let at = 0;
  for (const m of marks) {
    if (m.start > at) pieces.push({ start: at, end: m.start, kind: "plain" });
    pieces.push(m);
    at = m.end;
  }
  if (at < text.length) pieces.push({ start: at, end: text.length, kind: "plain" });

  // A word that arrives blurs in once; a guess sits faint until the browser is sure.
  const arrive = (el: HTMLSpanElement | null) => {
    if (!el || entered.has(el)) return;
    entered.add(el);
    el.animate(
      reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, filter: "blur(4px)" }, { opacity: 1, filter: "blur(0px)" }],
      { duration: reduce ? 150 : 340, easing: CSS_EASE },
    );
  };

  return (
    <>
      {pieces.map((p) => {
        const slice = text.slice(p.start, p.end);
        if (p.kind === "plain") return <span key={`p${p.start}`}>{slice}</span>;
        if (p.kind === "token") return <span key={`t${p.start}`} className={TOKEN}>{slice}</span>;
        const words: ReactNode[] = [];
        const re = /\S+\s*|\s+/g;
        let m: RegExpExecArray | null;
        let n = 0;
        while ((m = re.exec(slice))) {
          const from = p.start + m.index;
          words.push(
            <span
              key={`${dictation!.id}-${n++}`}
              ref={arrive}
              className={cn("transition-colors duration-300", from >= dictation!.settled && "text-muted-foreground")}
            >
              {m[0]}
            </span>,
          );
        }
        return <span key={`s${p.start}`}>{words}</span>;
      })}
      {/* Holds the height of a trailing new line, as the textarea does. */}
      {"​"}
    </>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

/** Icons that cross-fade in place, so the button never changes size. */
function Swap({ id, reduce, children }: { id: string; reduce: boolean; children: ReactNode }) {
  return (
    <span className="grid place-items-center [grid-template-areas:'stack'] *:[grid-area:stack]">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={id}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, filter: "blur(2px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, filter: "blur(2px)" }}
          transition={{ duration: 0.18, ease: EASE }}
          className="grid place-items-center"
        >
          {children}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Avatar({ label, src }: { label: string; src?: string }) {
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span className="grid size-6 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
      {/* eslint-disable-next-line @next/next/no-img-element -- any avatar URL the app passes in */}
      {src ? <img src={src} alt="" width={24} height={24} loading="lazy" decoding="async" className="size-full object-cover" /> : initials}
    </span>
  );
}

function FileChip({ item, onRemove }: { item: Attachment; onRemove: () => void }) {
  return (
    <div className="edge-tile flex h-11 max-w-52 shrink-0 items-center gap-2 overflow-hidden rounded-lg bg-background pr-1 pl-1">
      <div className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local blob URL, nothing to optimise */}
        {item.url ? <img src={item.url} alt="" decoding="async" className="size-full object-cover" /> : <IconFile size={16} />}
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-[13px] font-medium">{item.file.name}</p>
        <p className="text-xs text-muted-foreground tabular-nums">{formatSize(item.file.size)}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.file.name}`}
        className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/40 pointer-coarse:size-8"
      >
        <IconX size={14} />
      </button>
    </div>
  );
}

function ModelPicker({
  models,
  value,
  onChange,
  side,
  reduce,
  disabled,
}: {
  models: readonly PromptModel[];
  value?: string;
  onChange: (id: string) => void;
  side: "top" | "bottom";
  reduce: boolean;
  disabled: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const selected = models.findIndex((m) => m.id === value);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const show = () => {
    setActive(Math.max(0, selected));
    setOpen(true);
  };
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };
  const pick = (i: number) => {
    onChange(models[i].id);
    close();
  };

  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && close(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = models.length - 1;
    const moves: Record<string, number> = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: last };
    if (e.key in moves) {
      e.preventDefault();
      setActive(Math.min(last, Math.max(0, moves[e.key])));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      close();
    }
  };

  return (
    <div ref={root} className="relative min-w-0">
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Model: ${models[selected]?.name ?? "none"}`}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            show();
          }
        }}
        className="flex h-8 max-w-40 items-center gap-1 rounded-lg pr-1.5 pl-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/40 aria-expanded:bg-background aria-expanded:text-foreground pointer-coarse:h-10"
      >
        <span className="truncate">{models[selected]?.name ?? "Model"}</span>
        <IconChevronDown
          size={14}
          className={cn("shrink-0 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={list}
            role="listbox"
            tabIndex={-1}
            aria-label="Model"
            aria-activedescendant={`${id}-${active}`}
            onKeyDown={onKeyDown}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: side === "top" ? 4 : -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: side === "top" ? 4 : -4, scale: 0.97 }}
            transition={{ duration: 0.16, ease: EASE }}
            style={{ transformOrigin: side === "top" ? "bottom left" : "top left" }}
            className={cn(
              "edge-outer absolute left-0 z-30 w-64 max-w-[calc(100vw-2rem)] rounded-2xl bg-background p-1 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.25)] outline-none",
              side === "top" ? "bottom-full mb-2" : "top-full mt-2",
            )}
          >
            {models.map((m, i) => (
              <div
                key={m.id}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === selected}
                onPointerMove={() => i !== active && setActive(i)}
                onClick={() => pick(i)}
                className={cn("flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2", i === active && "bg-muted")}
              >
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  {m.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{m.description}</p>}
                </div>
                <IconCheck size={16} className={cn("shrink-0", i === selected ? "opacity-100" : "opacity-0")} />
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** m:ss since it appeared, written straight to the DOM so the box doesn't re-render each tick. */
function Elapsed() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const since = Date.now();
    const write = () => {
      const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
      if (ref.current) ref.current.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    };
    write();
    const timer = setInterval(write, 250);
    return () => clearInterval(timer);
  }, []);
  return <span ref={ref} className="shrink-0 text-xs text-muted-foreground tabular-nums">0:00</span>;
}

/** Text with a soft highlight passing across it. Plain grey when motion is off. */
function Shimmer({ children, reduce }: { children: ReactNode; reduce: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (reduce) return;
    const run = ref.current?.animate([{ backgroundPosition: "100% 0" }, { backgroundPosition: "0% 0" }], {
      duration: 1800,
      iterations: Infinity,
      easing: "linear",
    });
    return () => run?.cancel();
  }, [reduce]);
  return (
    <span
      ref={ref}
      className="truncate text-[13px] text-muted-foreground"
      style={
        reduce
          ? undefined
          : {
              backgroundImage: "linear-gradient(90deg, var(--muted-foreground) 35%, var(--foreground) 50%, var(--muted-foreground) 65%)",
              backgroundSize: "300% 100%",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              color: "transparent",
            }
      }
    >
      {children}
    </span>
  );
}

const BAR = 2; // px
const GAP = 2; // px
const SAMPLE_MS = 55; // one new bar this often

/**
 * The recent loudness of the voice as bars that scroll in from the right, so
 * it reads as a recording rather than a meter. Bars glide between samples, so
 * the strip moves continuously. Before any sound, the strip is a row of dots.
 */
function Waveform({ stream, reduce }: { stream: MediaStream | null; reduce: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = el.clientWidth;
      height = el.clientHeight;
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let audio: AudioContext | undefined;
    let analyser: AnalyserNode | undefined;
    const wave = new Uint8Array(1024);
    if (stream) {
      audio = new AudioContext();
      void audio.resume();
      analyser = audio.createAnalyser();
      analyser.fftSize = 1024;
      audio.createMediaStreamSource(stream).connect(analyser);
    }

    const levels: number[] = [];
    let peak = 0; // the loudest moment since the last bar
    let lastSample = performance.now();
    let color = getComputedStyle(el).color;
    let frame = 0;

    const draw = (now: number) => {
      if (analyser) {
        analyser.getByteTimeDomainData(wave);
        let sum = 0;
        for (let i = 0; i < wave.length; i++) {
          const v = (wave[i] - 128) / 128;
          sum += v * v;
        }
        peak = Math.max(peak, Math.sqrt(sum / wave.length));
      }
      while (now - lastSample >= SAMPLE_MS) {
        // Speech RMS sits around 0.02–0.2; a square root spreads it over the height.
        levels.push(Math.min(1, Math.sqrt(peak * 6)));
        if (levels.length > 400) levels.shift();
        peak = 0;
        lastSample += SAMPLE_MS;
        color = getComputedStyle(el).color;
      }

      const step = BAR + GAP;
      const glide = reduce ? 0 : ((now - lastSample) / SAMPLE_MS) * step;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = color;
      const count = Math.ceil(width / step) + 1;
      for (let i = 0; i < count; i++) {
        const x = width - BAR - i * step - glide;
        if (x < -BAR) break;
        const level = levels[levels.length - 1 - i];
        const h = level === undefined ? BAR : Math.max(BAR, level * height);
        ctx.globalAlpha = level === undefined ? 0.25 : 0.75;
        ctx.beginPath();
        ctx.roundRect(x, (height - h) / 2, BAR, h, BAR / 2);
        ctx.fill();
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      void audio?.close();
    };
  }, [stream, reduce]);

  return (
    <canvas
      ref={canvas}
      aria-hidden
      className="h-6 min-w-0 flex-1 text-foreground mask-[linear-gradient(to_right,transparent,black_32px)]"
    />
  );
}
