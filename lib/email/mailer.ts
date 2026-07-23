import "server-only";
import nodemailer from "nodemailer";

// Singleton Gmail transporter — created once, reused across requests and hot
// reloads. Credentials are server-only secrets (never NEXT_PUBLIC_). Only ever
// constructed on the send path, which is guarded by emailConfigured().

const email = process.env.NODEMAILER_EMAIL;
const password = process.env.NODEMAILER_PW;

function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: email, pass: password },
  });
}

const globalForMailer = globalThis as unknown as {
  mailer: nodemailer.Transporter | undefined;
};

export const mailer = globalForMailer.mailer ?? createTransporter();

if (process.env.NODE_ENV !== "production") {
  globalForMailer.mailer = mailer;
}
