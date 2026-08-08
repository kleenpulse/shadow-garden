"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useAudioStore } from "@/lib/audio-store";
import { useInteractionSound } from "@/hooks/use-interaction-sound";
import { useAudioAvailable } from "@/hooks/use-audio-available";
import { cn } from "@/lib/utils";

// Consent control for interaction audio, sits beside ThemeToggle. The click
// that enables sound is itself the gesture that unlocks the AudioContext — so
// the very first "on" plays a confirming cue with no extra interaction needed.
export default function SoundToggle({ className }: { className?: string }) {
	const enabled = useAudioStore((s) => s.enabled);
	const toggle = useAudioStore((s) => s.toggle);
	const { play } = useInteractionSound();
	const available = useAudioAvailable();
	const resolved = available !== null;

	// Persisted state hydrates client-side; hold a neutral icon until mounted so
	// SSR (always off) and client markup agree.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

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
