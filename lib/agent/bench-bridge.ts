// The page side of the browser agent's site actions.
//
// public/agent/site-actions.js is a plain ES module served from /public, outside
// the Next bundle, so it cannot import React state. This module publishes the
// bench's operations on `window.__motionGarden`, and site-actions.js wraps them.
// The live values stay where they already live (the URL, through nuqs in
// LiveWorkspace); this file only forwards to the workspace that is mounted.
//
// Every operation refuses by returning {ok: false, reason, field} before
// changing anything. The runtime reports a throw as "unknown outcome", so
// nothing here throws on bad input.

import { getEntry } from "../registry";
import type { PropSchema, TunedValues } from "../registry/types";
import { applyChanges, controlViews, queryFor, type ControlChange } from "./controls";

export interface WorkspaceHandle {
	slug: string;
	props: PropSchema[];
	getValues: () => TunedValues;
	setMany: (patch: TunedValues) => void;
	reset: () => void;
}

type Refusal = { ok: false; reason: string; field?: string };

let current: WorkspaceHandle | null = null;
const waiters = new Set<() => void>();

/** Called by LiveWorkspace on mount. Returns the unregister function. */
export function registerWorkspace(handle: WorkspaceHandle): () => void {
	current = handle;
	for (const wake of waiters) wake();
	return () => {
		if (current === handle) current = null;
	};
}

/** The workspace for the page the visitor is on, if it is a component page. */
function mounted(): WorkspaceHandle | null {
	if (!current) return null;
	return window.location.pathname === `/components/${current.slug}` ? current : null;
}

function plain<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function componentInfo(slug: string) {
	const entry = getEntry(slug);
	if (!entry) return null;
	return {
		slug: entry.slug,
		name: entry.name,
		category: entry.category,
		kind: entry.kind ?? "component",
		path: `/components/${entry.slug}`,
	};
}

function readState(override?: TunedValues) {
	const workspace = mounted();
	if (!workspace) {
		return {
			ok: true as const,
			page: window.location.pathname,
			component: null,
			controls: [],
		};
	}
	const values = { ...workspace.getValues(), ...override };
	return plain({
		ok: true as const,
		page: window.location.pathname,
		component: componentInfo(workspace.slug),
		controls: controlViews(workspace.props, values),
	});
}

function waitForWorkspace(slug: string, timeoutMs: number): Promise<boolean> {
	return new Promise((resolve) => {
		const check = () => {
			if (current?.slug === slug && window.location.pathname === `/components/${slug}`) {
				done(true);
			}
		};
		const timer = window.setTimeout(() => done(false), timeoutMs);
		const poll = window.setInterval(check, 100);
		function done(ok: boolean) {
			window.clearTimeout(timer);
			window.clearInterval(poll);
			waiters.delete(check);
			resolve(ok);
		}
		waiters.add(check);
		check();
	});
}

async function openComponent(args: { slug: string; changes?: ControlChange[] }) {
	const entry = getEntry(String(args?.slug ?? ""));
	if (!entry) {
		return {
			ok: false,
			reason: `No component with the slug "${args?.slug}". Search the catalog for the right slug.`,
			field: "slug",
		} satisfies Refusal;
	}
	const changes = args.changes ?? [];
	let patch: TunedValues = {};
	// Anything but a list goes to applyChanges too, which refuses it with a reason.
	if (!Array.isArray(changes) || changes.length > 0) {
		const result = applyChanges(entry.props, {}, changes);
		if (!result.ok) return result;
		patch = result.patch;
	}
	const workspace = mounted();
	if (workspace?.slug === entry.slug) {
		if (Object.keys(patch).length > 0) workspace.setMany(patch);
		return { ...readState(patch), opened: entry.slug };
	}
	navigate?.(`/components/${entry.slug}${queryFor(entry.props, patch)}`);
	const arrived = await waitForWorkspace(entry.slug, 10_000);
	if (!arrived) {
		return {
			ok: true,
			opened: entry.slug,
			note: "The page is still loading. Read the bench state again before changing its controls.",
		};
	}
	return { ...readState(), opened: entry.slug };
}

function setControls(args: { changes: ControlChange[] }) {
	const workspace = mounted();
	if (!workspace) {
		return {
			ok: false,
			reason: "No component is open on this page. Open one first.",
			field: "changes",
		} satisfies Refusal;
	}
	const result = applyChanges(workspace.props, workspace.getValues(), args?.changes ?? []);
	if (!result.ok) return result;
	workspace.setMany(result.patch);
	return {
		...readState(result.patch),
		changed: Object.keys(result.patch),
		...(result.notes.length ? { notes: result.notes } : {}),
	};
}

function resetControls() {
	const workspace = mounted();
	if (!workspace) {
		return { ok: false, reason: "No component is open on this page.", field: "page" } satisfies Refusal;
	}
	const defaults: TunedValues = {};
	for (const prop of workspace.props) defaults[prop.name] = prop.default;
	workspace.reset();
	return { ...readState(defaults), reset: true };
}

let navigate: ((href: string) => void) | null = null;

export interface MotionGardenBench {
	version: 1;
	getState: typeof readState;
	openComponent: typeof openComponent;
	setControls: typeof setControls;
	resetControls: typeof resetControls;
}

declare global {
	interface Window {
		__motionGarden?: MotionGardenBench;
	}
}

/** Publish the bench on window for public/agent/site-actions.js. */
export function installBench(push: (href: string) => void): () => void {
	navigate = push;
	const bench: MotionGardenBench = {
		version: 1,
		getState: () => readState(),
		openComponent,
		setControls,
		resetControls,
	};
	window.__motionGarden = bench;
	return () => {
		if (window.__motionGarden === bench) delete window.__motionGarden;
		if (navigate === push) navigate = null;
	};
}
