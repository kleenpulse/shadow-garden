"use client";

import Link from "next/link";
import { useUIStore } from "@/lib/store";
import ThemeToggle from "./ThemeToggle";

export default function MobileBar() {
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  return (
    <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-hairline bg-surface/90 px-4 py-3 backdrop-blur lg:hidden">
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Open navigation"
        className="grid h-8 w-8 place-items-center rounded-md border border-hairline text-ink-dim hover:text-accent"
      >
        <span aria-hidden className="text-base leading-none">
          ≡
        </span>
      </button>
      <Link href="/" className="font-display text-xs uppercase tracking-[0.2em] text-ink">
        Shadow <span className="text-accent">Garden</span>
      </Link>
      <ThemeToggle className="ml-auto" />
    </div>
  );
}
