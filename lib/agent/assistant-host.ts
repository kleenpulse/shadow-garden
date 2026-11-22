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
	/** Questions left today. Null until the server has been asked (on first open). */
	left: number | null;
}

/** The free tier's terms as the server rendered them (lib/agent/free-plan.ts). */
export interface FreePlan {
	perDay: number;
	model: string;
}

/** One saved chat, as public/agent/chat-log.js lists it. */
export interface ChatThread {
	id: string;
	/** The start of the first question, or "" when there is none. */
	title: string;
	updatedAt: number;
	/** True for a chat opened from a share link: someone else wrote its start. */
	shared: boolean;
}

/** The saved chats in this browser (public/agent/chat-log.js, threadsView). */
export interface ChatThreads {
	threads: ChatThread[];
	/** The chat on screen. It is in threads once it has a saved turn. */
	current: string;
	/** True while a turn runs. A chat cannot be opened then. */
	busy: boolean;
}

export interface AssistantSnapshot {
	parts: AssistantParts | null;
	started: boolean;
	pageActive: boolean;
	state: AssistantState;
	/** Null when the visitor has their own key or the site has no free tier. */
	free: FreeTier | null;
	/** Null until the chat history has loaded. */
	chats: ChatThreads | null;
}

const SERVER: AssistantSnapshot = {
	parts: null,
	started: false,
	pageActive: false,
	state: "loading",
	free: null,
	chats: null,
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
	// chat-log.js reports the saved chats after each change.
	window.addEventListener("mg-chat-threads", (event) => {
		update({ chats: (event as CustomEvent<ChatThreads>).detail });
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

// Modules the boot reaches late, at the end of a chain of requests: the runtime's
// entry (imported by site.js) and the site's actions (imported by the runtime
// once it has read the manifest). Asking for them at the start lets them arrive
// while the rest loads.
const EARLY_MODULES = ["/agent/runtime/index.js", "/agent/site-actions.js", "/agent/garden-data.js"];

/**
 * Hand site.js the free tier's terms, on the mount. site.js boots on them without
 * asking the server, so this must run before the assistant starts.
 */
export function setFreePlan(plan: FreePlan | null) {
	const { root } = ensureParts();
	if (plan) root.dataset.mgFreePlan = JSON.stringify(plan);
	else delete root.dataset.mgFreePlan;
}

/**
 * The visitor can see the chat now: the drawer opened, or the /ask page mounted.
 * site.js waits for this before it asks the server how many free questions are
 * left, so that request is made for people who open the assistant, not for every
 * page view. The flag covers a chat shown before site.js has loaded.
 */
export function markAssistantShown() {
	const { root } = ensureParts();
	if (root.dataset.mgShown === "1") return;
	root.dataset.mgShown = "1";
	window.dispatchEvent(new Event("mg-assistant-shown"));
}

/**
 * Load the runtime's stylesheet and public/agent/site.js, once. The bundle is
 * served from /public outside the Next build, so it loads by URL and is no part
 * of any page's own JavaScript. The mount must already be in the document:
 * site.js boots the runtime on "#agent-app".
 */
export function startAssistant() {
	if (snapshot.started) return;
	ensureParts();
	const css = document.createElement("link");
	css.rel = "stylesheet";
	css.href = "/agent/assistant.css";
	document.head.append(css);
	for (const href of EARLY_MODULES) {
		const hint = document.createElement("link");
		hint.rel = "modulepreload";
		hint.href = href;
		document.head.append(hint);
	}
	const script = document.createElement("script");
	script.type = "module";
	script.src = "/agent/site.js";
	document.body.append(script);
	update({ started: true });
}

/**
 * Start the assistant in the background, so the chat is ready when the drawer
 * opens. A cold start is a chain of about 35 small requests, each waiting on the
 * one before; on a slow connection that was several seconds of "Loading the
 * assistant" after the click. This runs it once the page has loaded and the
 * browser is idle, so it never competes with the page itself.
 *
 * It makes no function call: the files are static, and the free tier's count is
 * asked for only when the chat is shown (markAssistantShown). It is skipped when
 * the visitor asked to save data or is on a 2G connection. There the assistant
 * loads on first open.
 *
 * Returns the cancel function for the effect's cleanup.
 */
export function preloadAssistant(): () => void {
	if (snapshot.started) return () => {};
	const connection = (
		navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
	).connection;
	if (connection?.saveData || /2g$/.test(connection?.effectiveType ?? "")) return () => {};

	let idle = 0;
	let timer = 0;
	const begin = () => {
		if (typeof window.requestIdleCallback === "function") {
			idle = window.requestIdleCallback(() => startAssistant(), { timeout: 3000 });
		} else {
			// Safari has no requestIdleCallback. A short wait after load does the job.
			timer = window.setTimeout(startAssistant, 1200);
		}
	};
	if (document.readyState === "complete") begin();
	else window.addEventListener("load", begin, { once: true });

	return () => {
		window.removeEventListener("load", begin);
		if (idle) window.cancelIdleCallback(idle);
		if (timer) window.clearTimeout(timer);
	};
}

/**
 * Put a request in the runtime's own input and stop there. Sending stays the
 * visitor's choice: they can edit the text first, and on the free tier a sent
 * message spends one of their questions.
 */
export function fillRequest(text: string) {
	const input = snapshot.parts?.root.querySelector<HTMLInputElement>("#ns-input");
	if (!input || input.disabled) return;
	input.value = text;
	input.focus();
	input.setSelectionRange(text.length, text.length);
}

/** Show a saved chat in place of the one on screen (public/agent/chat-log.js). */
export function openChat(id: string) {
	window.dispatchEvent(new CustomEvent("mg-chat-open", { detail: id }));
}

/** Delete a saved chat from this browser (public/agent/chat-log.js). */
export function deleteChat(id: string) {
	window.dispatchEvent(new CustomEvent("mg-chat-delete", { detail: id }));
}

/**
 * A link that opens a saved chat in any browser. The chat travels inside the link,
 * after the #, so it never reaches the server. Resolves to null when the chat is
 * not saved, or the assistant has not started yet.
 */
export function shareChat(id: string): Promise<string | null> {
	const detail: { id: string; result: Promise<string | null> | null } = { id, result: null };
	window.dispatchEvent(new CustomEvent("mg-chat-share", { detail }));
	return detail.result ?? Promise.resolve(null);
}
