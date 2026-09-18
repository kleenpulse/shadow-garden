import "server-only";
import { has } from "@/lib/capabilities";

// The one send seam. No DATA_MODE here (customer app has no seed mode); instead
// it degrades gracefully like polarConfigured() — when Gmail credentials are
// absent, sends are a logged no-op so the app runs fine without email set up.
// The nodemailer transport is lazily imported so it's never constructed unless
// a real send fires.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// A message minus its recipient — what template builders return and dispatch fills in.
export type Built = Omit<EmailMessage, "to">;

export interface SendResult {
  ok: boolean;
  skipped?: boolean;
}

/** True when Gmail credentials are present. Sends no-op (skipped) otherwise. */
export function emailConfigured(): boolean {
  return has("email");
}

const FROM = process.env.EMAIL_FROM ?? process.env.NODEMAILER_EMAIL ?? "Shadow Garden";

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  if (!emailConfigured()) {
    console.warn("[email] not configured — skipping send to", msg.to);
    return { ok: false, skipped: true };
  }

  const { mailer } = await import("@/lib/email/mailer");
  await mailer.sendMail({
    from: FROM,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  });
  return { ok: true };
}
