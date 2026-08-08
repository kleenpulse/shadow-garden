"use client";

import { type FormEvent, type MouseEvent, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronLeft,
  Lightbulb,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
} from "lucide-react";
import GrowDialog from "@/components/registry/grow-dialog/grow-dialog";
import { collectClientContext } from "@/lib/feedback/context";
import {
  LIMITS,
  REASON_COPY,
  submitFeedback,
  type FeedbackType,
} from "@/lib/feedback/submit";
import { cn } from "@/lib/utils";

type Step = "choose" | "form";

// Lengths and failure copy both come from the submit seam — this widget knows
// how to lay out a form, not what "too long" means or how to say it.
const {
  messageMin: MESSAGE_MIN,
  messageMax: MESSAGE_MAX,
  subjectMax: SUBJECT_MAX,
} = LIMITS;

const TYPES: {
  value: FeedbackType;
  icon: typeof AlertTriangle;
  title: string;
  blurb: string;
  prompt: string;
  placeholder: string;
}[] = [
  {
    value: "bug",
    icon: AlertTriangle,
    title: "Report an issue",
    blurb: "Something is broken or not working",
    prompt: "What happened?",
    placeholder: "Describe the bug and the steps to reproduce it…",
  },
  {
    value: "idea",
    icon: Lightbulb,
    title: "Share an idea",
    blurb: "Suggest a feature or improvement",
    prompt: "Your idea",
    placeholder: "What would make Shadow Garden better?",
  },
  {
    value: "other",
    icon: MessageSquare,
    title: "General feedback",
    blurb: "Anything else on your mind",
    prompt: "Details",
    placeholder: "Tell us more…",
  },
];

// Two-step feedback modal, mirroring Supabase's flow: pick a category, then write.
// Rendered pinned to the bottom of the sidebar. Fully anonymous — the optional
// email field is the only reply channel.
export default function FeedbackWidget({ className }: { className?: string }) {
  const triggerRef = useRef<HTMLButtonElement>(null);

  const [open, setOpen] = useState(false);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const [step, setStep] = useState<Step>("choose");
  const [type, setType] = useState<FeedbackType>("bug");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // honeypot — humans leave it blank
  const [pending, setPending] = useState(false);

  const activeType = TYPES.find((t) => t.value === type) ?? TYPES[0];
  const trimmedLen = message.trim().length;
  const canSubmit = trimmedLen >= MESSAGE_MIN && !pending;

  function openWidget(e: MouseEvent<HTMLButtonElement>) {
    setOriginRect(e.currentTarget.getBoundingClientRect());
    setStep("choose");
    setOpen(true);
  }

  function resetSoon() {
    // Wait out the shrink-back exit before clearing, so nothing flashes mid-close.
    setTimeout(() => {
      setStep("choose");
      setType("bug");
      setSubject("");
      setMessage("");
      setEmail("");
      setCompany("");
    }, 320);
  }

  function handleOpenChange(next: boolean) {
    if (pending) return; // don't let a stray Escape/backdrop cancel an in-flight send
    setOpen(next);
    if (!next) resetSoon();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    // submitFeedback never throws, so there is no catch and no chance of a raw
    // server code reaching the toast — every outcome arrives as a known reason.
    const result = await submitFeedback({
      type,
      subject: subject.trim() || undefined,
      message,
      email: email.trim() || undefined,
      page: typeof window !== "undefined" ? window.location.pathname : undefined,
      company: company || undefined,
      context: collectClientContext(),
    });
    setPending(false);

    if (!result.ok) {
      const copy = REASON_COPY[result.reason];
      toast.error(copy.title, { description: copy.description });
      return;
    }

    toast.success("Thank you — your feedback reached the shadows.");
    setOpen(false);
    resetSoon();
  }

  const over = message.length > MESSAGE_MAX;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openWidget}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-3 text-sm text-ink-dim transition-colors hover:bg-raised/50 hover:text-ink focus-visible:text-ink focus-visible:outline-none",
          className,
        )}
      >
        <MessageSquarePlus className="size-4 text-ink-mute" />
        <span className="font-sans">Feedback</span>
      </button>

      <GrowDialog
        open={open}
        onOpenChange={handleOpenChange}
        originRect={originRect}
        originMaxWidth={448}
        className="max-w-md"
        title={
          step === "choose" ? "What would you like to share?" : activeType.title
        }
        description={
          step === "choose"
            ? "Your report reaches the operators running the garden."
            : activeType.blurb
        }
      >
        {step === "choose" ? (
          <div className="grid gap-2.5 px-5 pb-5">
            {TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => {
                    setType(t.value);
                    setStep("form");
                  }}
                  className="group flex items-center gap-3 rounded-lg border border-hairline bg-panel p-3.5 text-left transition-colors hover:border-accent hover:bg-raised/40"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-md border border-hairline bg-raised/60 text-accent transition-colors group-hover:border-accent/40">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-sm text-ink">
                      {t.title}
                    </span>
                    <span className="block font-sans text-xs text-ink-mute">
                      {t.blurb}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3 px-5 pb-5">
            <button
              type="button"
              onClick={() => setStep("choose")}
              className="-ml-1 inline-flex w-fit items-center gap-1 rounded px-1 py-0.5 font-mono text-[11px] uppercase tracking-wider text-ink-mute transition-colors hover:text-ink"
            >
              <ChevronLeft className="size-3.5" />
              back
            </button>

            <label className="block">
              <span className="mb-1 block font-display text-[10px] uppercase tracking-widest text-ink-mute">
                Subject{" "}
                <span className="normal-case tracking-normal text-ink-mute/70">
                  (optional)
                </span>
              </span>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value.slice(0, SUBJECT_MAX))}
                maxLength={SUBJECT_MAX}
                placeholder="A quick summary"
                className="w-full rounded-md border border-hairline bg-panel px-3 py-2 font-sans text-sm text-ink outline-none placeholder:text-ink-mute focus-visible:border-accent"
              />
            </label>

            <label className="block">
              <span className="mb-1 flex items-center justify-between font-display text-[10px] uppercase tracking-widest text-ink-mute">
                <span>{activeType.prompt}</span>
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    over ? "text-danger" : "text-ink-mute",
                  )}
                >
                  {message.length}/{MESSAGE_MAX}
                </span>
              </span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
                rows={5}
                autoFocus
                placeholder={activeType.placeholder}
                className="w-full resize-none rounded-md border border-hairline bg-panel px-3 py-2 font-sans text-sm leading-relaxed text-ink outline-none placeholder:text-ink-mute focus-visible:border-accent"
              />
            </label>

            <label className="block">
              <span className="mb-1 block font-display text-[10px] uppercase tracking-widest text-ink-mute">
                Email{" "}
                <span className="normal-case tracking-normal text-ink-mute/70">
                  (optional — so we can follow up)
                </span>
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-md border border-hairline bg-panel px-3 py-2 font-sans text-sm text-ink outline-none placeholder:text-ink-mute focus-visible:border-accent"
              />
            </label>

            {/* Honeypot: off-screen, not tabbable. Bots fill it; the server drops those. */}
            <input
              type="text"
              name="company"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="pointer-events-none absolute left-[-9999px] h-0 w-0 opacity-0"
            />

            <div className="mt-1 flex items-center justify-end">
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center gap-2 rounded-md bg-accent px-3.5 py-2 font-display text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-50"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {pending ? "Sending…" : "Send feedback"}
              </button>
            </div>
          </form>
        )}
      </GrowDialog>
    </>
  );
}
