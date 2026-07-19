"use client";

import type { PropSchema, PropValue, TunedValues } from "@/lib/registry/types";
import NumberControl from "./controls/NumberControl";
import EnumControl from "./controls/EnumControl";
import BooleanControl from "./controls/BooleanControl";
import ColorControl from "./controls/ColorControl";

export default function ControlsPanel({
	props,
	values,
	onChange,
	onReset,
	dense = false,
}: {
	props: PropSchema[];
	values: TunedValues;
	onChange: (name: string, value: PropValue) => void;
	onReset: () => void;
	/** Single-column layout for narrow hosts (the fullscreen docked box) —
      the default grid keys off viewport breakpoints, not container width. */
	dense?: boolean;
}) {
	if (props.length === 0) return null;

	return (
		<section className="rounded-lg border border-hairline bg-panel/70 dark:bg-black/40 backdrop-blur-xs">
			<header className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
				<h2 className="font-display text-[11px] uppercase tracking-[0.2em] text-ink-dim">
					Controls
				</h2>
				<button
					type="button"
					onClick={onReset}
					className="font-mono text-[11px] text-ink-mute transition-colors hover:text-accent"
				>
					reset
				</button>
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
					const disabled = schema.disabledWhen
						? values[schema.disabledWhen.prop] === schema.disabledWhen.equals
						: false;
					switch (schema.kind) {
						case "number":
							return (
								<NumberControl
									key={schema.name}
									schema={schema}
									value={values[schema.name] as number}
									onChange={(value) => onChange(schema.name, value)}
									disabled={disabled}
								/>
							);
						case "enum":
							return (
								<EnumControl
									key={schema.name}
									schema={schema}
									value={values[schema.name] as string}
									onChange={(value) => onChange(schema.name, value)}
								/>
							);
						case "boolean":
							return (
								<BooleanControl
									key={schema.name}
									schema={schema}
									value={values[schema.name] as boolean}
									onChange={(value) => onChange(schema.name, value)}
								/>
							);
						case "color":
							return (
								<ColorControl
									key={schema.name}
									schema={schema}
									value={values[schema.name] as string}
									onChange={(value) => onChange(schema.name, value)}
								/>
							);
					}
				})}
			</div>
		</section>
	);
}
