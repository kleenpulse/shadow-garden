"use client";

import {
	Children,
	isValidElement,
	memo,
	useState,
	type CSSProperties,
	type ReactNode,
} from "react";
import {
	motion,
	useMotionTemplate,
	useSpring,
	useTransform,
	type MotionValue,
} from "motion/react";

// A hero stage that turns ordinary children into parallax depth layers — no
// canvas, no WebGL, just springs and a real 3D rendering context. Every
// direct child is one layer; how deep it sits is set by a `data-depth`
// attribute on the child itself:
//
//   <DepthStage>
//     <div data-depth="1">    furthest back — sits deepest, moves the most
//     <h1 data-depth="0.15">  near-front — barely moves
//     <div data-depth="-0.4"> in FRONT of the stage plane — counter-moves
//   </DepthStage>
//
// Why an attribute instead of a props array: children stay declarative JSX,
// server components can be layers, and adding one needs no API change. A
// child without data-depth defaults to 0.35.
//
// Depth is real, not faked: each layer is pushed along z behind one shared
// perspective, so the pointer tilt separates the layers the way a camera
// would, and the pan offset on top of that reads as the camera sliding. Far
// layers also lose focus, since a lens would drop them.
//
// The 3D is composed PER LAYER — `perspective() rotate() translate3d()` on
// each wrapper — rather than as one preserve-3d stage. Every layer box is
// the full stage, so the perspective origins coincide and the projection is
// identical; what differs is hit-testing. Chromium will not deliver a click
// to a `pointer-events: auto` element whose ancestor is `pointer-events:
// none` inside a preserve-3d context, and the wrappers below have to be
// pointer-transparent (next paragraph). Flat transforms keep both.
//
// Transform ownership is split so nothing fights: the OUTER wrapper owns the
// entrance, the MIDDLE owns parallax (motion springs write inline
// transforms), the INNER owns idle float (a CSS animation writes its own
// transform). One transform channel per element — stacking two on one node
// would have the animation freeze the springs for as long as it runs.
//
// Every layer wrapper covers the whole stage and they stack, so the wrappers
// are pointer-transparent — otherwise the topmost layer swallows every click
// meant for the ones beneath it. Anything a visitor should be able to press
// opts back in with `pointer-events: auto` on the element itself (a nav, a
// button row), never on a full-bleed layer.
export interface DepthStageProps {
	/** Accent wash behind the layers and the color of the spotlight. */
	accentColor?: string;
	/** Full-stack parallax travel at the deepest layer. */
	depth?: number;
	/** Stage tilt at the pointer extremes. */
	tiltMax?: number;
	/** Stagger the layers up on mount. */
	entrance?: boolean;
	/** Slow CSS drift on every layer while idle. */
	float?: boolean;
	/** A pointer-following light across the stage. */
	spotlight?: boolean;
	/** Blur the far layers the way a lens would. */
	depthOfField?: boolean;
	/** Quiesces everything: no tilt, no drift, no entrance. */
	reducedMotion?: boolean;
	className?: string;
	children?: ReactNode;
}

/** Pulls the declared layer depth off a child element, defaulting mid-stack. */
function layerDepthOf(child: ReactNode): number {
	if (!isValidElement(child)) return 0.35;
	const raw = (child.props as Record<string, unknown>)["data-depth"];
	const n = typeof raw === "number" ? raw : Number(raw);
	return Number.isFinite(n) ? Math.max(-1.5, Math.min(1.5, n)) : 0.35;
}

