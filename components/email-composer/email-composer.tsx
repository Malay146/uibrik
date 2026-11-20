"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  IconArrowBackUp,
  IconCheck,
  IconChevronDown,
  IconClock,
  IconCopy,
  IconFile,
  IconFileTypePdf,
  IconPaperclip,
  IconPhoto,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import useMeasure from "react-use-measure";
import { cn } from "@/lib/utils";
import { Avatar, EASE_OUT, FOCUS, FRAME, RULE } from "../_app/app-kit";

// Email composer. Recipients are chips: type a name or address and pick from
// the suggestions (arrows and Enter), or end a raw address with a comma.
// Backspace in an empty field selects the last chip, a second press removes
// it. Hovering a chip (or focusing or tapping it) opens a card with the
// person's role, local time and a copy button.
//
// Files attach from the paperclip or by dropping them anywhere on the
// composer; each uploads with its own progress bar and images show a preview.
// The send button's arrow opens scheduling: quick presets or a custom time,
// after which the button schedules instead and a pill says when. Sending folds
// the draft away with an undo for a few seconds. Cmd/Ctrl+Enter sends.

const SPRING = { type: "spring", duration: 0.35, bounce: 0.12 } as const;
const FADE = { duration: 0.18, ease: EASE_OUT } as const;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;

export type Contact = {
  name: string;
  email: string;
  avatar?: string;
  title?: string;
  company?: string;
  /** IANA time zone for the local time on their card, e.g. "Europe/Berlin". */
  timeZone?: string;
};

export type Attachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  /** 0 to 1. */
  progress: number;
  /** Object URL for image previews. */
  url?: string;
};

export type EmailDraft = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  attachments: { name: string; size: number; type: string }[];
  /** When it should go out, or null to send now. */
  scheduledAt: Date | null;
};

// Photos from unsplash.com (Unsplash License), self-hosted: mpDV4xaFP8c,
// mEZ3PoFGs_k, y3kC_7Qhmjk, oVi586BZ2lY, p5BoBF0XJUA, P3i8MtIT1ug,
// ARBQCe2GrjQ, ILip77SbmOE.
const photo = (n: string) => `https://uibrik.com/registry/email-composer/${n}.webp`;
export const SAMPLE_CONTACTS: Contact[] = [
  { name: "Elena Rossi", email: "elena@lumen.studio", avatar: photo("elena"), title: "Design Director", company: "Lumen", timeZone: "Europe/Rome" },
  { name: "Omar Haddad", email: "omar@northwind.io", avatar: photo("omar"), title: "Head of Sales", company: "Northwind", timeZone: "Asia/Dubai" },
  { name: "Priya Shah", email: "priya@orbit.dev", avatar: photo("priya"), title: "Staff Engineer", company: "Orbit", timeZone: "Asia/Kolkata" },
  { name: "Daniel Kim", email: "daniel@fable.co", avatar: photo("daniel"), title: "Product Manager", company: "Fable", timeZone: "America/Los_Angeles" },
  { name: "Chloé Martin", email: "chloe@atelier.fr", avatar: photo("chloe"), title: "Brand Lead", company: "Atelier", timeZone: "Europe/Paris" },
  { name: "Lucas Silva", email: "lucas@verde.com.br", avatar: photo("lucas"), title: "Founder", company: "Verde", timeZone: "America/Sao_Paulo" },
  { name: "Hana Sato", email: "hana@kumo.jp", avatar: photo("hana"), title: "Engineering Manager", company: "Kumo", timeZone: "Asia/Tokyo" },
  { name: "Marco Bianchi", email: "marco@lumen.studio", avatar: photo("marco"), title: "Motion Designer", company: "Lumen", timeZone: "Europe/Rome" },
];

