"use client";

import { useEffect, useState } from "react";
import { useAudioStore } from "@/lib/audio-store";
import SoundToggle from "./SoundToggle";
import VolumeControl from "./VolumeControl";

// Desktop sound cluster: the mute toggle plus a volume affordance hung beneath
// it. The relative wrapper anchors the volume popover under the button. Only
// TopBar (lg-only) mounts this, so the volume UI is desktop-only; MobileBar
// keeps the bare SoundToggle.
export default function SoundControl() {
	const enabled = useAudioStore((s) => s.enabled);

	// Persisted `enabled` hydrates client-side; hold the volume UI back until
	// mounted so SSR (always off) and client markup agree.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	return (
		<div className="relative">
			<SoundToggle />
			{mounted && enabled && <VolumeControl />}
		</div>
	);
}
