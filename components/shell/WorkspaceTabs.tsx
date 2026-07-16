"use client";

import { useEffect, type KeyboardEvent, type ReactNode } from "react";
import { useUIStore, type WorkspaceTab } from "@/lib/store";

const TABS: WorkspaceTab[] = ["preview", "code"];

export default function WorkspaceTabs({
  slug,
  preview,
  code,
}: {
  slug: string;
  preview: ReactNode;
  code: ReactNode;
}) {
  const activeTab = useUIStore((state) => state.activeTab);
  const setActiveTab = useUIStore((state) => state.setActiveTab);

  // Reset to the preview tab when navigating to a different component.
  useEffect(() => {
    setActiveTab("preview");
  }, [slug, setActiveTab]);

  const onKeyDown = (event: KeyboardEvent) => {
    const index = TABS.indexOf(activeTab);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setActiveTab(TABS[(index + 1) % TABS.length]);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setActiveTab(TABS[(index - 1 + TABS.length) % TABS.length]);
    }
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Preview or source"
        onKeyDown={onKeyDown}
        className="mb-4 inline-flex gap-1 rounded-lg border border-hairline bg-panel p-1"
      >
        {TABS.map((tab) => {
          const active = activeTab === tab;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-3 py-1 font-display text-[11px] uppercase tracking-[0.15em] transition-colors ${
                active ? "bg-raised text-accent" : "text-ink-dim hover:text-ink"
              }`}
            >
              {tab}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" hidden={activeTab !== "preview"}>
        {preview}
      </div>
      <div role="tabpanel" hidden={activeTab !== "code"}>
        {code}
      </div>
    </div>
  );
}