export type EmailComposerProps = {
  /** People suggested as you type and shown on hover cards. */
  contacts?: readonly Contact[];
  /** Addresses in To on mount. */
  defaultTo?: readonly string[];
  defaultSubject?: string;
  defaultBody?: string;
  /** Files already attached on mount (shown as uploaded). */
  defaultAttachments?: readonly { name: string; size: number; type: string }[];
  /** Sender shown in the From row. */
  from?: string;
  /** Show the schedule-send menu on the send button. */
  schedule?: boolean;
  /** Delay before a chip's card opens on hover, ms. */
  hoverDelay?: number;
  /** Largest file accepted, MB. */
  maxFileMB?: number;
  /** Seconds the undo stays after sending. */
  undoSeconds?: number;
  onSend?: (draft: EmailDraft) => void;
  className?: string;
};

type Recipient = { email: string; name?: string };

const fmtSize = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;

export function EmailComposer({
  contacts = SAMPLE_CONTACTS,
  defaultTo = ["elena@lumen.studio", "omar@northwind.io"],
  defaultSubject = "Q3 launch plan",
  defaultBody = "Hi both,\n\nAttached is the plan for the Q3 launch. Could you look through the timeline before Thursday? Happy to walk through it on a call.\n\nThanks!",
  defaultAttachments = [{ name: "Q3 launch plan.pdf", size: 2_480_000, type: "application/pdf" }],
  from = "you@company.com",
  schedule = true,
  hoverDelay = 350,
  maxFileMB = 25,
  undoSeconds = 5,
  onSend,
  className,
}: EmailComposerProps) {
  const uid = useId();
  const byEmail = (e: string) => contacts.find((c) => c.email.toLowerCase() === e.toLowerCase());
  const toRecipients = (list: readonly string[]) => list.map((e) => ({ email: e, name: byEmail(e)?.name }));

  const [to, setTo] = useState<Recipient[]>(() => toRecipients(defaultTo));
  const [cc, setCc] = useState<Recipient[]>([]);
  const [bcc, setBcc] = useState<Recipient[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [files, setFiles] = useState<Attachment[]>(() =>
    defaultAttachments.map((f, i) => ({ ...f, id: `pre-${i}`, progress: 1 })),
  );
  const [when, setWhen] = useState<Date | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sent, setSent] = useState<null | { scheduled: Date | null }>(null);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const urls = useRef(new Set<string>());

  // Revoke image previews on unmount.
  useEffect(() => {
    const set = urls.current;
    return () => set.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  // Simulated uploads: every pending file advances at ~4 MB/s, while any are pending.
  const uploading = files.some((f) => f.progress < 1);
  useEffect(() => {
    if (!uploading) return;
    const t = setInterval(() => {
      setFiles((list) => list.map((f) => (f.progress < 1 ? { ...f, progress: Math.min(1, f.progress + (0.12 * 4_000_000) / Math.max(f.size, 200_000) / 1.2) } : f)));
    }, 120);
    return () => clearInterval(t);
  }, [uploading]);

  const reset = () => {
    setTo([]);
    setCc([]);
    setBcc([]);
    setShowCc(false);
    setShowBcc(false);
    setSubject("");
    setBody("");
    setFiles([]);
    setWhen(null);
  };

  // The undo window after sending.
  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => {
      setSent(null);
      reset();
    }, undoSeconds * 1000);
    return () => clearTimeout(t);
  }, [sent, undoSeconds]);

  const addFiles = (list: FileList | File[]) => {
    const max = maxFileMB * 1024 * 1024;
    const next: Attachment[] = [];
    for (const f of Array.from(list)) {
      if (f.size > max) {
        setError(`${f.name} is over ${maxFileMB} MB.`);
        continue;
      }
      const url = f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined;
      if (url) urls.current.add(url);
      next.push({ id: `${Date.now()}-${f.name}-${Math.random().toString(36).slice(2, 7)}`, name: f.name, size: f.size, type: f.type, progress: 0, url });
    }
    if (next.length) setFiles((cur) => [...cur, ...next]);
  };

  const removeFile = (id: string) =>
    setFiles((cur) => {
      const f = cur.find((x) => x.id === id);
      if (f?.url) {
        URL.revokeObjectURL(f.url);
        urls.current.delete(f.url);
      }
      return cur.filter((x) => x.id !== id);
    });

  const send = () => {
    const all = [...to, ...cc, ...bcc];
    if (!to.length && !all.length) {
      setError("Add at least one recipient.");
      setShake((n) => n + 1);
      return;
    }
    const bad = all.find((r) => !EMAIL.test(r.email));
    if (bad) {
      setError(`"${bad.email}" isn't a valid address.`);
      setShake((n) => n + 1);
      return;
    }
    if (uploading) {
      setError("Wait for attachments to finish uploading.");
      return;
    }
    setError("");
    onSend?.({
      to: to.map((r) => r.email),
      cc: cc.map((r) => r.email),
      bcc: bcc.map((r) => r.email),
      subject,
      body,
      attachments: files.map(({ name, size, type }) => ({ name, size, type })),
      scheduledAt: when,
    });
    setSent({ scheduled: when });
  };

  const onDrag = (e: DragEvent<HTMLDivElement>, kind: "enter" | "leave" | "over" | "drop") => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    if (kind === "enter") dragDepth.current++;
    if (kind === "leave") dragDepth.current--;
    if (kind === "drop") {
      dragDepth.current = 0;
      addFiles(e.dataTransfer.files);
    }
    setDragging(dragDepth.current > 0);
  };

  const fieldProps = { contacts, hoverDelay, byEmail, uid };
  const [measure, bounds] = useMeasure();

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        // Real height, not a scale, so nothing inside ever stretches.
        animate={bounds.height ? { height: bounds.height } : undefined}
        transition={SPRING}
        className={cn(FRAME, "relative w-full max-w-2xl shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_9%,transparent),0_12px_32px_-16px_rgb(0_0_0/0.18)]", className)}
        onDragEnter={(e) => onDrag(e, "enter")}
        onDragLeave={(e) => onDrag(e, "leave")}
        onDragOver={(e) => onDrag(e, "over")}
        onDrop={(e) => onDrag(e, "drop")}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !sent) {
            e.preventDefault();
            send();
          }
        }}
      >
        <div ref={measure}>
        <AnimatePresence mode="popLayout" initial={false}>
          {sent ? (
            <motion.div
              key="sent"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={FADE}
              className="flex items-center gap-3 py-2.5 pl-3 pr-2"
              role="status"
            >
              <span className="grid size-8 place-items-center rounded-full bg-foreground text-background">
                {sent.scheduled ? <IconClock size={16} stroke={2} /> : <IconCheck size={16} stroke={2.25} />}
              </span>
              <p className="min-w-0 flex-1 text-sm text-foreground">
                {sent.scheduled ? (
                  <>
                    Scheduled for <span className="font-medium">{fmtWhen(sent.scheduled)}</span>
                  </>
                ) : (
                  "Message sent"
                )}
              </p>
              <button
                type="button"
                onClick={() => setSent(null)}
                className={cn("inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-[13px] font-medium text-foreground hover:bg-muted", FOCUS)}
              >
                <IconArrowBackUp size={16} stroke={1.75} />
                Undo
              </button>
            </motion.div>
          ) : (
            <motion.div key="draft" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={FADE}>
              <div className={cn("flex h-11 items-center gap-3 border-b px-4 text-[13px]", RULE)}>
                <span className="w-12 shrink-0 text-muted-foreground">From</span>
                <span className="truncate text-foreground">{from}</span>
              </div>

              <div className="relative">
                <motion.div
                  key={shake}
                  animate={shake ? { x: [0, -6, 6, -4, 4, 0] } : undefined}
                  transition={{ duration: 0.35 }}
                >
                  <RecipientField
                    {...fieldProps}
                    label="To"
                    value={to}
                    onChange={(v) => {
                      setTo(v);
                      setError("");
                    }}
                    extra={
                      <span className="flex shrink-0 items-center gap-0.5 self-start pt-1">
                        {!showCc && <Toggle onClick={() => setShowCc(true)}>Cc</Toggle>}
                        {!showBcc && <Toggle onClick={() => setShowBcc(true)}>Bcc</Toggle>}
                      </span>
                    }
                  />
                </motion.div>
                <AnimatePresence initial={false}>
                  {showCc && (
                    <Reveal key="cc">
                      <RecipientField {...fieldProps} label="Cc" value={cc} onChange={setCc} autoFocus />
                    </Reveal>
                  )}
                  {showBcc && (
                    <Reveal key="bcc">
                      <RecipientField {...fieldProps} label="Bcc" value={bcc} onChange={setBcc} autoFocus />
                    </Reveal>
                  )}
                </AnimatePresence>
                <label className="flex min-h-11 items-center gap-3 px-4 shadow-[inset_0_-1px_0_color-mix(in_srgb,var(--foreground)_6%,transparent)]">
                  <span className="w-12 shrink-0 text-[13px] text-muted-foreground">Subject</span>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="h-11 min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none"
                  />
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  aria-label="Message"
                  placeholder="Write a message"
                  className="block min-h-44 w-full resize-none bg-transparent px-4 py-3 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 [field-sizing:content]"
                />

                <AnimatePresence initial={false}>
                  {files.length > 0 && (
                    <Reveal key="files">
                      <ul className="flex flex-wrap gap-1.5 px-3 pb-3">
                        <AnimatePresence initial={false} mode="popLayout">
                          {files.map((f) => (
                            <AttachmentChip key={f.id} file={f} onRemove={() => removeFile(f.id)} />
                          ))}
                        </AnimatePresence>
                      </ul>
                    </Reveal>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {dragging && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={FADE}
                      className="pointer-events-none absolute inset-2 z-10 grid place-items-center rounded-xl border-2 border-dashed border-foreground/25 bg-background/90 backdrop-blur-[2px]"
                    >
                      <motion.div initial={{ y: 6, scale: 0.96 }} animate={{ y: 0, scale: 1 }} transition={SPRING} className="flex flex-col items-center gap-2 text-sm text-foreground">
                        <IconPaperclip size={22} stroke={1.75} />
                        Drop files to attach
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className={cn("flex flex-wrap items-center gap-2 border-t px-2 py-2", RULE)}>
                <IconButton label="Attach files" onClick={() => fileInput.current?.click()}>
                  <IconPaperclip size={17} stroke={1.75} />
                </IconButton>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  hidden
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <IconButton label="Discard draft" onClick={reset}>
                  <IconTrash size={17} stroke={1.75} />
                </IconButton>
                <AnimatePresence initial={false} mode="popLayout">
                  {error ? (
                    <motion.p
                      key="err"
                      role="alert"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={FADE}
                      className="min-w-0 flex-1 truncate text-[13px] text-red-600 dark:text-red-400"
                    >
                      {error}
                    </motion.p>
                  ) : when ? (
                    <motion.span
                      key="when"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={SPRING}
                      className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-full bg-muted pl-2.5 pr-1 text-[12.5px] text-foreground"
                    >
                      <IconClock size={14} stroke={1.75} className="text-muted-foreground" />
                      {fmtWhen(when)}
                      <button
                        type="button"
                        aria-label="Send now instead"
                        onClick={() => setWhen(null)}
                        className={cn("grid size-5 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground", FOCUS)}
                      >
                        <IconX size={12} stroke={2} />
                      </button>
                    </motion.span>
                  ) : null}
                </AnimatePresence>
                <SendButton scheduled={!!when} schedule={schedule} onSend={send} onSchedule={setWhen} className={cn(!when && !error && "ml-auto")} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </motion.div>
    </MotionConfig>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Reveal({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0, overflow: "hidden" }}
      animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
      exit={{ height: 0, opacity: 0, overflow: "hidden" }}
      transition={{ duration: 0.22, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

function Toggle({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("h-8 cursor-pointer rounded-lg px-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", FOCUS)}
    >
      {children}
    </button>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn("grid size-9 cursor-pointer place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground", FOCUS)}
    >
      {children}
    </button>
  );
}

function AttachmentChip({ file, onRemove }: { file: Attachment; onRemove: () => void }) {
  const Icon = file.type === "application/pdf" ? IconFileTypePdf : file.type.startsWith("image/") ? IconPhoto : IconFile;
  const done = file.progress >= 1;
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={SPRING}
      className="relative flex h-12 max-w-full items-center gap-2.5 overflow-hidden rounded-xl bg-muted/70 pl-1.5 pr-1 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_6%,transparent)]"
    >
      <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-background text-muted-foreground">
        {file.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.url} alt="" width={36} height={36} decoding="async" className="size-full object-cover" />
        ) : (
          <Icon size={18} stroke={1.6} />
        )}
      </span>
      <span className="min-w-0 max-w-48">
        <span className="block truncate text-[13px] font-medium text-foreground">{file.name}</span>
        <span className="block text-[11.5px] text-muted-foreground tabular-nums">
          {done ? fmtSize(file.size) : `${Math.round(file.progress * 100)}% of ${fmtSize(file.size)}`}
        </span>
      </span>
      <button
        type="button"
        aria-label={`Remove ${file.name}`}
        onClick={onRemove}
        className={cn("grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground", FOCUS)}
      >
        <IconX size={14} stroke={2} />
      </button>
      <AnimatePresence>
        {!done && (
          <motion.span
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground/[0.06]"
          >
            <span
              className="block h-full origin-left bg-foreground transition-transform duration-150 ease-linear"
              style={{ transform: `scaleX(${file.progress})` }}
            />
          </motion.span>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

// ─── Recipients ──────────────────────────────────────────────────────────────

function RecipientField({
  uid,
  label,
  value,
  onChange,
  contacts,
  byEmail,
  hoverDelay,
  extra,
  autoFocus,
}: {
  uid: string;
  label: string;
  value: Recipient[];
  onChange: (v: Recipient[]) => void;
  contacts: readonly Contact[];
  byEmail: (e: string) => Contact | undefined;
  hoverDelay: number;
  extra?: ReactNode;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [armed, setArmed] = useState(false); // last chip selected by Backspace
  const input = useRef<HTMLInputElement>(null);
  const listId = `${uid}-${label}-list`;

  const q = text.trim().toLowerCase();
  const taken = new Set(value.map((r) => r.email.toLowerCase()));
  const matches = q
    ? contacts.filter((c) => !taken.has(c.email.toLowerCase()) && (c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))).slice(0, 5)
    : [];
  const showList = open && matches.length > 0;

  const add = (r: Recipient) => {
    if (!taken.has(r.email.toLowerCase())) onChange([...value, r]);
    setText("");
    setActive(0);
    input.current?.focus();
  };

  const commitText = () => {
    const t = text.trim().replace(/[,;]$/, "");
    if (!t) return false;
    const c = byEmail(t);
    add({ email: t, name: c?.name });
    return true;
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && showList) {
      e.preventDefault();
      setActive((a) => (a + 1) % matches.length);
    } else if (e.key === "ArrowUp" && showList) {
      e.preventDefault();
      setActive((a) => (a - 1 + matches.length) % matches.length);
    } else if ((e.key === "Enter" || e.key === "Tab") && showList && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const c = matches[active]!;
      add({ email: c.email, name: c.name });
    } else if ((e.key === "Enter" || e.key === "," || e.key === ";") && !e.metaKey && !e.ctrlKey) {
      if (commitText()) e.preventDefault();
    } else if (e.key === "Backspace" && !text && value.length) {
      e.preventDefault();
      if (armed) {
        onChange(value.slice(0, -1));
        setArmed(false);
      } else setArmed(true);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else setArmed(false);
  };

  return (
    <div className="relative flex min-h-11 items-start gap-3 px-4 py-1.5 shadow-[inset_0_-1px_0_color-mix(in_srgb,var(--foreground)_6%,transparent)]">
      <label htmlFor={`${uid}-${label}`} className="w-12 shrink-0 pt-[7px] text-[13px] text-muted-foreground">
        {label}
      </label>
      <ul className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" aria-label={`${label} recipients`}>
        <AnimatePresence initial={false} mode="popLayout">
          {value.map((r, i) => (
            <Chip
              key={r.email}
              recipient={r}
              contact={byEmail(r.email)}
              hoverDelay={hoverDelay}
              selected={armed && i === value.length - 1}
              onRemove={() => {
                onChange(value.filter((x) => x.email !== r.email));
                input.current?.focus();
              }}
            />
          ))}
        </AnimatePresence>
        <li className="relative min-w-32 flex-1">
          <input
            ref={input}
            id={`${uid}-${label}`}
            autoFocus={autoFocus}
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList ? `${listId}-${active}` : undefined}
            value={text}
            onChange={(e) => {
              const v = e.target.value;
              if (/[,;]\s*$/.test(v) && EMAIL.test(v.replace(/[,;]\s*$/, "").trim())) {
                add({ email: v.replace(/[,;]\s*$/, "").trim() });
                return;
              }
              setText(v);
              setActive(0);
              setOpen(true);
              setArmed(false);
            }}
            onKeyDown={onKey}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              setArmed(false);
              commitText();
            }}
            className="h-8 w-full bg-transparent text-sm text-foreground outline-none"
          />
          <AnimatePresence>
            {showList && (
              <motion.ul
                id={listId}
                role="listbox"
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={FADE}
                className="absolute left-0 top-full z-30 mt-1 w-72 max-w-[calc(100vw-3rem)] origin-top-left rounded-xl bg-background p-1 shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_8%,transparent),0_12px_32px_-8px_rgb(0_0_0/0.25)] dark:bg-neutral-900"
              >
                {matches.map((c, i) => (
                  <li
                    key={c.email}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      add({ email: c.email, name: c.name });
                    }}
                    onPointerEnter={() => setActive(i)}
                    className={cn("flex h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2", i === active && "bg-muted")}
                  >
                    <Avatar name={c.name} src={c.avatar} size={28} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-foreground">{c.name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">{c.email}</span>
                    </span>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </li>
      </ul>
      {extra}
    </div>
  );
}

const noop = () => () => {};

function Chip({
  recipient: r,
  contact,
  hoverDelay,
  selected,
  onRemove,
}: {
  recipient: Recipient;
  contact?: Contact;
  hoverDelay: number;
  selected: boolean;
  onRemove: () => void;
}) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [card, setCard] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLLIElement>(null);
  const timer = useRef(0);
  const valid = EMAIL.test(r.email);
  const name = contact?.name ?? r.name ?? r.email;

  const openCard = (delay: number) => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => ref.current && setCard(ref.current.getBoundingClientRect()), delay);
  };
  const closeCard = (delay = 120) => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCard(null), delay);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!card) return;
    const gone = () => setCard(null);
    window.addEventListener("scroll", gone, true);
    window.addEventListener("resize", gone);
    return () => {
      window.removeEventListener("scroll", gone, true);
      window.removeEventListener("resize", gone);
    };
  }, [card]);

  return (
    <motion.li
      ref={ref}
      layout="position"
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={SPRING}
      onPointerEnter={(e) => e.pointerType === "mouse" && contact && openCard(hoverDelay)}
      onPointerLeave={(e) => e.pointerType === "mouse" && closeCard()}
      className={cn(
        "flex h-8 max-w-full items-center gap-1.5 rounded-full pl-1 pr-0.5 text-[13px] transition-[background-color,box-shadow] duration-150",
        !valid
          ? "bg-red-500/10 text-red-700 shadow-[inset_0_0_0_1px_rgb(239_68_68/0.35)] dark:text-red-300"
          : selected
            ? "bg-foreground text-background"
            : "bg-muted text-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--foreground)_6%,transparent)]",
      )}
    >
      <button
        type="button"
        onClick={() => contact && (card ? setCard(null) : openCard(0))}
        onFocus={() => contact && openCard(hoverDelay)}
        onBlur={() => closeCard(0)}
        aria-label={contact ? `${name}, ${r.email}. Show details` : r.email}
        aria-expanded={contact ? !!card : undefined}
        className={cn("flex min-w-0 cursor-default items-center gap-1.5 rounded-full", contact && "cursor-pointer", FOCUS)}
      >
        {contact ? <Avatar name={name} src={contact.avatar} size={24} /> : <span className="size-1" />}
        <span className="truncate">{name}</span>
      </button>
      <button
        type="button"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
        className={cn("grid size-6 shrink-0 cursor-pointer place-items-center rounded-full opacity-60 transition-opacity hover:opacity-100", FOCUS)}
      >
        <IconX size={12} stroke={2.25} />
      </button>
      {mounted &&
        contact &&
        createPortal(
          <AnimatePresence>
            {card && (
              <ContactCard
                contact={contact}
                rect={card}
                onEnter={() => clearTimeout(timer.current)}
                onLeave={() => closeCard()}
              />
            )}
          </AnimatePresence>,
          document.body,
        )}
    </motion.li>
  );
}

