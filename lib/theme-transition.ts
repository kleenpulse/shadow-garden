import { flushSync } from "react-dom";
import { animate } from "motion";

export type TransitionVariant =
	| "circle"
	| "square"
	| "triangle"
	| "diamond"
	| "hexagon"
	| "rectangle"
	| "star";

/**
 * Returns the [collapsed, expanded] clip-path pair for a reveal `variant`,
 * centered on (cx, cy) and sized to cover the viewport from that point.
 *
 * All coordinates are emitted as PERCENTAGES of the reference box, not px.
 * The clip animates on `::view-transition-new(root)`, whose box is the
 * *snapshot containing block* — on Android Chrome that is larger than the
 * visual viewport (scaled to fit), so px coordinates land proportionally
 * toward the top-left and the reveal appears to start from the wrong side.
 * Percentages resolve against whatever box the pseudo actually has, keeping
 * the origin on the trigger everywhere.
 */
export function getThemeTransitionClipPaths(
	variant: TransitionVariant,
	cx: number,
	cy: number,
	maxRadius: number,
	viewportWidth: number,
	viewportHeight: number,
): [string, string] {
	const xp = (v: number) => `${((v / viewportWidth) * 100).toFixed(3)}%`;
	const yp = (v: number) => `${((v / viewportHeight) * 100).toFixed(3)}%`;
	// circle() resolves a % radius against hypot(w, h) / √2 of the reference box.
	const diag = Math.hypot(viewportWidth, viewportHeight) / Math.SQRT2;
	const rp = (v: number) => `${((v / diag) * 100).toFixed(3)}%`;
	const vertex = (x: number, y: number) => `${xp(x)} ${yp(y)}`;
	const polygonCollapsed = (vertexCount: number) => {
		const pairs = Array.from({ length: vertexCount }, () =>
			vertex(cx, cy),
		).join(", ");
		return `polygon(${pairs})`;
	};

	switch (variant) {
		case "circle":
			return [
				`circle(0% at ${xp(cx)} ${yp(cy)})`,
				`circle(${rp(maxRadius)} at ${xp(cx)} ${yp(cy)})`,
			];
		case "square": {
			const halfW = Math.max(cx, viewportWidth - cx);
			const halfH = Math.max(cy, viewportHeight - cy);
			const halfSide = Math.max(halfW, halfH) * 1.05;
			const end = [
				vertex(cx - halfSide, cy - halfSide),
				vertex(cx + halfSide, cy - halfSide),
				vertex(cx + halfSide, cy + halfSide),
				vertex(cx - halfSide, cy + halfSide),
			].join(", ");
			return [polygonCollapsed(4), `polygon(${end})`];
		}
		case "triangle": {
			const scale = maxRadius * 2.2;
			const dx = (Math.sqrt(3) / 2) * scale;
			const verts = [
				vertex(cx, cy - scale),
				vertex(cx + dx, cy + 0.5 * scale),
				vertex(cx - dx, cy + 0.5 * scale),
			].join(", ");
			return [polygonCollapsed(3), `polygon(${verts})`];
		}
		case "diamond": {
			// Slightly larger than the circle radius so axis-aligned coverage matches.
			const R = maxRadius * Math.SQRT2;
			const end = [
				vertex(cx, cy - R),
				vertex(cx + R, cy),
				vertex(cx, cy + R),
				vertex(cx - R, cy),
			].join(", ");
			return [polygonCollapsed(4), `polygon(${end})`];
		}
		case "hexagon": {
			const R = maxRadius * Math.SQRT2;
			const verts: string[] = [];
			for (let i = 0; i < 6; i++) {
				const a = -Math.PI / 2 + (i * Math.PI) / 3;
				verts.push(vertex(cx + R * Math.cos(a), cy + R * Math.sin(a)));
			}
			return [polygonCollapsed(6), `polygon(${verts.join(", ")})`];
		}
		case "rectangle": {
			const halfW = Math.max(cx, viewportWidth - cx);
			const halfH = Math.max(cy, viewportHeight - cy);
			const end = [
				vertex(cx - halfW, cy - halfH),
				vertex(cx + halfW, cy - halfH),
				vertex(cx + halfW, cy + halfH),
				vertex(cx - halfW, cy + halfH),
			].join(", ");
			return [polygonCollapsed(4), `polygon(${end})`];
		}
		case "star": {
			// Small overscan so the last frames never leave a 1px seam.
			const R = maxRadius * Math.SQRT2 * 1.03;
			const innerRatio = 0.42;
			const starPolygon = (radius: number) => {
				const verts: string[] = [];
				for (let i = 0; i < 5; i++) {
					const outerA = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
					verts.push(
						vertex(
							cx + radius * Math.cos(outerA),
							cy + radius * Math.sin(outerA),
						),
					);
					const innerA = outerA + Math.PI / 5;
					verts.push(
						vertex(
							cx + radius * innerRatio * Math.cos(innerA),
							cy + radius * innerRatio * Math.sin(innerA),
						),
					);
				}
				return `polygon(${verts.join(", ")})`;
			};
			const startR = Math.max(2, R * 0.025);
			return [starPolygon(startR), starPolygon(R)];
		}
		default:
			return [
				`circle(0% at ${xp(cx)} ${yp(cy)})`,
				`circle(${rp(maxRadius)} at ${xp(cx)} ${yp(cy)})`,
			];
	}
}

