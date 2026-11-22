"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, X } from "lucide-react";
import {
	attachHost,
	deleteChat,
	getServerSnapshot,
	getSnapshot,
	markAssistantShown,
	openChat,
	startAssistant,
	subscribe,
} from "@/lib/agent/assistant-host";
import { useLocale } from "@/lib/i18n/provider";
import { absoluteUrl } from "@/lib/site";
import { cn } from "@/lib/utils";

// /ask: the assistant at full size. The mount moves here from the drawer
// (lib/agent/assistant-host.ts) and back when the visitor leaves, so a chat started
// here carries on beside the bench after the agent opens a component.

const NETWORK_URL = absoluteUrl("/agent/motion_garden");
const MANIFEST_URL = absoluteUrl("/agent/agent-manifest.json");

function CopyLine({ label, value }: { label: string; value: string }) {
	const t = useTranslations("pages.ask");
	const [copied, setCopied] = useState(false);
	return (
		<div className="space-y-1">
			<p className="font-display text-[10px] tracking-[0.16em] text-ink-mute uppercase">{label}</p>
			<div className="flex items-center gap-1 rounded-md bg-raised py-1 ps-2.5 pe-1">
				<code className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink" dir="ltr">
					{value}
				</code>
				<button
					type="button"
					onClick={() => {
						navigator.clipboard?.writeText(value).then(() => {
							setCopied(true);
							window.setTimeout(() => setCopied(false), 1500);
						}, () => {});
					}}
					aria-label={t("copy", { label })}
					className="grid h-7 w-7 shrink-0 place-items-center rounded text-ink-dim transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none"
				>
					{copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
				</button>
			</div>
		</div>
	);
}

// A clock for the chat list that ticks each minute, so "2 minutes ago" stays true.
// It reads the time only in the browser: Cache Components refuses Date.now() in a
// client component's prerender, and the list never renders on the server anyway.
function subscribeMinute(onTick: () => void) {
	const timer = window.setInterval(onTick, 60_000);
	return () => window.clearInterval(timer);
}
const readMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
const readMinuteOnServer = () => 0;

/** "5 minutes ago", "yesterday": how long ago a chat was last written to. */
function ago(at: number, now: number, locale: string) {
	const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
	// A chat saved since the clock last ticked is "this minute", never "in 1 minute".
	const minutes = Math.min(0, Math.round((at - now) / 60_000));
	if (Math.abs(minutes) < 60) return format.format(minutes, "minute");
	const hours = Math.round(minutes / 60);
	if (Math.abs(hours) < 24) return format.format(hours, "hour");
	return format.format(Math.round(hours / 24), "day");
}

/**
 * The chats this browser saved (public/agent/chat-log.js). Opening one swaps it in
 * for the chat on screen, which stays saved. Both wait while a turn runs.
 */
function ChatList() {
	const t = useTranslations("pages.ask");
	const locale = useLocale();
	const { chats } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	const now = useSyncExternalStore(subscribeMinute, readMinute, readMinuteOnServer);
	if (!chats || !chats.threads.length) return null;
	return (
		<section className="space-y-3">
			<h2 className="font-display text-[10px] tracking-[0.16em] text-ink-mute uppercase">
				{t("chatsTitle")}
			</h2>
			<ul className="-mx-2 max-h-72 space-y-0.5 overflow-y-auto">
				{chats.threads.map((thread) => {
					const current = thread.id === chats.current;
					const title = thread.title || t("untitledChat");
					return (
						<li
							key={thread.id}
							className={cn(
								"flex items-center gap-1 rounded-md pe-1 transition-colors",
								current ? "bg-raised" : "hover:bg-raised/60",
							)}
						>
							<button
								type="button"
								onClick={() => openChat(thread.id)}
								disabled={chats.busy && !current}
								aria-current={current ? "true" : undefined}
								className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-start focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-none disabled:opacity-50"
							>
								<span className={cn("block truncate text-[13px]", current ? "text-ink" : "text-ink-dim")}>
									{title}
								</span>
								<span className="font-display text-[10px] tracking-[0.08em] text-ink-mute uppercase">
									{ago(thread.updatedAt, now, locale)}
								</span>
							</button>
							<button
								type="button"
								onClick={() => deleteChat(thread.id)}
								disabled={chats.busy && current}
								aria-label={t("deleteChat", { title })}
								title={t("deleteChat", { title })}
								className="grid h-7 w-7 shrink-0 place-items-center rounded text-ink-mute transition-colors hover:text-accent focus-visible:text-accent focus-visible:outline-none disabled:opacity-50"
							>
								<X className="h-3.5 w-3.5" aria-hidden />
							</button>
						</li>
					);
				})}
			</ul>
		</section>
	);
}

export default function AskView() {
	const t = useTranslations("pages.ask");
	const hostRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const detach = attachHost(hostRef.current as HTMLDivElement, "page");
		startAssistant();
		// This page is the chat, so the visitor sees it at once.
		markAssistantShown();
		return detach;
	}, []);

	const abilities = ["find", "explain", "tune", "code"] as const;

	return (
		<div className="mx-auto max-w-6xl">
			<header className="mb-8">
				<p className="font-display text-[11px] tracking-[0.25em] text-ink-mute uppercase">
					{t("eyebrow")}
				</p>
				<h1 className="mt-2 font-title text-4xl leading-none font-black tracking-[0.02em] text-balance text-ink uppercase sm:text-5xl">
					{t("title")}
				</h1>
				<p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-dim">{t("lede")}</p>
			</header>
			<div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
				{/* The mount goes here. React renders this host empty. */}
				<div
					ref={hostRef}
					className="flex h-[calc(100dvh-10rem)] min-h-[480px] flex-col lg:h-[calc(100dvh-18.5rem)]"
				/>
				<aside className="space-y-8">
					<ChatList />
					<section className="space-y-3">
						<h2 className="font-display text-[10px] tracking-[0.16em] text-ink-mute uppercase">
							{t("abilitiesTitle")}
						</h2>
						<ul className="space-y-2.5">
							{abilities.map((key) => (
								<li key={key} className="text-[13px] leading-relaxed text-ink-dim">
									<span className="font-medium text-ink">{t(`abilities.${key}.title`)}</span>{" "}
									{t(`abilities.${key}.body`)}
								</li>
							))}
						</ul>
					</section>
					<section className="space-y-3">
						<h2 className="font-display text-[10px] tracking-[0.16em] text-ink-mute uppercase">
							{t("peerTitle")}
						</h2>
						<p className="text-[13px] leading-relaxed text-ink-dim">{t("peerBody")}</p>
						<CopyLine label={t("networkLabel")} value={NETWORK_URL} />
						<CopyLine label={t("manifestLabel")} value={MANIFEST_URL} />
					</section>
					<section className="space-y-2">
						<h2 className="font-display text-[10px] tracking-[0.16em] text-ink-mute uppercase">
							{t("privacyTitle")}
						</h2>
						<p className="text-xs leading-relaxed text-ink-mute">{t("privacyBody")}</p>
					</section>
				</aside>
			</div>
		</div>
	);
}