const DepthStage = memo(
	({
		accentColor = "#a855f7",
		depth = 40,
		tiltMax = 3.5,
		entrance = true,
		float = true,
		spotlight = true,
		depthOfField = true,
		reducedMotion = false,
		className,
		children,
	}: DepthStageProps) => {
		const [animName] = useState(
			() => `__sg_depth_float_${Math.random().toString(36).slice(2, 8)}`,
		);

		// One shared pointer signal; every layer derives its own travel from it.
		// Springs live here rather than per-layer so a fast pointer sweep costs
		// two integrators, not N.
		const px = useSpring(0, { stiffness: 110, damping: 16, mass: 0.45 });
		const py = useSpring(0, { stiffness: 110, damping: 16, mass: 0.45 });

		// The spotlight rides the same springs, so it lags the cursor by exactly
		// as much as the layers do — light and stage move as one object.
		const lx = useTransform(px, (v) => 50 + v * 40);
		const ly = useTransform(py, (v) => 50 - v * 40);
		const light = useMotionTemplate`radial-gradient(40% 40% at ${lx}% ${ly}%, ${accentColor}2e 0%, transparent 100%)`;

		const layers = Children.toArray(children);

		const track = (e: React.PointerEvent<HTMLDivElement>) => {
			if (reducedMotion || depth === 0) return;
			const r = e.currentTarget.getBoundingClientRect();
			if (r.width === 0 || r.height === 0) return;
			px.set((((e.clientX - r.left) / r.width) * 2 - 1));
			py.set(-(((e.clientY - r.top) / r.height) * 2 - 1));
		};

		const rest = () => {
			px.set(0);
			py.set(0);
		};

		return (
			<div
				className={
					className ??
					"relative h-full min-h-80 w-full select-none overflow-hidden"
				}
				onPointerMove={track}
				onPointerLeave={rest}
				style={{
					backgroundImage: `radial-gradient(120% 90% at 50% 110%, ${accentColor}30 0%, transparent 55%), radial-gradient(70% 60% at 78% 12%, ${accentColor}1f 0%, transparent 60%)`,
				}}
			>
				{float && !reducedMotion ? (
					<style>{`
						@keyframes ${animName} {
							from { transform: translateY(-5px); }
							to   { transform: translateY(5px); }
						}
					`}</style>
				) : null}

				{spotlight ? (
					<motion.div
						aria-hidden
						className="pointer-events-none absolute inset-0"
						style={{ backgroundImage: light }}
					/>
				) : null}

				<div className="absolute inset-0">
					{layers.map((child, i) => (
						<DepthLayer
							key={i}
							childDepth={layerDepthOf(child)}
							travel={depth}
							tiltMax={reducedMotion ? 0 : tiltMax}
							reducedMotion={reducedMotion}
							entranceEnabled={entrance}
							index={i}
							animName={animName}
							floatEnabled={float}
							dof={depthOfField}
							px={px}
							py={py}
						>
							{child}
						</DepthLayer>
					))}
				</div>
			</div>
		);
	},
);

function DepthLayer({
	childDepth,
	travel,
	tiltMax,
	reducedMotion,
	entranceEnabled,
	floatEnabled,
	dof,
	index,
	animName,
	px,
	py,
	children,
}: {
	childDepth: number;
	travel: number;
	tiltMax: number;
	reducedMotion: boolean;
	entranceEnabled: boolean;
	floatEnabled: boolean;
	dof: boolean;
	index: number;
	animName: string;
	px: MotionValue<number>;
	py: MotionValue<number>;
	children: ReactNode;
}) {
	// Per-layer channels derived from the SHARED pointer springs — one
	// integrator on the parent, exact multipliers here.
	const x = useTransform(px, (v) => v * childDepth * travel * 0.5);
	const y = useTransform(py, (v) => v * childDepth * travel * 0.5);
	// The z push scales with the same travel prop, so one control sets how
	// deep the whole stack is. Negative depth comes forward, toward the eye.
	const z = -childDepth * travel * 4;
	const rotY = useTransform(px, (v) => v * tiltMax);
	const rotX = useTransform(py, (v) => -v * tiltMax);
	// Order matters: rotate BEFORE translate, so the z push happens along the
	// tilted stage's normal and the layer's centre swings off-axis — that
	// swing is the parallax. Translating first would only scale it.
	const transform = useMotionTemplate`perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) translate3d(${x}px, ${y}px, ${z}px)`;
	// Focus falls off past the mid-stack; the near field and the copy stay
	// sharp, the far field goes soft. Static — it is a lens, not motion.
	const blur = dof ? Math.max(0, Math.abs(childDepth) - 0.45) * 3 : 0;

	const shouldEnter = entranceEnabled && !reducedMotion;
	const shouldFloat = floatEnabled && !reducedMotion;

	const innerStyle: CSSProperties = {
		...(shouldFloat
			? {
					animation: `${animName} ${3.6 + (index % 4) * 0.7}s ease-in-out ${
						index % 2 ? "alternate" : "alternate-reverse"
					} infinite`,
				}
			: {}),
		...(blur > 0 ? { filter: `blur(${blur.toFixed(2)}px)` } : {}),
	};

	return (
		/* Entrance owns this element's y/scale; the 3D lives one level down so
		   the two never write the same transform channel. */
		<motion.div
			className="pointer-events-none absolute inset-0"
			initial={shouldEnter ? { opacity: 0, y: 28, scale: 0.94 } : false}
			animate={shouldEnter ? { opacity: 1, y: 0, scale: 1 } : undefined}
			transition={{
				duration: 0.8,
				delay: shouldEnter ? 0.09 * index : 0,
				ease: [0.22, 1, 0.36, 1],
			}}
		>
			<motion.div className="h-full w-full" style={{ transform }}>
				<div className="h-full w-full" style={innerStyle}>
					{children}
				</div>
			</motion.div>
		</motion.div>
	);
}

DepthStage.displayName = "DepthStage";

export default DepthStage;

