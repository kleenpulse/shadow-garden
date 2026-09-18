import "server-only";
import { SITE_URL } from "@/lib/site";

// The branded HTML shell every template wears. Table-based, inline-styled —
// email clients strip <style> and flexbox/grid, so everything is a table cell.
// Palette from app/globals.css: graphite bench + one amethyst accent, Space
// Mono wordmark (falls back to monospace where unloaded).

// Re-exported for the templates that already import it from here. The origin
// itself lives in lib/site.ts — a second copy is how an email ships localhost links.
export { SITE_URL };

const BENCH_950 = "#0a0b0c";
const PANEL = "#0e1012";
const BORDER = "#1c1f22";
const INK = "#e2e6e9";
const INK_DIM = "#9aa1a8";
const ACCENT = "#a855f7";

export interface Cta {
  label: string;
  href: string;
}

export interface ShellOptions {
  title: string;
  /** Hidden inbox-preview line. */
  preheader: string;
  /** Inner HTML for the body — headings, paragraphs, etc. */
  bodyHtml: string;
  cta?: Cta;
  /** Marketing sends show a manage-preferences footer line; transactional don't. */
  marketing?: boolean;
}

export function ctaButton(cta: Cta): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
      <tr><td style="border-radius:8px;background:${ACCENT};">
        <a href="${cta.href}" style="display:inline-block;padding:13px 26px;font-family:'Space Mono',ui-monospace,monospace;font-size:14px;font-weight:700;letter-spacing:0.02em;color:#ffffff;text-decoration:none;border-radius:8px;">${cta.label}</a>
      </td></tr>
    </table>`;
}

export function renderShell(opts: ShellOptions): string {
  const { title, preheader, bodyHtml, cta, marketing } = opts;
  const manageLine = marketing
    ? `<br /><a href="${SITE_URL}/account" style="color:${INK_DIM};text-decoration:underline;">Manage email preferences</a>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:${BENCH_950};color:${INK};">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BENCH_950};padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${PANEL};border:1px solid ${BORDER};border-radius:14px;overflow:hidden;">
          <tr><td style="padding:26px 32px 18px;border-bottom:1px solid ${BORDER};">
            <span style="font-family:'Space Mono',ui-monospace,monospace;font-size:15px;font-weight:700;letter-spacing:0.16em;color:${INK};text-transform:uppercase;">Shadow</span><span style="font-family:'Space Mono',ui-monospace,monospace;font-size:15px;font-weight:700;letter-spacing:0.16em;color:${ACCENT};text-transform:uppercase;"> Garden</span>
          </td></tr>
          <tr><td style="padding:30px 32px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${INK};">
            ${bodyHtml}
            ${cta ? ctaButton(cta) : ""}
          </td></tr>
          <tr><td style="padding:20px 32px 26px;border-top:1px solid ${BORDER};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${INK_DIM};">
            Shadow Garden — a tunable gallery of animation-forward React components.${manageLine}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function h1(text: string): string {
  return `<h1 style="margin:0 0 16px;font-family:'Space Mono',ui-monospace,monospace;font-size:21px;line-height:1.3;font-weight:700;color:${INK};">${text}</h1>`;
}

export function p(text: string): string {
  return `<p style="margin:0 0 16px;">${text}</p>`;
}

export function accent(text: string): string {
  return `<span style="color:${ACCENT};">${text}</span>`;
}

export function note(text: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="padding:14px 16px;background:${BENCH_950};border:1px solid ${BORDER};border-radius:8px;font-family:'Space Mono',ui-monospace,monospace;font-size:13px;color:${INK_DIM};">${text}</td></tr></table>`;
}
