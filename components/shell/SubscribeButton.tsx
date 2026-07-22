"use client";

import { cn } from "@/lib/utils";

// Dumb trigger: opens the shared PricingModal by setting the #subscribe hash.
// Used in the Pro-locked Code panel (which is already server-guaranteed free-only).
export default function SubscribeButton({
  label = "Go Pro",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        window.location.hash = "subscribe";
      }}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 font-sans text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        className,
      )}
    >
      {label}
    </button>
  );
}