/**
 * Fallback reveal for browsers without the View Transitions API. Paints a
 * full-viewport overlay in the *outgoing* paper color, swaps the theme beneath
 * it, then uses `motion` to grow a transparent circular hole from the trigger —
 * revealing the real, newly-themed page through it. Always circular (the
 * polygon variants need the VT snapshot); the caller's `variant` is ignored.
 */
function runFallbackReveal(
	x: number,
	y: number,
	maxRadius: number,
	duration: number,
	applyTheme: () => void,
) {
	const oldPaper = getComputedStyle(document.documentElement)
		.getPropertyValue("--color-paper")
		.trim();

	const overlay = document.createElement("div");
	overlay.style.position = "fixed";
	overlay.style.inset = "0";
	overlay.style.zIndex = "2147483647";
	overlay.style.pointerEvents = "none";
	overlay.style.background = oldPaper || "#f5f4f1";
	overlay.style.setProperty("--hole", "0px");
	const mask = `radial-gradient(circle at ${x}px ${y}px, transparent var(--hole), #000 calc(var(--hole) + 0.5px))`;
	overlay.style.webkitMaskImage = mask;
	overlay.style.maskImage = mask;
	document.body.appendChild(overlay);

	let removed = false;
	const remove = () => {
		if (removed) return;
		removed = true;
		overlay.remove();
	};

	// Swap the theme under the overlay — the synchronous `.dark` class toggle in
	// applyTheme repaints the page instantly via the CSS-var cascade.
	applyTheme();

	const controls = animate(0, maxRadius * 1.02, {
		duration: duration / 1000,
		ease: "easeInOut",
		onUpdate: (v) => overlay.style.setProperty("--hole", `${v}px`),
	});
	controls.finished.then(remove).catch(remove);
	// Defensive: never leave the overlay behind if the animation is interrupted.
	setTimeout(remove, duration + 100);
}

interface RunThemeTransitionOptions {
	/** Element whose center the reveal expands from. Ignored when `fromCenter` is true. */
	triggerEl?: HTMLElement | null;
	variant?: TransitionVariant;
	duration?: number;
	/** When true, the transition expands from the viewport center instead of the trigger. */
	fromCenter?: boolean;
	/**
	 * Synchronously applies the new theme. Called inside the View Transition
	 * snapshot so the captured frame already reflects the target theme. The caller
	 * owns persistence (e.g. next-themes' `setTheme`) and should also toggle the
	 * `.dark` class here so the snapshot is correct.
	 */
	applyTheme: () => void;
}

/**
 * Runs `applyTheme` inside a View Transition and animates a clip-path reveal of
 * the new theme expanding from the trigger (or viewport center). Honors reduced
 * motion (instant swap) and, where the View Transitions API is unavailable,
 * falls back to a `motion`-powered circular reveal.
 */
export function runThemeTransition({
	triggerEl,
	variant = "circle",
	duration = 400,
	fromCenter = false,
	applyTheme,
}: RunThemeTransitionOptions) {
	if (typeof document === "undefined") {
		applyTheme();
		return;
	}

	// Reduced motion: swap instantly, skip both the VT and fallback reveals. The
	// global @media(prefers-reduced-motion) block only neutralizes CSS animation;
	// the WAAPI / motion calls below are independent, so guard them here.
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		applyTheme();
		return;
	}

	const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
	const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

	let x: number;
	let y: number;
	if (fromCenter || !triggerEl) {
		x = viewportWidth / 2;
		y = viewportHeight / 2;
	} else {
		const { top, left, width, height } = triggerEl.getBoundingClientRect();
		x = left + width / 2;
		y = top + height / 2;
	}

	const maxRadius = Math.hypot(
		Math.max(x, viewportWidth - x),
		Math.max(y, viewportHeight - y),
	);

	// No View Transitions API → motion-powered circular reveal.
	if (typeof document.startViewTransition !== "function") {
		runFallbackReveal(x, y, maxRadius, duration, applyTheme);
		return;
	}

	const clipPath = getThemeTransitionClipPaths(
		variant,
		x,
		y,
		maxRadius,
		viewportWidth,
		viewportHeight,
	);

	const root = document.documentElement;
	root.setAttribute("data-theme-vt", "active");
	root.style.setProperty("--theme-vt-duration", `${duration}ms`);
	// Pin the collapsed clip-path via CSS so Firefox does not paint the new theme
	// unclipped between the snapshot and the ready.then() JS animation.
	root.style.setProperty("--theme-vt-clip-from", clipPath[0]);
	const cleanup = () => {
		root.removeAttribute("data-theme-vt");
		root.style.removeProperty("--theme-vt-duration");
		root.style.removeProperty("--theme-vt-clip-from");
	};

	const transition = document.startViewTransition(() => {
		flushSync(applyTheme);
	});
	if (typeof transition?.finished?.finally === "function") {
		transition.finished.finally(cleanup);
	} else {
		cleanup();
	}

	const ready = transition?.ready;
	if (ready && typeof ready.then === "function") {
		ready.then(() => {
			root.animate(
				{ clipPath },
				{
					duration,
					// Star: linear avoids easing overshoot that fights polygon interpolation at t→1.
					easing: variant === "star" ? "linear" : "ease-in-out",
					fill: "forwards",
					pseudoElement: "::view-transition-new(root)",
				},
			);
		});
	}
}
