// The assistant's mount (#agent-app), created once outside React and moved between
// hosts. The runtime (public/agent/runtime) keeps references to the elements it
// builds and never looks them up again by position, so moving the subtree keeps the
// conversation, its listeners and its state. Two kinds of host take it:
// - "drawer": the Ask the Garden drawer, mounted on every shell page.
// - "page": the /ask page. While one is mounted it wins, so the chat fills the page.
// Leaving /ask moves the mount back to the drawer, and when a conversation is
// running the drawer opens, so the chat follows the visitor (open_component does
// exactly that navigation).

export type AssistantState = "loading" | "setup" | "ready" | "failed";
type HostKind = "drawer" | "page";

export interface AssistantParts {
	root: HTMLElement;
	/** React portal target above the chat: setup copy and load errors. */
	lead: HTMLElement;
	/** React portal target for starter prompts. site.js moves it above the input. */
	starters: HTMLElement;
}

/** The free tier (app/api/agent/llm), when the site offers it to this visitor. */
export interface FreeTier {
	perDay: number;
	left: number;
}

export interface AssistantSnapshot {
	parts: AssistantParts | null;
	started: boolean;
	pageActive: boolean;
	state: AssistantState;
	/** Null when the visitor has their own key or the site has no free tier. */
	free: FreeTier | null;
}

const SERVER: AssistantSnapshot = {
	parts: null,
	started: false,
	pageActive: false,
	state: "loading",
	free: null,
};

let snapshot: AssistantSnapshot = SERVER;
const listeners = new Set<() => void>();
const handoffListeners = new Set<() => void>();
const hosts: { el: HTMLElement; kind: HostKind }[] = [];

function update(patch: Partial<AssistantSnapshot>) {
	snapshot = { ...snapshot, ...patch };
	for (const listener of listeners) listener();
}

export function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export const getSnapshot = () => snapshot;
export const getServerSnapshot = () => SERVER;

/** Called when the /ask page lets go of a conversation in progress. */
export function onHandoff(listener: () => void) {
	handoffListeners.add(listener);
	return () => {
		handoffListeners.delete(listener);
	};
}

function create(): AssistantParts {
	const root = document.createElement("div");
	root.id = "agent-app";
	root.dir = "ltr";
	root.dataset.mgState = "loading";

	const slot = (name: string) => {
		const el = document.createElement("div");
		el.dataset.nsSlot = name;
		return el;
	};
	const lead = document.createElement("div");
	lead.className = "mg-lead";
	// site.js reports boot progress here, for screen readers. The visible copy is the
	// translated lead above.
	const status = document.createElement("p");
	status.id = "assistant-status";
	status.setAttribute("role", "status");
	status.className = "sr-only";
	const panels = document.createElement("div");
	panels.className = "assistant-panels";
	panels.append(slot("chat"), slot("agents"));
	const starters = document.createElement("div");
	starters.className = "mg-starters";

	root.append(slot("header"), lead, status, panels, starters, slot("settings"));

	window.addEventListener("mg-assistant-state", (event) => {
		const state = (event as CustomEvent<AssistantState>).detail;
		update({ state });
	});
	// site.js reports the free tier once, right after the runtime boots.
	window.addEventListener("mg-assistant-free", (event) => {
		update({ free: (event as CustomEvent<FreeTier | null>).detail });
	});
	return { root, lead, starters };
}

function ensureParts(): AssistantParts {
	if (!snapshot.parts) update({ parts: create() });
	return snapshot.parts as AssistantParts;
}

function place() {
	const { root } = ensureParts();
	const page = hosts.findLast((host) => host.kind === "page");
	const target = page ?? hosts.find((host) => host.kind === "drawer");
	if (target && root.parentElement !== target.el) target.el.append(root);
	const pageActive = Boolean(page);
	if (pageActive !== snapshot.pageActive) update({ pageActive });
}

/** Give the mount a home. Returns the detach function for the effect's cleanup. */
export function attachHost(el: HTMLElement, kind: HostKind) {
	const entry = { el, kind };
	hosts.push(entry);
	place();
	return () => {
		hosts.splice(hosts.indexOf(entry), 1);
		const hadConversation = kind === "page" && hasConversation();
		place();
		if (hadConversation) for (const listener of handoffListeners) listener();
	};
}

/** True once the visitor has sent a message in this chat. */
export function hasConversation() {
	return Boolean(snapshot.parts?.root.querySelector("#ns-msgs .ns-msg.user"));
}

/**
 * Load the runtime's stylesheet and public/agent/site.js, once. The bundle is
 * served from /public outside the Next build, so it loads by URL and never ships to
 * visitors who don't ask. The mount must already be in the document: site.js boots
 * the runtime on "#agent-app".
 */
export function startAssistant() {
	if (snapshot.started) return;
	ensureParts();
	const css = document.createElement("link");
	css.rel = "stylesheet";
	css.href = "/agent/assistant.css";
	document.head.append(css);
	const script = document.createElement("script");
	script.type = "module";
	script.src = "/agent/site.js";
	document.body.append(script);
	update({ started: true });
}

/** Type a request into the runtime's own input and send it, as the visitor would. */
export function sendRequest(text: string) {
	const root = snapshot.parts?.root;
	const input = root?.querySelector<HTMLInputElement>("#ns-input");
	const send = root?.querySelector<HTMLButtonElement>("#ns-send");
	if (!input || !send || send.disabled) return;
	input.value = text;
	input.dispatchEvent(new Event("input", { bubbles: true }));
	send.click();
	input.focus();
}
