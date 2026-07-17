"use client";

import { useEffect, type ReactNode } from "react";
import { useUIStore, type WorkspaceTab } from "@/lib/store";
import PillTabs, { type PillTabItem } from "./PillTabs";

const TABS: PillTabItem<WorkspaceTab>[] = [
  { value: "preview", label: "preview" },
  { value: "code", label: "code" },
];

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

  return (
    <div>
      <PillTabs
        aria-label="Preview or source"
        value={activeTab}
        onValueChange={setActiveTab}
        items={TABS}
        layoutId="workspace-tabs"
        className="mb-4"
      />
      <div role="tabpanel" hidden={activeTab !== "preview"}>
        {preview}
      </div>
      <div role="tabpanel" hidden={activeTab !== "code"}>
        {code}
      </div>
    </div>
  );
}
