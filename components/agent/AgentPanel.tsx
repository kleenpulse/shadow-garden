"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Maximize2, Sparkles, X } from "lucide-react";
import { installBench } from "@/lib/agent/bench-bridge";
import {
	attachHost,
	getServerSnapshot,
	getSnapshot,
	onHandoff,
	sendRequest,
	startAssistant,
	subscribe,
} from "@/lib/agent/assistant-host";
import { cn } from "@/lib/utils";
import RuntimeSelects from "./RuntimeSelects";

// The open agentic web assistant (public/agent, see its README). Its mount lives in
// lib/agent/assistant-host.ts, outside React, and sits in this drawer on every shell
// page except /ask, which shows it full size. React only fills the two portal
// targets the host leaves for it (the lead copy and the starter prompts), so it
// never fights the runtime over the DOM the runtime builds.

// "Save and start" and the OpenRouter sign-in both reload the page. Remembering the
// open drawer for the tab brings the visitor straight back to the chat.
const OPEN_KEY = "mg-assistant-open";

export default function AgentPanel() {
	const t = useTranslations("chrome.agentPanel");
	const router = useRouter();
	const pathname = usePathname();
	const { parts, started, pageActive, state } = useSyncExternalStore(
		subscribe,
		getSnapshot,
		getServerSnapshot,
	);
	const [drawerOpen, setDrawerOpen] = useState(false);
	const open = drawerOpen && !pageActive;
	const hostRef = useRef<HTMLDivElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);

	// The bench's operations, for public/agent/site-actions.js. Installed on every
	// shell page so the assistant can act the moment it boots.
	useEffect(() => installBench((href) => router.push(href, { scroll: false })), [router]);

	const show = () => {
		startAssistant();
		setDrawerOpen(true);
	};

	useEffect(() => {
		const detach = attachHost(hostRef.current as HTMLDivElement, "drawer");
		let reopen = false;
		try {
			reopen = sessionStorage.getItem(OPEN_KEY) === "1";
		} catch {}
		if (reopen) {
			startAssistant();
			// The stored flag is outside React; this restores it once, after a reload.
			// eslint-disable-next-line react-hooks/set-state-in-effect
			setDrawerOpen(true);
		}
		// Leaving /ask mid-conversation: the chat moves here, so show it.
		const stopHandoff = onHandoff(() => setDrawerOpen(true));
		return () => {
			stopHandoff();
			detach();
		};
	}, []);

	useEffect(() => {
		try {
			if (open) sessionStorage.setItem(OPEN_KEY, "1");
			else if (!pageActive) sessionStorage.removeItem(OPEN_KEY);
		} catch {}
	}, [open, pageActive]);

	// globals.css reads this to push the shell column aside on wide screens.
	useEffect(() => {
		const html = document.documentElement;
		if (open) html.dataset.agentDrawer = "open";
		else delete html.dataset.agentDrawer;
		return () => {
			delete html.dataset.agentDrawer;
		};
	}, [open]);

	useEffect(() => {
		if (!open) return;
		closeRef.current?.focus();
		const onKey = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			// A dialog the runtime opened (consent, confirmation) or an open Select
			// (RuntimeSelects) handles its own Escape; it only closes that layer.
			if (document.querySelector('dialog[open], [role="listbox"]')) return;
			setDrawerOpen(false);
			triggerRef.current?.focus();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	// The runtime's settings hint starts out repeating its long "To start, …" setup
	// line, which the lead already says. Mark it so the stylesheet hides it; real
	// errors and the OpenRouter result replace that text and show.
	useEffect(() => {
		if (state !== "setup" || !parts) return;
		const hint = parts.root.querySelector("#ns-profile-hint");
		if (!hint) return;
		const mark = () =>
			hint.toggleAttribute("data-mg-repeat", /^To start,/.test(hint.textContent?.trim() ?? ""));
		mark();
		const observer = new MutationObserver(mark);
		observer.observe(hint, { childList: true, characterData: true, subtree: true });
		return () => observer.disconnect();
	}, [state, parts]);

	const onComponentPage = pathname.startsWith("/components/");
	const starters = [
		t("starters.find"),
		onComponentPage ? t("starters.tune") : t("starters.text"),
		t("starters.code"),
	];

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				onClick={show}
				aria-expanded={open}
				aria-controls="agent-drawer"
				aria-label={t("openAria")}
				className={cn(
					"fixed end-4 bottom-4 z-40 inline-flex items-center gap-2 rounded-full bg-panel/90 px-4 py-2.5 font-display text-[11px] tracking-[0.14em] text-ink uppercase shadow-lg backdrop-blur transition-[color,opacity] hover:text-accent focus-visible:text-accent focus-visible:outline-none",
					(open || pageActive) && "pointer-events-none opacity-0",
				)}
				tabIndex={pageActive ? -1 : undefined}
			>
				<Sparkles className="h-4 w-4 text-accent" aria-hidden />
				{t("open")}
			</button>
			<aside
				id="agent-drawer"
				aria-label={t("title")}
				inert={!open}
				className={cn(
					"fixed inset-y-0 end-0 z-50 flex w-full flex-col bg-surface shadow-2xl sm:w-[460px]",
					open ? "translate-x-0" : "translate-x-full rtl:-translate-x-full",
				)}
			>
				<header className="flex items-center gap-2 px-4 pt-3 pb-1">
					<p className="me-auto flex items-center gap-2 font-display text-[10px] tracking-[0.16em] text-ink-mute uppercase">
						<Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden />
						{t("kicker")}
					</p>
					<Link
						href="/ask"
						aria-label={t("expand")}
						title={t("expand")}
						className="grid h-8 w-8 place-items-center rounded-md bg-raised text-ink-dim transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
					>
						<Maximize2 className="h-3.5 w-3.5" aria-hidden />
					</Link>
					<button
						ref={closeRef}
						type="button"
						onClick={() => {
							setDrawerOpen(false);
							triggerRef.current?.focus();
						}}
						aria-label={t("close")}
						className="grid h-8 w-8 place-items-center rounded-md bg-raised text-ink-dim transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
					>
						<X className="h-4 w-4" aria-hidden />
					</button>
				</header>
				{/* The mount goes here (lib/agent/assistant-host.ts). React renders this
				    host empty and never touches its children. */}
				<div ref={hostRef} className="flex min-h-0 flex-1 flex-col px-4 pt-2 pb-4" />
			</aside>
			{parts &&
				createPortal(
					<div dir="auto">
						{state === "loading" && started && (
							<p className="text-sm text-ink-mute">{t("loading")}</p>
						)}
						{state === "failed" && <p className="text-sm text-ink-dim">{t("failed")}</p>}
						{state === "setup" && (
							<div className="space-y-2 pt-4">
								<h2 className="font-title text-lg font-medium text-ink">{t("setupTitle")}</h2>
								<p className="text-[13px] leading-relaxed text-ink-dim">{t("setupBody")}</p>
								<p className="text-xs leading-relaxed text-ink-mute">{t("privacy")}</p>
							</div>
						)}
					</div>,
					parts.lead,
				)}
			{parts &&
				createPortal(
					<div dir="auto" className="flex flex-wrap gap-1.5">
						<span className="sr-only">{t("startersLabel")}</span>
						{starters.map((text) => (
							<button
								key={text}
								type="button"
								onClick={() => sendRequest(text)}
								className="mg-starter"
							>
								{text}
							</button>
						))}
					</div>,
					parts.starters,
				)}
			{started && <RuntimeSelects rootId="agent-app" />}
		</>
	);
}