function ContactCard({ contact: c, rect, onEnter, onLeave }: { contact: Contact; rect: DOMRect; onEnter: () => void; onLeave: () => void }) {
  const [copied, setCopied] = useState(false);
  const W = 288;
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, rect.left));
  const below = window.innerHeight - rect.bottom > 200;
  // Read on open, in the browser, so it's never a server/client mismatch.
  const [local] = useState(() =>
    c.timeZone ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", weekday: "short", timeZone: c.timeZone }).format(new Date()) : null,
  );
  return (
    <motion.div
      role="dialog"
      aria-label={c.name}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      initial={{ opacity: 0, y: below ? -4 : 4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
      transition={{ duration: 0.18, ease: EASE_OUT }}
      className="fixed z-[70] rounded-2xl bg-background p-4 shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_8%,transparent),0_16px_40px_-12px_rgb(0_0_0/0.3)] dark:bg-neutral-900"
      style={{
        width: W,
        left,
        top: below ? rect.bottom + 6 : rect.top - 6,
        translate: below ? undefined : "0 -100%",
        transformOrigin: below ? "top left" : "bottom left",
      }}
    >
      <div className="flex items-center gap-3">
        <Avatar name={c.name} src={c.avatar} size={48} />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-foreground">{c.name}</p>
          {(c.title || c.company) && <p className="truncate text-[13px] text-muted-foreground">{[c.title, c.company].filter(Boolean).join(" · ")}</p>}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted/70 py-1 pl-3 pr-1">
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{c.email}</span>
        <button
          type="button"
          aria-label="Copy address"
          onClick={() => {
            navigator.clipboard?.writeText(c.email).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className={cn("grid size-8 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-background hover:text-foreground", FOCUS)}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={copied ? "y" : "n"} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.15 }}>
              {copied ? <IconCheck size={15} stroke={2} /> : <IconCopy size={15} stroke={1.75} />}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
      {local && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
          <IconClock size={14} stroke={1.75} />
          {local} local time
        </p>
      )}
    </motion.div>
  );
}

