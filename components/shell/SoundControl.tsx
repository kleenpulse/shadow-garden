"use client";

import { useEffect, useState } from "react";
import { useAudioStore } from "@/lib/audio-store";
import { useAudioAvailable } from "@/hooks/use-audio-available";
import SoundToggle from "./SoundToggle";
import VolumeControl from "./VolumeControl";

// Desktop sound cluster: the mute toggle plus a volume affordance hung beneath
// it. The relative wrapper anchors the volume popover under the button. Only
// TopBar (lg-only) mounts this, so the volume UI is desktop-only; MobileBar
// keeps the bare SoundToggle. Pro-gated like the toggle itself — no point
// offering a volume slider for a feature that (per lib/audio/engine.ts) won't
// actually make sound for a free visitor.
export default function SoundControl() {
	const enabled = useAudioStore((s) => s.enabled);
	const soundPro = useAudioAvailable() === true;

	// Persisted `enabled` hydrates client-side; hold the volume UI back until
	// mounted so SSR (always off) and client markup agree.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	return (
		<div className="relative">
			<SoundToggle />
			{mounted && enabled && soundPro && <VolumeControl />}
		</div>
	);
}
