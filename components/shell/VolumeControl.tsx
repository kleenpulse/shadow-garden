"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useAudioStore } from "@/lib/audio-store";
import { useInteractionSound } from "@/hooks/use-interaction-sound";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

// Volume affordance under the sound button. Collapsed: a 4px indicator bar the
// width of the button. Click → morphs into a draggable slider; click-outside or
// Escape springs it back. Renders only when audio is enabled (parent gates it),
// so it's desktop-only by construction (only TopBar mounts the parent).
const COLLAPSED_W = 32; // matches the md:size-8 sound button
const EXPANDED_W = 176;

const clamp = (v: number) => Math.min(1, Math.max(0, v));

export default function VolumeControl() {
	const volume = useAudioStore((s) => s.volume);
	const setVolume = useAudioStore((s) => s.setVolume);
	const { typeKey } = useInteractionSound();
	const reduce = usePrefersReducedMotion();

	const [expanded, setExpanded] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const trackRef = useRef<HTMLDivElement>(null);
	const dragging = useRef(false);

	// Dismiss on outside click / Escape — the ColorControl popover pattern. The
	// drag's own pointerdown lands inside the container, so dragging never
	// self-dismisses.
	useEffect(() => {
		if (!expanded) return;
		const onDoc = (event: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target as Node)
			) {
				setExpanded(false);
			}
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setExpanded(false);
		};
		document.addEventListener("mousedown", onDoc);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDoc);
			document.removeEventListener("keydown", onKey);
		};
	}, [expanded]);

	// Safety net: never strand the select-none guard on unmount mid-drag.
	useEffect(() => () => document.body.classList.remove("select-none"), []);

	const setFromClientX = (clientX: number) => {
		const rect = trackRef.current?.getBoundingClientRect();
		if (!rect || rect.width === 0) return;
		setVolume(clamp((clientX - rect.left) / rect.width));
		typeKey(); // soft preview of the level (throttled internally)
	};

	const onPointerDown = (event: React.PointerEvent) => {
		// Collapsed: first interaction just opens the slider.
		if (!expanded) {
			setExpanded(true);
			trackRef.current?.focus();
			return;
		}
		event.preventDefault();
		dragging.current = true;
		document.body.classList.add("select-none");
		trackRef.current?.focus();
		setFromClientX(event.clientX);

		const move = (e: PointerEvent) => {
			if (dragging.current) setFromClientX(e.clientX);
		};
		const up = () => {
			dragging.current = false;
			document.body.classList.remove("select-none");
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	};

	const onKeyDown = (event: React.KeyboardEvent) => {
		if (!expanded) {
			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				setExpanded(true);
			}
			return;
		}
		let next: number | null = null;
		if (event.key === "ArrowLeft" || event.key === "ArrowDown")
			next = volume - 0.05;
		else if (event.key === "ArrowRight" || event.key === "ArrowUp")
			next = volume + 0.05;
		else if (event.key === "Home") next = 0;
		else if (event.key === "End") next = 1;
		if (next === null) return; // Escape falls through to the document listener
		event.preventDefault();
		setVolume(clamp(next));
		typeKey();
	};

	const pct = `${Math.round(volume * 100)}%`;
	const spring = reduce
		? { duration: 0 }
		: ({ type: "spring", stiffness: 340, damping: 30 } as const);

	return (
		<div ref={containerRef} className="relative">
			<motion.div
				ref={trackRef}
				role="slider"
				tabIndex={0}
				aria-label="Volume"
				aria-orientation="horizontal"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(volume * 100)}
				aria-expanded={expanded}
				title="Adjust volume"
				onPointerDown={onPointerDown}
				onKeyDown={onKeyDown}
				initial={false}
				animate={{
					width: expanded ? EXPANDED_W : COLLAPSED_W,
					height: expanded ? 14 : 4,
				}}
				transition={spring}
				className={`absolute right-0 top-full mt-1 rounded-full outline-none   ${
					expanded ? "cursor-ew-resize shadow-md" : "cursor-pointer"
				}`}
			>
				{/* Enlarged hit target for the 4px collapsed bar. */}
				<span aria-hidden className="absolute -inset-y-2 inset-x-0" />

				{/* Track + fill, clipped to the pill. */}
				<span className="absolute inset-0 overflow-hidden rounded-full bg-hairline">
					<span
						className="absolute inset-y-0 left-0 bg-accent"
						style={{ width: pct }}
					/>
				</span>

				{/* Thumb — only meaningful while expanded. */}
				<motion.span
					aria-hidden
					className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-on-accent/40 bg-accent shadow"
					style={{ left: pct }}
					animate={{ opacity: expanded ? 1 : 0, scale: expanded ? 1 : 0.4 }}
					transition={spring}
				/>
			</motion.div>
		</div>
	);
}
