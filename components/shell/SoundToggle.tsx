"use client";

import { useEffect, useState } from "react";
import { Lock, Volume2, VolumeX } from "lucide-react";
import { useAudioStore } from "@/lib/audio-store";
import { useInteractionSound } from "@/hooks/use-interaction-sound";
import { useAudioAvailable } from "@/hooks/use-audio-available";
import { cn } from "@/lib/utils";

// Consent control for interaction audio, sits beside ThemeToggle. Pro-gated:
// the engine only ever sounds when both this toggle AND the entitlement check
// say yes, so a free/lapsed visitor can't hear it even via a stale persisted
// "enabled" from before a downgrade. The gate itself lives in the engine — this
// button only asks whether sound is available so it can render the right icon.
// The click that enables sound is itself the gesture that unlocks the
// AudioContext — so the very first "on" plays a confirming cue with no extra
// interaction needed.
export default function SoundToggle({ className }: { className?: string }) {
	const enabled = useAudioStore((s) => s.enabled);
	const toggle = useAudioStore((s) => s.toggle);
	const { play } = useInteractionSound();
	const available = useAudioAvailable();
	const soundPro = available === true;
	const resolved = available !== null;

	// Persisted state hydrates client-side; hold a neutral icon until mounted so
	// SSR (always off) and client markup agree.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	// Loading (pro unresolved) or not mounted yet: neutral placeholder — same
	// footprint, no icon — so nothing flashes as enabled before the entitlement
	// check settles.
	const boxClass = cn(
		"grid size-7 md:size-8 place-items-center rounded-md border border-hairline text-ink-dim transition-colors hover:text-accent focus-visible:text-accent",
		className,
	);

	if (!mounted || !resolved) {
		return (
			<span aria-hidden className={boxClass}>
				<span className="h-4 w-4" />
			</span>
		);
	}

	if (!soundPro) {
		return (
			<button
				type="button"
				aria-label="Interaction sound is a Pro feature"
				title="Interaction sound is a Pro feature"
				onClick={() => {
					window.location.hash = "subscribe";
				}}
				className={cn(boxClass, "text-ink-mute")}
			>
				<Lock className="h-4 w-4" aria-hidden />
			</button>
		);
	}

	const label = enabled ? "Mute interaction sounds" : "Enable interaction sounds";

	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={enabled}
			title={label}
			onClick={() => {
				const next = !enabled;
				toggle();
				if (next) play("enable"); // greet on enable (context now unlocked)
			}}
			className={cn(boxClass, enabled && "text-accent")}
		>
			{enabled ? (
				<Volume2 className="h-4 w-4" aria-hidden />
			) : (
				<VolumeX className="h-4 w-4" aria-hidden />
			)}
		</button>
	);
}
