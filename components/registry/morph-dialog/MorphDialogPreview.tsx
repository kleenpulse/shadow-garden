"use client";

import { useState, type ComponentType } from "react";
import { MotionConfig, motion } from "motion/react";
import {
	Activity,
	Cpu,
	Database,
	FileCode,
	GitBranch,
	Terminal,
	X,
} from "lucide-react";
import type { PreviewProps } from "@/lib/registry/types";
import { MorphPanel, MorphShared, morphTransition } from "./MorphDialog";

type Card = {
	icon: ComponentType<{ className?: string }>;
	label: string;
	blurb: string;
	body: string;
};

const CARDS: Card[] = [
	{
		icon: Terminal,
		label: "shell.exec",
		blurb: "Run a command in the sandbox.",
		body: "Spawns an isolated shell, streams stdout and stderr back live, and reports the exit code when the process settles.",
	},
	{
		icon: Cpu,
		label: "proc.trace",
		blurb: "Stream syscalls as they fire.",
		body: "Attaches to the target process and emits every syscall with its arguments and return value, filterable by name.",
	},
	{
		icon: GitBranch,
		label: "git.graph",
		blurb: "Walk the branch topology.",
		body: "Renders the commit DAG for the current repository — branches, merges, and tags — as a navigable graph.",
	},
	{
		icon: Database,
		label: "db.query",
		blurb: "Inspect tables, run raw SQL.",
		body: "Opens a read-only console against the connected database with schema introspection and query history.",
	},
	{
		icon: Activity,
		label: "net.probe",
		blurb: "Ping hosts and trace routes.",
		body: "Sends ICMP probes to a target host, plots latency over time, and traces each hop along the route.",
	},
	{
		icon: FileCode,
		label: "fs.watch",
		blurb: "Tail file changes live.",
		body: "Watches a directory tree and streams create, modify, and delete events with debounced batching.",
	},
];

export default function MorphDialogPreview({
	values,
	reducedMotion,
}: PreviewProps) {
	const stiffness = values.stiffness as number;
	const damping = values.damping as number;
	const radius = values.radius as number;
	const blurBackdrop = values.blurBackdrop as boolean;
	const autoFocus = values.autoFocus as boolean;

	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const card = CARDS[active];
	const Icon = card.icon;

	// The close morph animates the surviving CARD, which lives in this tree —
	// it must share the panel's spring or open and close feel different.
	const transition = reducedMotion
		? { duration: 0 }
		: morphTransition(stiffness, damping);

	return (
		<div className="grid h-full min-h-155 w-full place-items-center p-2 md:p-8">
			<MotionConfig transition={transition}>
				<div className="grid w-full max-w-3xl grid-cols-2 md:grid-cols-3 gap-2 md:gap-4">
					{CARDS.map((c, i) => {
						const CardIcon = c.icon;
						return (
							<motion.button
								key={c.label}
								type="button"
								layoutId={reducedMotion ? undefined : `morph-card-${i}`}
								style={{ borderRadius: 12 }}
								onClick={() => {
									setActive(i);
									setOpen(true);
								}}
								className="flex aspect-square flex-col items-start justify-center gap-3 border border-hairline bg-raised p-5 text-left transition-colors hover:border-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 max-md:nth-[6]:hidden max-md:nth-[5]:hidden"
							>
								<MorphShared
									as="span"
									layoutId={`morph-icon-${i}`}
									reducedMotion={reducedMotion}
								>
									<CardIcon className="size-6 text-accent" />
								</MorphShared>
								<MorphShared
									as="h3"
									layoutId={`morph-title-${i}`}
									reducedMotion={reducedMotion}
									className="font-display text-sm text-ink"
								>
									{c.label}
								</MorphShared>
								<span className="font-sans text-xs leading-snug text-ink-mute">
									{c.blurb}
								</span>
							</motion.button>
						);
					})}
				</div>
			</MotionConfig>

			{/* Always mounted — {open && …} would kill the close morph. */}
			<MorphPanel
				open={open}
				onOpenChange={setOpen}
				layoutId={`morph-card-${active}`}
				stiffness={stiffness}
				damping={damping}
				radius={radius}
				blurBackdrop={blurBackdrop}
				autoFocus={autoFocus}
				reducedMotion={reducedMotion}
				aria-label={card.label}
				className="w-full max-w-sm border border-hairline bg-panel shadow-2xl"
			>
				{/* Icon + title sit OUTSIDE the crossfade so they travel, not fade. */}
				<div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
					<div className="flex flex-col gap-2">
						<MorphShared
							as="span"
							layoutId={`morph-icon-${active}`}
							reducedMotion={reducedMotion}
						>
							<Icon className="size-5 text-accent" />
						</MorphShared>
						<MorphShared
							as="h3"
							layoutId={`morph-title-${active}`}
							reducedMotion={reducedMotion}
							className="font-display text-sm text-ink"
						>
							{card.label}
						</MorphShared>
					</div>
					<button
						type="button"
						onClick={() => setOpen(false)}
						className="-mt-0.5 -mr-1.5 rounded-md p-1.5 text-ink-dim transition-colors hover:bg-raised hover:text-ink"
						aria-label="Close dialog"
					>
						<X className="size-4" />
					</button>
				</div>
				<motion.div
					className="flex flex-col gap-4 px-5 pb-5"
					initial={reducedMotion ? false : { opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={
						reducedMotion ? undefined : { duration: 0.18, delay: 0.12 }
					}
				>
					<p className="font-sans text-xs leading-relaxed text-ink-dim">
						{card.body}
					</p>
					<button
						type="button"
						onClick={() => setOpen(false)}
						className="self-start rounded-md bg-accent px-3 py-1.5 font-display text-xs text-on-accent transition-opacity hover:opacity-90"
					>
						Run
					</button>
				</motion.div>
			</MorphPanel>
		</div>
	);
}
