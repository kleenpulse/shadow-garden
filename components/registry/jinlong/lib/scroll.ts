"use client";

// Smooth scroll to a section by id.
//
// Replaces `react-scroll`, which was pulled in for exactly one function. The
// library predates `scrollIntoView({ behavior: "smooth" })` being universally
// supported and carries its own scroll engine, its own event system and its own
// React components — none of which this template uses.
//
// Lenis is already driving the page, and it hooks `scrollIntoView`, so this stays
// smooth rather than jumping.

export function scrollToSection(id: string, offset = 0): void {
  const target = document.getElementById(id);
  if (!target) return;

  if (offset === 0) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  // A fixed header means the section's own top is not where it should land.
  const top = target.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: "smooth" });
}
