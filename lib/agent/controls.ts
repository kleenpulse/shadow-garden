// Pure control logic for the in-browser agent (public/agent). No React, no nuqs,
// relative imports only: scripts/agent/check-agent.ts runs it under plain bun.
//
// The agent sends every value as text, because a tool schema cannot say "number
// or string or boolean, depending on another field". This module turns that text
// into a typed patch against the component's own PropSchema, or refuses the whole
// batch without changing anything.

import type { PropSchema, PropValue, TunedValues } from "../registry/types";

export interface ControlChange {
	name: string;
	value: string;
}

export type ChangeResult =
	| { ok: true; patch: TunedValues; notes: string[] }
	| { ok: false; reason: string; field: string };

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function normalizeHex(text: string): string | null {
	const value = text.trim().toLowerCase();
	if (!HEX.test(value)) return null;
	if (value.length === 4) {
		return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
	}
	return value;
}

function parseOne(
	prop: PropSchema,
	raw: string,
): { ok: true; value: PropValue } | { ok: false; reason: string } {
	const text = String(raw).trim();
	switch (prop.kind) {
		case "number": {
			const value = Number(text);
			if (text === "" || !Number.isFinite(value)) {
				return { ok: false, reason: `${prop.name} needs a number from ${prop.min} to ${prop.max}.` };
			}
			if (value < prop.min || value > prop.max) {
				return {
					ok: false,
					reason: `${prop.name} must be from ${prop.min} to ${prop.max}${prop.unit ? ` ${prop.unit}` : ""}; ${value} is outside that range.`,
				};
			}
			return { ok: true, value };
		}
		case "boolean": {
			const lower = text.toLowerCase();
			if (lower === "true" || lower === "on") return { ok: true, value: true };
			if (lower === "false" || lower === "off") return { ok: true, value: false };
			return { ok: false, reason: `${prop.name} is on or off: send true or false.` };
		}
		case "enum": {
			const match = prop.options.find((option) => option.toLowerCase() === text.toLowerCase());
			if (!match) {
				return { ok: false, reason: `${prop.name} must be one of: ${prop.options.join(", ")}.` };
			}
			return { ok: true, value: match };
		}
		case "color": {
			const hex = normalizeHex(text);
			if (!hex) {
				return { ok: false, reason: `${prop.name} needs a hex color such as #a855f7.` };
			}
			return { ok: true, value: hex };
		}
	}
}

function isDisabled(prop: PropSchema, values: TunedValues): boolean {
	const rule = prop.disabledWhen;
	if (!rule) return false;
	const current = values[rule.prop];
	return "equals" in rule ? current === rule.equals : current !== rule.notEquals;
}

/**
 * Validate every change before applying any. Linked `sets` writes are added the
 * same way the bench's own setter adds them, unless the batch sets that control
 * explicitly. `current` is the values the visitor sees now.
 */
export function applyChanges(
	props: PropSchema[],
	current: TunedValues,
	changes: ControlChange[],
): ChangeResult {
	if (changes.length === 0) {
		return { ok: false, reason: "No controls were named.", field: "changes" };
	}
	const patch: TunedValues = {};
	const seen = new Set<string>();
	for (const change of changes) {
		const prop = props.find((p) => p.name === change.name);
		if (!prop) {
			const names = props.map((p) => p.name).join(", ") || "none";
			return {
				ok: false,
				reason: `This component has no control named "${change.name}". Its controls are: ${names}.`,
				field: change.name,
			};
		}
		if (seen.has(prop.name)) {
			return { ok: false, reason: `${prop.name} is named twice.`, field: prop.name };
		}
		seen.add(prop.name);
		const parsed = parseOne(prop, change.value);
		if (!parsed.ok) return { ok: false, reason: parsed.reason, field: prop.name };
		patch[prop.name] = parsed.value;
	}
	for (const change of changes) {
		const linked = props.find((p) => p.name === change.name)?.sets;
		if (linked && !seen.has(linked.prop)) patch[linked.prop] = linked.value;
	}
	const next = { ...current, ...patch };
	const notes: string[] = [];
	for (const prop of props) {
		if (prop.name in patch && isDisabled(prop, next)) {
			const rule = prop.disabledWhen!;
			notes.push(
				`${prop.name} has no effect while ${rule.prop} is ${String(next[rule.prop])}.`,
			);
		}
	}
	return { ok: true, patch, notes };
}

export interface ControlView {
	name: string;
	kind: PropSchema["kind"];
	description: string;
	default: PropValue;
	value?: PropValue;
	min?: number;
	max?: number;
	step?: number;
	unit?: string;
	options?: string[];
	inactive?: boolean;
}

/** The schema of each control, plus its live value when `values` is given. */
export function controlViews(props: PropSchema[], values?: TunedValues): ControlView[] {
	return props.map((prop) => {
		const view: ControlView = {
			name: prop.name,
			kind: prop.kind,
			description: prop.description,
			default: prop.default,
		};
		if (values) {
			view.value = values[prop.name] ?? prop.default;
			if (isDisabled(prop, values)) view.inactive = true;
		}
		if (prop.kind === "number") {
			view.min = prop.min;
			view.max = prop.max;
			if (prop.step !== undefined) view.step = prop.step;
			if (prop.unit) view.unit = prop.unit;
		}
		if (prop.kind === "enum") view.options = prop.options;
		return view;
	});
}

/** Query string for /components/<slug> that reproduces `patch` (defaults dropped). */
export function queryFor(props: PropSchema[], patch: TunedValues): string {
	const params = new URLSearchParams();
	for (const prop of props) {
		const value = patch[prop.name];
		if (value === undefined || value === prop.default) continue;
		params.set(prop.name, String(value));
	}
	const qs = params.toString();
	return qs ? `?${qs}` : "";
}
