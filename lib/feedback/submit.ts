// The feedback submit seam. One place knows how a submission can fail, and it
// returns that as data rather than throwing.
//
// The widget used to do `throw new Error(body.error)` and render `err.message`
// in the toast, which meant a visitor could be shown the raw string
// "invalid_message". Worse, the failure taxonomy was open: any new server code
// silently became user-facing copy. Here the reasons are a closed union, so an
// unrecognised code lands on the generic server copy and a NEW reason cannot be
// added without also writing the sentence a human reads.
//
// The limits live here too — the route and the widget both enforce them, and a
// widget that lets you type past what the server accepts is a rejection the
// user could not have predicted.

export const LIMITS = {
  messageMin: 10,
  messageMax: 700,
  subjectMax: 120,
  emailMax: 254,
} as const;

export type FeedbackType = "bug" | "idea" | "other";

export interface FeedbackInput {
  type: FeedbackType;
  message: string;
  subject?: string;
  /** Only asked of visitors with no session. */
  email?: string;
  page?: string;
  /** Honeypot — humans leave this blank. */
  company?: string;
  /** Best-effort client diagnostics; the route caps and sanitises it. */
  context?: object;
}

export type SubmitReason =
  | "too_short"
  | "too_long"
  | "rate_limited"
  | "invalid_body"
  | "network"
  | "server";

export type SubmitResult = { ok: true } | { ok: false; reason: SubmitReason };

/** What a human is told for each reason. Total over the union, so a new failure
 *  mode cannot ship without its copy. */
export const REASON_COPY: Record<
  SubmitReason,
  { title: string; description: string }
> = {
  too_short: {
    title: "Tell us a little more",
    description: `At least ${LIMITS.messageMin} characters, so we can act on it.`,
  },
  too_long: {
    title: "That's a bit long",
    description: `Keep it under ${LIMITS.messageMax} characters.`,
  },
  rate_limited: {
    title: "That's a lot of feedback fast",
    description: "Give it a minute, then retry.",
  },
  invalid_body: {
    title: "Couldn't send that",
    description: "The message didn't come through intact. Try again.",
  },
  network: {
    title: "Couldn't reach the shadows",
    description: "Check your connection and try again.",
  },
  server: {
    title: "Couldn't send that",
    description: "Something went wrong on our side. Try again shortly.",
  },
};

const REASONS = new Set<string>(Object.keys(REASON_COPY));

/** Narrow an arbitrary server code onto the union; anything unrecognised is a
 *  server fault, not a message we'd show verbatim. */
function toReason(code: unknown): SubmitReason {
  return typeof code === "string" && REASONS.has(code)
    ? (code as SubmitReason)
    : "server";
}

/** Client-side length check — the same rule the route applies, so the widget
 *  never sends something it already knows will bounce. */
export function validate(message: string): SubmitReason | null {
  const length = message.trim().length;
  if (length < LIMITS.messageMin) return "too_short";
  if (length > LIMITS.messageMax) return "too_long";
  return null;
}

/**
 * Send a submission. Never throws — a caller that awaits this gets a result it
 * can render, in every case including a dropped connection.
 */
export async function submitFeedback(
  input: FeedbackInput,
): Promise<SubmitResult> {
  const invalid = validate(input.message);
  if (invalid) return { ok: false, reason: invalid };

  let res: Response;
  try {
    res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, message: input.message.trim() }),
    });
  } catch {
    return { ok: false, reason: "network" };
  }

  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: unknown;
  } | null;

  if (res.ok && body?.ok) return { ok: true };
  return { ok: false, reason: toReason(body?.error) };
}
