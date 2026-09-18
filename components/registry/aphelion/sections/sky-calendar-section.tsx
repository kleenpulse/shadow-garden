"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { useGSAP } from "../hooks/use-gsap";
import { useStill } from "../hooks/use-still";
import { CALENDAR } from "../lib/constants";

gsap.registerPlugin(ScrollTrigger);

// The season, as a table — an observatory publishes an ephemeris, not a
// carousel. The moon glyph is a plain SVG whose lit disc scales with the
// phase value from the constants file; no icon font, no image.

function MoonGlyph({ phase }: { phase: number }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]"
    >
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
      <circle cx="10" cy="10" r={8 * phase} fill="currentColor" opacity="0.9" />
    </svg>
  );
}

export default function SkyCalendarSection() {
  const ref = useRef<HTMLElement>(null);
  const still = useStill();

  useGSAP(
    () => {
      if (still) return;
      gsap.fromTo(
        "[data-calendar-row]",
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          stagger: 0.08,
          ease: "power2.out",
          scrollTrigger: { trigger: ref.current, start: "top 70%" },
        },
      );
    },
    { scope: ref, dependencies: [still] },
  );

  return (
    <section
      ref={ref}
      id="calendar"
      className="relative z-10 mx-auto w-full max-w-[90rem] px-6 py-28 md:px-10 md:py-40"
    >
      <p className="text-xs tracking-[0.3em] text-[var(--accent)] uppercase">
        {CALENDAR.eyebrow}
      </p>
      <h2 className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-4xl leading-tight text-[var(--foreground)] md:text-6xl">
        {CALENDAR.title}
      </h2>

      <div className="mt-16 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--border)]">
              {CALENDAR.columns.map((column) => (
                <th
                  key={column}
                  className="py-3 pr-6 text-xs font-normal tracking-[0.2em] text-[var(--muted-foreground)] uppercase"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CALENDAR.rows.map((row) => (
              <tr
                key={row.event}
                data-calendar-row
                className="group border-b border-[var(--border)] transition-colors duration-200 hover:bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
              >
                <td className="py-5 pr-6">
                  <span className="flex items-center gap-3 text-sm text-[var(--foreground)]">
                    <MoonGlyph phase={row.phase} />
                    {row.event}
                  </span>
                </td>
                <td className="py-5 pr-6 text-sm text-[var(--muted-foreground)]">
                  {row.date}
                </td>
                <td className="py-5 pr-6 text-sm text-[var(--muted-foreground)]">
                  {row.window}
                </td>
                <td className="py-5 text-xs tracking-[0.2em] text-[var(--accent)] uppercase">
                  {row.outlook}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-6 text-xs text-[var(--muted-foreground)]">
        {CALENDAR.note}
      </p>
    </section>
  );
}
