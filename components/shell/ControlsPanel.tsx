"use client";

import type { PropKind, PropOfKind } from "@/lib/registry/kinds";
import type { PropSchema, PropValue, TunedValues } from "@/lib/registry/types";
import { useUIStore } from "@/lib/store";
import NumberControl from "./controls/NumberControl";
import EnumControl from "./controls/EnumControl";
import BooleanControl from "./controls/BooleanControl";
import ColorControl from "./controls/ColorControl";

// One control per kind, keyed by the kind. React can't live in
// lib/registry/kinds.ts (the headless check imports that module), so the mapping
// sits here — but it is a total Record, so a fifth PropKind fails to compile
// instead of rendering nothing where its control should be. A switch returning
// JSX would have fallen through to undefined, which React renders as a hole.
// A control's value type is exactly its kind's default type — number for number,
// string for enum and color, boolean for boolean. Saying it that way means the
// table can't be wired up crosswise.
type ControlProps<K extends PropKind> = {
	schema: PropOfKind<K>;
	value: PropOfKind<K>["default"];
	onChange: (value: PropOfKind<K>["default"]) => void;
	disabled?: boolean;
};

const CONTROLS = {
	number: NumberControl,
	enum: EnumControl,
	boolean: BooleanControl,
	color: ColorControl,
} satisfies { [K in PropKind]: (props: ControlProps<K>) => React.ReactNode };

/** The erased shape a single call site can invoke. */
type AnyControl = (props: {
	schema: PropSchema;
	value: PropValue;
	onChange: (value: PropValue) => void;
	disabled?: boolean;
}) => React.ReactNode;

export default function ControlsPanel({
	props,
	values,
	onChange,
	onReset,
	dense = false,
	pausable = false,
}: {
	props: PropSchema[];
	values: TunedValues;
	onChange: (name: string, value: PropValue) => void;
	onReset: () => void;
	/** Single-column layout for narrow hosts (the fullscreen docked box) —
      the default grid keys off viewport breakpoints, not container width. */
	dense?: boolean;
	/** Show the pause/play toggle — set for components with a halt-able loop. */
	pausable?: boolean;
}) {
	const paused = useUIStore((s) => s.paused);
	const togglePaused = useUIStore((s) => s.togglePaused);

	if (props.length === 0) return null;

	return (
		<section className="rounded-lg border border-hairline bg-panel/70 dark:bg-black/40 backdrop-blur-xs">
			<header className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
				<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-dim">
					Controls
				</h2>
				<div className="flex items-center gap-3">
					{pausable && (
						<button
							type="button"
							onClick={togglePaused}
							aria-pressed={paused}
							className="font-mono text-[11px] text-ink-mute transition-colors hover:text-accent"
						>
							{paused ? "play" : "pause"}
						</button>
					)}
					<button
						type="button"
						onClick={onReset}
						className="font-mono text-[11px] text-ink-mute transition-colors hover:text-accent"
					>
						reset
					</button>
				</div>
			</header>
			{/* Full-width bench: controls flow in columns beneath the preview/code tabs. */}
			<div
				className={
					dense
						? "grid grid-cols-1 items-start gap-y-4 p-3"
						: "grid grid-cols-1 items-start gap-x-8 gap-y-5 p-4 sm:grid-cols-2 lg:grid-cols-3"
				}
			>
				{props.map((schema) => {
					// Cross-prop gating from the schema (e.g. petals disabled at zero bloom).
					const gate = schema.disabledWhen;
					const disabled = !gate
						? false
						: "equals" in gate
							? values[gate.prop] === gate.equals
							: values[gate.prop] !== gate.notEquals;
						// `as never` — the lookup is keyed by the same discriminant the
						// schema carries, but TS can't correlate an indexed access with a
						// narrowed union member. Same escape the kind table documents.
						const Control = CONTROLS[schema.kind] as AnyControl;
						return (
							<Control
								key={schema.name}
								schema={schema}
								value={values[schema.name]}
								onChange={(value) => onChange(schema.name, value)}
								disabled={disabled}
							/>
						);
				})}
			</div>
		</section>
	);
}
