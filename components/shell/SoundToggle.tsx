"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useAudioStore } from "@/lib/audio-store";
import { useInteractionSound } from "@/hooks/use-interaction-sound";
import { cn } from "@/lib/utils";

// Consent control for interaction audio, sits beside ThemeToggle. The click
// that enables sound is itself the gesture that unlocks the AudioContext — so
// the very first "on" plays a confirming cue with no extra interaction needed.
export default function SoundToggle({ className }: { className?: string }) {
	const enabled = useAudioStore((s) => s.enabled);
	const toggle = useAudioStore((s) => s.toggle);
	const { play } = useInteractionSound();

	// Persisted state hydrates client-side; hold a neutral icon until mounted so
	// SSR (always off) and client markup agree.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

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
			className={cn(
				"grid size-7 md:size-8 place-items-center rounded-md border border-hairline text-ink-dim transition-colors hover:text-accent focus-visible:text-accent",
				enabled && "text-accent",
				className,
			)}
		>
			{mounted && enabled ? (
				<Volume2 className="h-4 w-4" aria-hidden />
			) : mounted ? (
				<VolumeX className="h-4 w-4" aria-hidden />
			) : (
				<span className="h-4 w-4" aria-hidden />
			)}
		</button>
	);
}
