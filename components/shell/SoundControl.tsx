"use client";

import { useEffect, useState } from "react";
import { useAudioStore } from "@/lib/audio-store";
import { useIsPro } from "@/hooks/use-pro";
import { IS_LOCAL_DEV } from "@/lib/env";
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
	const pro = useIsPro();
	const soundPro = IS_LOCAL_DEV || pro === true;

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
