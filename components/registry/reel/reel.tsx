"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
	AnimatePresence,
	animate,
	motion,
	useReducedMotion,
	type Variants,
} from "motion/react";

// One live slot in a sentence. The words sit on a drum: the next one rolls up
// from underneath while the old one rolls away over the top, and the slot's
// width springs to fit whatever just landed.
//
// THE DRUM. Nothing here is a real cylinder. Each word (or each letter) turns
// about an axis half an em behind its own face, set through the z part of
// transform-origin. A face that starts at -90 degrees about that axis is lying
// flat underneath, exactly where the next side of a drum would be, so two
// faces a quarter turn apart read as one solid rolling.
//
// THE WIDTH. The slot holds an invisible copy of the current word, in flow, so
// its resting width is always the word's own and follows the font and the
// viewport for free. Only the change is animated: the old width is read just
// before the word swaps, the new one just after, and a spring runs between
// them on the real `width`, so the rest of the sentence is pushed along
// instead of jumping. When the spring settles the inline width is removed.
//
// THE TEXT. The moving copies are hidden from assistive tech. A screen reader
// gets every word once, as a list, instead of a slot that changes under it.

export type ReelMode = "drum" | "letters";
export type ReelDirection = "up" | "down";

export interface ReelProps {
	/** The words the slot shows, in order. With more than one it cycles. */
	words?: string[];
	/** Seconds each word stays up. */
	interval?: number;
	/** `drum` rolls the whole word. `letters` rolls each letter on its own. */
	mode?: ReelMode;
	/** Delay between one letter and the next, in ms. Letters mode only. */
	stagger?: number;
	/** Spring tension for the roll and the width. */
	stiffness?: number;
	/** Spring friction. Low values wobble before they settle. */
	damping?: number;
	/** Which way the drum turns. */
	direction?: ReelDirection;
	/** Hold the current word while the pointer is over it. */
	pauseOnHover?: boolean;
	/** A thin bar under the slot that follows its width. */
	underline?: boolean;
	/** Color of the word in the slot, and of the bar. */
	accentColor?: string;
	/** Hold the current word. */
	paused?: boolean;
	/** Swap the words with a short fade. No roll and no moving width. */
	reducedMotion?: boolean;
	className?: string;
}

const DEFAULT_WORDS = ["faster", "quieter", "on rails"];

/** Depth of the axis each face turns about. Half an em is half a line of
 *  type, which is what makes two faces meet like the sides of a drum. */
const AXIS = "50% 50% -0.5em";
const PERSPECTIVE = 480;

