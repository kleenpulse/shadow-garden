import "server-only";
import { renderShell, SITE_URL, h1, p, accent, note } from "@/lib/email/layout";
import type { Built } from "@/lib/email/send";

// Template builders for the customer-app auto-fired emails. Each returns the
// subject + both bodies; the text twin is hand-written, never auto-stripped.

function greeting(name: string | null): string {
  return name?.trim() ? name.trim() : "there";
}

/** #1 — welcome on first signup, with a nudge to go Pro. Marketing. */
export function welcomeEmail(args: { name: string | null }): Built {
  return {
    subject: "Welcome to Shadow Garden",
    html: renderShell({
      title: "Welcome to Shadow Garden",
      preheader: "Preview live, dial in the parameters, copy the source.",
      marketing: true,
      bodyHtml:
        h1(`Welcome to ${accent("Shadow Garden")}`) +
        p(`Hi ${greeting(args.name)}, you're in. Shadow Garden is a tunable gallery of animation-forward React components — preview them live, dial in the parameters, and copy the source straight into your project.`) +
        p("Free components are open right now. Go Pro to unlock the Power-User Systems, raw source on every component, and cross-device favorites.") +
        note("Tip: hit any component, open the Controls panel, and make it yours before you copy."),
      cta: { label: "Browse components", href: `${SITE_URL}/components` },
    }),
    text: [
      "Welcome to Shadow Garden",
      "",
      `Hi ${greeting(args.name)}, you're in. Shadow Garden is a tunable gallery of animation-forward React components — preview them live, dial in the parameters, and copy the source straight into your project.`,
      "",
      "Free components are open right now. Go Pro to unlock the Power-User Systems, raw source on every component, and cross-device favorites.",
      "",
      `Browse components: ${SITE_URL}/components`,
      `Go Pro: ${SITE_URL}/components#subscribe`,
    ].join("\n"),
  };
}

/** #2 — subscribe confirmation / congrats. Transactional. */
export function subscribeConfirmationEmail(args: {
  name: string | null;
  plan: "subscription" | "lifetime";
}): Built {
  const planLabel = args.plan === "lifetime" ? "Lifetime" : "Pro";
  const planLine =
    args.plan === "lifetime"
      ? "You own Shadow Garden for life — every Pro component, forever, no renewals."
      : "Your Pro membership is active — every Pro component is unlocked.";
  return {
    subject: `You're ${planLabel} — welcome to the full Shadow Garden`,
    html: renderShell({
      title: `Welcome to ${planLabel}`,
      preheader: "Your payment went through. Everything is unlocked.",
      bodyHtml:
        h1(`Welcome to ${accent(planLabel)}`) +
        p(`Hi ${greeting(args.name)}, your payment went through — thank you. ${planLine}`) +
        p("Dive into the Power-User Systems, grab the raw source, and tune anything to taste."),
      cta: { label: "Explore Pro components", href: `${SITE_URL}/components` },
    }),
    text: [
      `Welcome to ${planLabel}`,
      "",
      `Hi ${greeting(args.name)}, your payment went through — thank you. ${planLine}`,
      "",
      "Dive into the Power-User Systems, grab the raw source, and tune anything to taste.",
      "",
      `Explore: ${SITE_URL}/components`,
    ].join("\n"),
  };
}
