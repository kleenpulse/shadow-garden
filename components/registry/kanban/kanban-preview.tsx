"use client";

import type { PreviewProps } from "@/lib/registry/types";
import Kanban, { type KanbanColumn } from "./kanban";

// Shadow Garden's operations board. In progress starts exactly at its limit, so
// the first card dragged into it shows what the limit does. Done starts folded,
// which is what keeps three working columns legible on a phone.
const RECON = { label: "Recon", color: "#38bdf8" };
const OPS = { label: "Ops", color: "#fb7185" };
const LORE = { label: "Lore", color: "#a78bfa" };
const TRADE = { label: "Trade", color: "#fbbf24" };
const LAB = { label: "Lab", color: "#2dd4bf" };

const COLUMNS: KanbanColumn[] = [
	{
		id: "backlog",
		title: "Backlog",
		cards: [
			{ id: "ledger", title: "Trace the Diablos ledger", tag: RECON, assignee: "Zeta", points: 3 },
			{ id: "chocolate", title: "Stock winter chocolates", tag: TRADE, assignee: "Gamma", points: 2 },
			{ id: "speech", title: "Rewrite Shadow's speech", tag: LORE, assignee: "Beta", points: 1 },
		],
	},
	{
		id: "doing",
		title: "In progress",
		wip: true,
		cards: [
			{ id: "academy", title: "Infiltrate the Academy", tag: OPS, assignee: "Delta", points: 8 },
			{ id: "letters", title: "Decode the sealed letters", tag: RECON, assignee: "Zeta", points: 5 },
			{ id: "slime", title: "Field-test slime suits", tag: LAB, assignee: "Eta", points: 3 },
		],
	},
	{
		id: "review",
		title: "Review",
		wip: true,
		cards: [
			{ id: "safehouse", title: "Audit Alexandria safehouse", tag: OPS, assignee: "Epsilon", points: 2 },
			{ id: "chronicle", title: "Seven Shadows chronicle", tag: LORE, assignee: "Beta", points: 3 },
		],
	},
	{
		id: "done",
		title: "Done",
		collapsed: true,
		cards: [
			{ id: "sanctuary", title: "Seal the Lindwurm sanctuary", tag: OPS, assignee: "Alpha", points: 8 },
			{ id: "regalia", title: "Recover the Oriana regalia", tag: RECON, assignee: "Alpha", points: 5 },
			{ id: "numbers", title: "Recruit five new Numbers", tag: TRADE, assignee: "Alpha", points: 3 },
		],
	},
];

export default function KanbanPreview({ values, reducedMotion }: PreviewProps) {
	return (
		// The board's seams mapped onto the shell's tokens. `--sg-*`, not
		// `--color-*`: the theme bridge inlines those and emits no variable.
		<div className="@container relative h-full w-full [--kanban-card:var(--sg-panel)] [--kanban-column:color-mix(in_oklab,var(--sg-ink)_4%,transparent)] [--kanban-danger:var(--sg-danger)] [--kanban-dim:var(--sg-ink-mute)] [--kanban-ink:var(--sg-ink)] [--kanban-line:var(--sg-hairline)] dark:[--kanban-card:var(--sg-raised)]">
			<Kanban
				defaultColumns={COLUMNS}
				wipLimit={values.wipLimit as number}
				wipMode={values.wipMode as "warn" | "block"}
				stiffness={values.stiffness as number}
				damping={values.damping as number}
				lift={values.lift as number}
				tilt={values.tilt as number}
				collapsible={values.collapsible as boolean}
				accentColor={values.accentColor as string}
				reducedMotion={reducedMotion}
				// The stage's fullscreen button sits in the top-right corner, always
				// on touch screens and on hover elsewhere. Keep the board out from
				// under it: margin on wide stages, a top inset where it never hides.
				className="mx-auto max-w-5xl @min-[40rem]:px-10 [@media(hover:none)]:pt-10"
			/>
		</div>
	);
}
