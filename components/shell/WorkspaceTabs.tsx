"use client";

import { Fragment, useEffect, type ReactNode } from "react";
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
	promptSlot,
}: {
	slug: string;
	preview: ReactNode;
	code: ReactNode;
	/** Server-rendered Copy Prompt control (gated). Absent while it streams in. */
	promptSlot?: ReactNode;
}) {
	const activeTab = useUIStore((state) => state.activeTab);
	const setActiveTab = useUIStore((state) => state.setActiveTab);

	// Reset to the preview tab when navigating to a different component.
	useEffect(() => {
		setActiveTab("preview");
	}, [slug, setActiveTab]);

	return (
		<div>
			{/* The row carries the margin, not the pill track — hanging it on PillTabs
			    left the right-hand control sitting 1rem below the tabs. */}
			<div className="mb-4 flex w-full items-center justify-between gap-3">
				<PillTabs
					aria-label="Preview or source"
					value={activeTab}
					onValueChange={setActiveTab}
					items={TABS}
					// Scoped per page: motion's layoutId registry is global and outlives a
					// route change, so a constant id makes the fresh strip inherit the OLD
					// page's pill bounds — it flew in from the previous page's Y before
					// settling. A per-slug id has no prior bounds; the pill mounts in place.
					layoutId={`workspace-tabs-${slug}`}
				/>
				{/* Wrapped, not rendered bare: this row is a two-child array, and a
				    streamed server node arrives here as a lazy — not yet an element, so
				    jsx() can't mark it key-validated, and React warns "unique key" the
				    moment it resolves. The fragment is a real element in the array and
				    reconciles promptSlot as its only child. No DOM, no key needed. */}
				<Fragment>{promptSlot}</Fragment>
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
