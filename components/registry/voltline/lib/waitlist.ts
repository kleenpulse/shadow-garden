"use client";

// Where the waitlist submission goes.
//
// The source posted to a Google Sheet through `googleapis`, running server-side
// with the owner's service-account credentials. None of that is a template's to
// ship: not the dependency, not the sheet, and certainly not the credentials. So
// this is the seam, deliberately left as one.
//
// Replace the body with a fetch to your own endpoint. The form already handles the
// pending state, the error message and the success modal around it, so the only
// thing that has to change is what happens between them.

export interface WaitlistResult {
  /** 200 on success, 400 on a rejected submission. The form renders off this. */
  status: number;
  message: string;
}

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function addToWaitlist(email: string): Promise<WaitlistResult> {
  const address = email.trim();

  if (!LOOKS_LIKE_EMAIL.test(address)) {
    return { status: 400, message: "That does not look like an email address." };
  }

  // ── your endpoint goes here ───────────────────────────────────────────────
  // const response = await fetch("/api/waitlist", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({ email: address }),
  // });
  // if (!response.ok) return { status: 400, message: "Something went wrong." };

  // Until then: accept, so the success path stays demonstrable. A form that always
  // failed would be a worse default than one that goes nowhere quietly.
  return { status: 200, message: "You have been added to the waitlist." };
}
