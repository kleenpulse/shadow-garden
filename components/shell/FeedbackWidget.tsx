"use client";

import { type FormEvent, type MouseEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  ChevronLeft,
  Lightbulb,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
} from "lucide-react";
import GrowDialog from "./grow-dialog";
import { collectClientContext } from "@/lib/feedback/context";
import { LIMITS, submitFeedback, type FeedbackType } from "@/lib/feedback/submit";
import { cn } from "@/lib/utils";

type Step = "choose" | "form";

// Lengths come from the submit seam — this widget knows how to lay out a
// form, not what "too long" means. Failure copy lives in the `feedback.*`
// message catalog (submit.ts stays framework-free — /api/feedback imports it
// too), looked up by reason key below.
const {
  messageMin: MESSAGE_MIN,
  messageMax: MESSAGE_MAX,
  subjectMax: SUBJECT_MAX,
} = LIMITS;

// Text lives in chrome.feedback.types.<value>.* (see typeCopy below) — only the
// icon and the closed `value` union stay here.
const TYPES: {
  value: FeedbackType;
  icon: typeof AlertTriangle;
}[] = [
  { value: "bug", icon: AlertTriangle },
  { value: "idea", icon: Lightbulb },
  { value: "other", icon: MessageSquare },
];

// Two-step feedback modal, mirroring Supabase's flow: pick a category, then write.
// Rendered pinned to the bottom of the sidebar. Fully anonymous — the optional
// email field is the only reply channel.
export default function FeedbackWidget({ className }: { className?: string }) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const t = useTranslations("chrome.feedback");
  const tReasons = useTranslations("feedback.reasons");

  const [open, setOpen] = useState(false);
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const [step, setStep] = useState<Step>("choose");
  const [type, setType] = useState<FeedbackType>("bug");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState(""); // honeypot — humans leave it blank
  const [pending, setPending] = useState(false);

  // Text for a type comes from chrome.feedback.types.<value>.* — the closed
  // "bug" | "idea" | "other" union keeps the dynamic key safe.
  const typeCopy = (value: FeedbackType) => ({
    title: t(`types.${value}.title`),
    blurb: t(`types.${value}.blurb`),
    prompt: t(`types.${value}.prompt`),
    placeholder: t(`types.${value}.placeholder`),
  });

  const activeType = TYPES.find((entry) => entry.value === type) ?? TYPES[0];
  const activeCopy = typeCopy(activeType.value);
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
      const reason = result.reason;
      toast.error(tReasons(`${reason}.title`), {
        description: tReasons(`${reason}.description`, {
          min: MESSAGE_MIN,
          max: MESSAGE_MAX,
        }),
      });
      return;
    }

    toast.success(t("submitSuccess"));
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
        <span className="font-sans">{t("trigger")}</span>
      </button>

      <GrowDialog
        open={open}
        onOpenChange={handleOpenChange}
        originRect={originRect}
        originMaxWidth={448}
        className="max-w-md"
        title={step === "choose" ? t("chooseTitle") : activeCopy.title}
        description={step === "choose" ? t("chooseDescription") : activeCopy.blurb}
      >
        {step === "choose" ? (
          <div className="grid gap-2.5 px-5 pb-5">
            {TYPES.map((entry) => {
              const Icon = entry.icon;
              const copy = typeCopy(entry.value);
              return (
                <button
                  key={entry.value}
                  type="button"
                  onClick={() => {
                    setType(entry.value);
                    setStep("form");
                  }}
                  className="group flex items-center gap-3 rounded-lg border border-hairline bg-panel p-3.5 text-start transition-colors hover:border-accent hover:bg-raised/40"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-md border border-hairline bg-raised/60 text-accent transition-colors group-hover:border-accent/40">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display text-sm text-ink">
                      {copy.title}
                    </span>
                    <span className="block font-sans text-xs text-ink-mute">
                      {copy.blurb}
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
              className="-ms-1 inline-flex w-fit items-center gap-1 rounded px-1 py-0.5 font-mono text-[11px] uppercase tracking-wider text-ink-mute transition-colors hover:text-ink"
            >
              <ChevronLeft className="size-3.5 rtl:-scale-x-100" />
              {t("back")}
            </button>

            <label className="block">
              <span className="mb-1 block font-display text-[10px] uppercase tracking-widest text-ink-mute">
                {t("subjectLabel")}{" "}
                <span className="normal-case tracking-normal text-ink-mute/70">
                  {t("optional")}
                </span>
              </span>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value.slice(0, SUBJECT_MAX))}
                maxLength={SUBJECT_MAX}
                placeholder={t("subjectPlaceholder")}
                className="w-full rounded-md border border-hairline bg-panel px-3 py-2 font-sans text-sm text-ink outline-none placeholder:text-ink-mute focus-visible:border-accent"
              />
            </label>

            <label className="block">
              <span className="mb-1 flex items-center justify-between font-display text-[10px] uppercase tracking-widest text-ink-mute">
                <span>{activeCopy.prompt}</span>
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
                placeholder={activeCopy.placeholder}
                className="w-full resize-none rounded-md border border-hairline bg-panel px-3 py-2 font-sans text-sm leading-relaxed text-ink outline-none placeholder:text-ink-mute focus-visible:border-accent"
              />
            </label>

            <label className="block">
              <span className="mb-1 block font-display text-[10px] uppercase tracking-widest text-ink-mute">
                {t("emailLabel")}{" "}
                <span className="normal-case tracking-normal text-ink-mute/70">
                  {t("emailOptional")}
                </span>
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                // A format example, not prose — stays as the universal
                // "you@example.com" pattern rather than being translated.
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
              className="pointer-events-none absolute start-[-9999px] h-0 w-0 opacity-0"
            />

            <div className="mt-1 flex items-center justify-end">
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center gap-2 rounded-md bg-accent px-3.5 py-2 font-display text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-50"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                {pending ? t("sending") : t("submit")}
              </button>
            </div>
          </form>
        )}
      </GrowDialog>
    </>
  );
}