// ─── Send ────────────────────────────────────────────────────────────────────

const fmtWhen = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);

function presets(now: Date) {
  const at = (days: number, h: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(h, 0, 0, 0);
    return d;
  };
  const toMonday = ((8 - now.getDay()) % 7) || 7;
  return [
    { label: "Tomorrow morning", date: at(1, 8) },
    { label: "Tomorrow afternoon", date: at(1, 13) },
    { label: "Monday morning", date: at(toMonday, 8) },
  ];
}

const pad = (n: number) => String(n).padStart(2, "0");
const localInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

function SendButton({
  scheduled,
  schedule,
  onSend,
  onSchedule,
  className,
}: {
  scheduled: boolean;
  schedule: boolean;
  onSend: () => void;
  onSchedule: (d: Date) => void;
  className?: string;
}) {
  const [open, setOpen] = useState<null | { now: Date }>(null);
  const [custom, setCustom] = useState("");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(null);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const pick = (d: Date) => {
    onSchedule(d);
    setOpen(null);
  };

  return (
    <div
      ref={root}
      className={cn("relative flex shrink-0 items-center", className)}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(null);
        }
      }}
    >
      <button
        type="button"
        onClick={onSend}
        className={cn(
          "inline-flex h-9 min-w-24 cursor-pointer items-center justify-center overflow-hidden bg-foreground px-4 text-sm font-medium text-background transition-colors hover:bg-foreground/90",
          schedule ? "rounded-l-xl" : "rounded-xl",
          FOCUS,
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={scheduled ? "s" : "n"} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={FADE}>
            {scheduled ? "Schedule" : "Send"}
          </motion.span>
        </AnimatePresence>
      </button>
      {schedule && (
        <button
          type="button"
          aria-label="Schedule send"
          aria-haspopup="dialog"
          aria-expanded={!!open}
          onClick={() => {
            if (open) return setOpen(null);
            const now = new Date();
            setCustom(localInput(new Date(now.getTime() + 60 * 60 * 1000)));
            setOpen({ now });
          }}
          className={cn(
            "grid h-9 w-9 cursor-pointer place-items-center rounded-r-xl bg-foreground text-background shadow-[inset_1px_0_0_color-mix(in_srgb,var(--background)_25%,transparent)] transition-colors hover:bg-foreground/90",
            FOCUS,
          )}
        >
          <motion.span animate={{ rotate: open ? 180 : 0 }} transition={FADE}>
            <IconChevronDown size={16} stroke={2} />
          </motion.span>
        </button>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Schedule send"
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            className="absolute bottom-full right-0 z-30 mb-2 w-72 origin-bottom-right rounded-2xl bg-background p-1.5 shadow-[0_0_0_1px_color-mix(in_srgb,var(--foreground)_8%,transparent),0_16px_40px_-12px_rgb(0_0_0/0.3)] dark:bg-neutral-900"
          >
            <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">Schedule send</p>
            {presets(open.now).map((p, i) => (
              <button
                key={p.label}
                type="button"
                autoFocus={i === 0}
                onClick={() => pick(p.date)}
                className="flex h-10 w-full cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 text-left text-[13px] text-foreground outline-none hover:bg-muted focus-visible:bg-muted"
              >
                {p.label}
                <span className="text-muted-foreground tabular-nums">{fmtWhen(p.date)}</span>
              </button>
            ))}
            <div className="mt-1 border-t border-foreground/[0.06] p-1.5 pt-2.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="custom-send">
                Pick a time
              </label>
              <div className="mt-1.5 flex gap-1.5">
                <input
                  id="custom-send"
                  type="datetime-local"
                  value={custom}
                  min={localInput(open.now)}
                  onChange={(e) => setCustom(e.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-lg bg-muted/60 px-2 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-foreground/15"
                />
                <button
                  type="button"
                  disabled={!custom || new Date(custom) <= open.now}
                  onClick={() => pick(new Date(custom))}
                  className={cn("h-9 cursor-pointer rounded-lg bg-foreground px-3 text-[13px] font-medium text-background disabled:cursor-default disabled:opacity-40", FOCUS)}
                >
                  Set
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
