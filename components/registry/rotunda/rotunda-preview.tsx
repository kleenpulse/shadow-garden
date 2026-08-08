"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { PreviewProps } from "@/lib/registry/types";
import Rotunda from "./rotunda";

// Half the panels carry a real link or a real button — the point of a DOM
// carousel is that they still work while the ring turns. The buttons run a
// short inline sequence so a click is unmistakable even mid-spin.
type Action = {
	label: string;
	done: string;
	log: [string, string];
};

type Panel = {
	tag: string;
	title: string;
	note: string;
	href?: string;
	action?: Action;
};

const PANELS: Panel[] = [
	{
		tag: "I",
		title: "Alpha",
		note: "Seven shades answer to one shadow.",
		action: {
			label: "Summon",
			done: "Manifested",
			log: ["> binding shade", "> alpha online"],
		},
	},
	{
		tag: "II",
		title: "Bench",
		note: "Graphite, and a single amethyst.",
		href: "/components/masonry",
	},
	{
		tag: "III",
		title: "Cathode",
		note: "A beam that turns at every edge.",
		href: "/components/cathode",
	},
	{
		tag: "IV",
		title: "Delta",
		note: "Simple orders, overwhelming force.",
		action: {
			label: "Deploy",
			done: "Deployed",
			log: ["> orders relayed", "> delta inbound"],
		},
	},
	{ tag: "V", title: "Epsilon", note: "Polish is not decoration." },
	{
		tag: "VI",
		title: "Zeta",
		note: "Everything, seen before it moves.",
		href: "/components/swarm",
	},
	{ tag: "VII", title: "Eta", note: "The cause, not the symptom." },
];

type Phase = "idle" | "casting" | "done";

const CAST_MS = 620;
const HOLD_MS = 3400;

function PanelCard({
	panel,
	reducedMotion,
}: {
	panel: Panel;
	reducedMotion: boolean;
}) {
	const [phase, setPhase] = useState<Phase>("idle");
	const timers = useRef<number[]>([]);

	const clear = () => {
		timers.current.forEach(clearTimeout);
		timers.current = [];
	};
	useEffect(() => clear, []);

	const fire = () => {
		if (phase !== "idle") return;
		clear();
		// Reduced motion still gets the outcome — it just skips the theatre.
		if (reducedMotion) {
			setPhase("done");
			timers.current.push(window.setTimeout(() => setPhase("idle"), HOLD_MS));
			return;
		}
		setPhase("casting");
		timers.current.push(window.setTimeout(() => setPhase("done"), CAST_MS));
		timers.current.push(
			window.setTimeout(() => setPhase("idle"), CAST_MS + HOLD_MS),
		);
	};

	const lit = phase !== "idle";
	const action = panel.action;

	return (
		<article
			className={`relative flex h-44 w-64 flex-col overflow-hidden rounded-xl border bg-panel/90 p-4 backdrop-blur-md transition-[border-color,box-shadow] duration-500 ${
				lit
					? "border-accent/60 shadow-[0_0_34px_-10px_var(--color-accent)]"
					: "border-hairline"
			}`}
		>
			<AnimatePresence>
				{phase === "casting" ? (
					<motion.div
						key="beam"
						initial={{ y: "-140%" }}
						animate={{ y: "220%" }}
						exit={{ opacity: 0 }}
						transition={{ duration: CAST_MS / 1000, ease: "easeInOut" }}
						className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-linear-to-b from-transparent via-accent/35 to-transparent"
					/>
				) : null}
			</AnimatePresence>

			<div className="flex items-center gap-2">
				<p className="font-display text-[10px] tracking-[0.3em] text-accent uppercase">
					{panel.tag}
				</p>
				{lit ? (
					<motion.span
						initial={{ scale: 0 }}
						animate={{ scale: 1 }}
						className="size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]"
					/>
				) : null}
			</div>

			<h3 className="mt-3 font-display text-lg text-ink">{panel.title}</h3>

			{/* The note and the readout share one slot, so the card never reflows. */}
			<div className="relative mt-2 h-9">
				<AnimatePresence mode="wait">
					{phase === "done" && action ? (
						<motion.ul
							key="log"
							// The exit lives here, not on the lines: AnimatePresence only
							// tracks its direct child, so `mode="wait"` would otherwise
							// swap instantly and the readout would pop out.
							exit={{ opacity: 0 }}
							transition={{ duration: 0.2 }}
							className="absolute inset-0 space-y-0.5"
						>
							{action.log.map((line, i) => (
								<motion.li
									key={line}
									initial={{ opacity: 0, x: -6 }}
									animate={{ opacity: 1, x: 0 }}
									transition={{ delay: i * 0.12, duration: 0.24 }}
									className="font-display text-[10px] tracking-[0.12em] text-accent"
								>
									{line}
								</motion.li>
							))}
						</motion.ul>
					) : (
						<motion.p
							key="note"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.2 }}
							className="absolute inset-0 text-xs leading-relaxed text-ink-dim"
						>
							{panel.note}
						</motion.p>
					)}
				</AnimatePresence>
			</div>

			{panel.href ? (
				<a
					href={panel.href}
					className="mt-auto w-fit font-display text-[10px] tracking-[0.24em] text-accent uppercase underline decoration-accent/40 underline-offset-4 outline-none hover:decoration-accent focus-visible:ring-2 focus-visible:ring-accent/60"
				>
					open →
				</a>
			) : null}

			{action ? (
				<button
					type="button"
					onClick={fire}
					aria-live="polite"
					className={`mt-auto w-fit cursor-pointer overflow-hidden rounded-md border px-2.5 py-1 font-display text-[10px] tracking-[0.24em] uppercase outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-accent/60 ${
						lit
							? "border-accent/70 bg-accent/15 text-accent"
							: "border-hairline text-ink-dim hover:border-accent/60 hover:text-accent"
					}`}
				>
					{phase === "casting" ? (
						<span className="flex items-center gap-1.5">
							<span className="size-2 animate-spin rounded-full border border-accent border-t-transparent" />
							{action.label}
						</span>
					) : phase === "done" ? (
						`✓ ${action.done}`
					) : (
						action.label
					)}
				</button>
			) : null}
		</article>
	);
}

export default function RotundaPreview({
	values,
	reducedMotion,
	paused,
}: PreviewProps) {
	return (
		<div className="relative flex h-full min-h-80 w-full items-center justify-center overflow-hidden">
			<Rotunda
				radius={values.radius as number}
				perspective={values.perspective as number}
				autoSpin={values.autoSpin as number}
				friction={values.friction as number}
				snap={values.snap as boolean}
				snapStiffness={values.snapStiffness as number}
				depthDim={values.depthDim as number}
				depthBlur={values.depthBlur as number}
				faceCamera={values.faceCamera as boolean}
				dragSensitivity={values.dragSensitivity as number}
				paused={paused}
				reducedMotion={reducedMotion}
			>
				{PANELS.map((panel) => (
					<PanelCard
						key={panel.tag}
						panel={panel}
						reducedMotion={reducedMotion}
					/>
				))}
			</Rotunda>
			<p className="pointer-events-none absolute right-3 bottom-2 font-display text-[9px] tracking-[0.28em] text-ink-mute uppercase">
				drag to spin — text selects, links click
			</p>
		</div>
	);
}