export default function Reel({
	words = DEFAULT_WORDS,
	interval = 2.2,
	mode = "letters",
	stagger = 35,
	stiffness = 260,
	damping = 24,
	direction = "up",
	pauseOnHover = true,
	underline = true,
	accentColor = "#a855f7",
	paused = false,
	reducedMotion = false,
	className = "",
}: ReelProps) {
	const slotRef = useRef<HTMLSpanElement>(null);
	const fromWidth = useRef<number | null>(null);
	const widthRun = useRef<ReturnType<typeof animate> | null>(null);

	const systemStill = useReducedMotion();
	const still = reducedMotion || Boolean(systemStill);

	// Content identity, not array identity: an inline `words={[...]}` is a new
	// array every render and must not restart the cycle.
	const wordsKey = words.join("\u0000");
	const [state, setState] = useState({ key: wordsKey, turn: 0 });
	if (state.key !== wordsKey) setState({ key: wordsKey, turn: 0 });
	const turn = state.key === wordsKey ? state.turn : 0;

	const [hovered, setHovered] = useState(false);

	const count = words.length;
	const word = count > 0 ? words[turn % count] : "";
	const sign = direction === "down" ? -1 : 1;
	const halted = paused || (pauseOnHover && hovered) || count < 2;

	const live = useRef({ stiffness, damping, still });
	useLayoutEffect(() => {
		live.current = { stiffness, damping, still };
	});

	useEffect(() => {
		if (halted) return;
		const id = window.setTimeout(
			() => {
				// The last moment the old word is still laid out.
				const el = slotRef.current;
				if (el) fromWidth.current = el.getBoundingClientRect().width;
				setState((s) => ({ key: s.key, turn: s.turn + 1 }));
			},
			Math.max(0.2, interval) * 1000,
		);
		return () => window.clearTimeout(id);
	}, [halted, interval, turn, wordsKey]);

	useLayoutEffect(() => {
		const el = slotRef.current;
		if (!el) return;
		const from = fromWidth.current;
		fromWidth.current = null;
		widthRun.current?.stop();
		widthRun.current = null;
		// Back to the word's own width, which is also the measurement.
		el.style.width = "";
		if (from === null || live.current.still) return;
		const to = el.getBoundingClientRect().width;
		if (Math.abs(to - from) < 0.5) return;
		el.style.width = `${from}px`;
		const run = animate(
			el,
			{ width: [`${from}px`, `${to}px`] },
			{
				type: "spring",
				stiffness: live.current.stiffness,
				damping: live.current.damping,
			},
		);
		widthRun.current = run;
		run.then(() => {
			if (widthRun.current !== run) return;
			widthRun.current = null;
			el.style.width = "";
		});
	}, [turn, wordsKey]);

	useEffect(
		() => () => {
			widthRun.current?.stop();
		},
		[],
	);

	const variants = useMemo<Variants>(() => {
		if (still) {
			return {
				enter: { opacity: 0 },
				rest: { opacity: 1, transition: { duration: 0.2 } },
				leave: { opacity: 0, transition: { duration: 0.15 } },
			};
		}
		const spring = { type: "spring" as const, stiffness, damping };
		return {
			enter: (s: number) => ({ rotateX: -90 * s, opacity: 0 }),
			rest: {
				rotateX: 0,
				opacity: 1,
				transition: {
					rotateX: spring,
					opacity: { duration: 0.25, ease: "easeOut" },
				},
			},
			leave: (s: number) => ({
				rotateX: 90 * s,
				opacity: 0,
				transition: {
					rotateX: spring,
					opacity: { duration: 0.2, ease: "easeIn" },
				},
			}),
		};
	}, [still, stiffness, damping]);

	const split = mode === "letters";
	const gap = still ? 0 : Math.max(0, stagger) / 1000;
	const glyphs = split ? Array.from(word) : [];

	return (
		<span
			className={`relative inline-block whitespace-nowrap ${className}`.trim()}
			onPointerEnter={() => setHovered(true)}
			onPointerLeave={() => setHovered(false)}
		>
			<span className="sr-only">{words.join(", ")}</span>
			<span
				ref={slotRef}
				aria-hidden="true"
				className="relative inline-block align-baseline"
				style={{ color: accentColor }}
			>
				{/* The sizer. Split the same way as the moving copy, so both
				    lose the same kerning and come out the same width. */}
				<span className="invisible">
					{split
						? glyphs.map((glyph, i) => (
								<span key={i} className="inline-block whitespace-pre">
									{glyph}
								</span>
							))
						: word}
				</span>
				<AnimatePresence initial={false} custom={sign}>
					{split ? (
						<motion.span
							key={turn}
							className="absolute top-0 left-0"
							initial="enter"
							animate="rest"
							exit="leave"
							variants={{
								enter: {},
								rest: { transition: { staggerChildren: gap } },
								leave: { transition: { staggerChildren: gap } },
							}}
						>
							{glyphs.map((glyph, i) => (
								<motion.span
									key={i}
									className="inline-block whitespace-pre"
									custom={sign}
									variants={variants}
									style={{
										transformOrigin: AXIS,
										transformPerspective: PERSPECTIVE,
									}}
								>
									{glyph}
								</motion.span>
							))}
						</motion.span>
					) : (
						<motion.span
							key={turn}
							className="absolute top-0 left-0 whitespace-pre"
							custom={sign}
							initial="enter"
							animate="rest"
							exit="leave"
							variants={variants}
							style={{
								transformOrigin: AXIS,
								transformPerspective: PERSPECTIVE,
							}}
						>
							{word}
						</motion.span>
					)}
				</AnimatePresence>
				{underline ? (
					<span
						className="pointer-events-none absolute inset-x-0 -bottom-[0.1em] h-[0.06em] rounded-full opacity-40"
						style={{ backgroundColor: accentColor }}
					/>
				) : null}
			</span>
		</span>
	);
}
