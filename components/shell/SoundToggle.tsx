"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Volume2, VolumeX } from "lucide-react";
import { useAudioStore } from "@/lib/audio-store";
import { useInteractionSound } from "@/hooks/use-interaction-sound";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Consent control for interaction audio, sits beside ThemeToggle. Off by
// default; the engine only sounds once this toggle says yes. The click that enables sound is itself the gesture that unlocks the
// AudioContext — so the very first "on" plays a confirming cue with no extra
// interaction needed.
export default function SoundToggle({ className }: { className?: string }) {
	const enabled = useAudioStore((s) => s.enabled);
	const toggle = useAudioStore((s) => s.toggle);
	const { play } = useInteractionSound();
	const t = useTranslations("chrome.soundToggle");

	// Persisted state hydrates client-side; hold a neutral icon until mounted so
	// SSR (always off) and client markup agree.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	// Not mounted yet: neutral placeholder — same footprint, no icon — so
	// nothing flashes as enabled before the persisted state hydrates.
	const boxClass = cn(
		"grid size-7 md:size-8 place-items-center rounded-md bg-surface text-ink-dim transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none",
		className,
	);

	if (!mounted) {
		return (
			<span aria-hidden className={boxClass}>
				<span className="h-4 w-4" />
			</span>
		);
	}

	const label = enabled ? t("mute") : t("enable");

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger
					render={
						<button
							type="button"
							aria-label={label}
							aria-pressed={enabled}
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
					}
				/>
				<TooltipContent side="bottom">{label}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
