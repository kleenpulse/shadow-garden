"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "motion/react";
import AutoMaskVertical from "@/components/ui/auto-mask-vertical";

export type CommandDef = {
	id: string;
	label: string;
	icon?: ComponentType<{ className?: string }>;
	keywords?: string[];
	hint?: string;
	/**
	 * "You are here" — the command whose destination is already open. Drawn as a
	 * persistent accent mark, deliberately separate from cmdk's selection: that
	 * one is a cursor and the pointer steals it on hover, so it cannot double as
	 * a location marker.
	 */
	active?: boolean;
	onRun?: () => void;
};

export interface CommandGroupDef {
	id: string;
	heading: string;
	commands: CommandDef[];
	/**
	 * Pin this group to an always-visible footer bar instead of the scrolling
	 * list. Pinned commands survive search filtering (cmdk `forceMount`) and drop
	 * their heading — meant for a small set of standing actions.
	 */
	pinned?: boolean;
}

export type Hotkey = "cmd+k" | "ctrl+k" | "/";

export interface CommandPaletteProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	groups: CommandGroupDef[];
	onSelect?: (command: CommandDef) => void;
	/** Fires as the search query changes (each keystroke). */
	onValueChange?: (search: string) => void;
	/** Fires when a command is highlighted via pointer hover. */
	onItemHover?: (command: CommandDef) => void;
	/** One hotkey, or several bound at once (e.g. ["cmd+k", "/"]). */
	hotkey?: Hotkey | Hotkey[];
	loop?: boolean;
	/** Liquid-glass surface vs. a solid panel. */
	glass?: boolean;
	placeholder?: string;
	/**
	 * Position as a viewport-fixed overlay instead of filling the nearest
	 * positioned ancestor. Default (false) keeps the preview scoped to its frame;
	 * the app shell passes true to use the palette as global chrome.
	 */
	fixed?: boolean;
	/**
	 * Value (an item's label) to highlight when the palette opens. `undefined`
	 * keeps cmdk's default (auto-select the first item — used by the standalone
	 * demo); `null` highlights nothing; a string highlights that item.
	 */
	initialValue?: string | null;
}

// Non-empty sentinel that matches no item label, so cmdk highlights nothing.
// Must be non-empty: an empty root value makes cmdk auto-select the first item.
const NO_SELECTION = "__none__";

export function isMacPlatform(): boolean {
	return /mac/i.test(navigator.platform || navigator.userAgent);
}

export function isEditableTarget(): boolean {
	const el = document.activeElement as HTMLElement | null;
	if (!el) return false;
	const tag = el.tagName;
	return (
		tag === "INPUT" ||
		tag === "TEXTAREA" ||
		tag === "SELECT" ||
		el.isContentEditable
	);
}

function matchesHotkey(event: KeyboardEvent, hotkey: Hotkey): boolean {
	if (hotkey === "/") {
		// Never hijack "/" while a field is focused (sidebar search, the palette's
		// own input, …) — let it type normally.
		if (isEditableTarget()) return false;
		return event.key === "/";
	}
	// "cmd+k" falls back to Ctrl on non-Apple platforms (⌘ has no equivalent
	// there), so the default binding works everywhere. "ctrl+k" stays strict.
	const mod =
		hotkey === "cmd+k"
			? event.metaKey || (!isMacPlatform() && event.ctrlKey)
			: event.ctrlKey;
	return mod && event.key.toLowerCase() === "k";
}

export default function CommandPalette({
	open,
	onOpenChange,
	groups,
	onSelect,
	onValueChange,
	onItemHover,
	hotkey = "cmd+k",
	loop = true,
	glass = false,
	placeholder = "Type a command or search…",
	fixed = false,
	initialValue,
}: CommandPaletteProps) {
	// Controlled highlight: cmdk left uncontrolled auto-selects the first item
	// (registry order → always "Threads"), ignoring the current route. Seed the
	// selection from the caller each time the palette opens instead.
	const [value, setValue] = useState("");
	// Seed synchronously *during render* on the open transition (React's
	// adjust-state-on-prop-change pattern), not in an effect: cmdk runs its
	// auto-select-first pass when items mount, which is before an effect fires —
	// an effect would let cmdk latch onto "Threads" first, then overwrite our seed
	// via its onValueChange. Setting it now means the root mounts already seeded,
	// so that pass is skipped. undefined → "" leaves cmdk's default (demo).
	const [wasOpen, setWasOpen] = useState(open);
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) {
			setValue(initialValue === undefined ? "" : (initialValue ?? NO_SELECTION));
		}
	}
	// Normalize to a stable string so a fresh array literal each render doesn't
	// churn the listener subscription.
	const hotkeyKey = Array.isArray(hotkey) ? hotkey.join(",") : hotkey;
	useEffect(() => {
		// Empty hotkey list → bind no opener (an instance can "stand down" from the
		// global hotkey), but keep Escape-to-close either way.
		const hotkeys = hotkeyKey ? (hotkeyKey.split(",") as Hotkey[]) : [];
		const onKey = (event: KeyboardEvent) => {
			if (hotkeys.length && hotkeys.some((h) => matchesHotkey(event, h))) {
				event.preventDefault();
				onOpenChange(!open);
			} else if (event.key === "Escape" && open) {
				onOpenChange(false);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, hotkeyKey, onOpenChange]);

	// While the fixed (shell) palette is open it covers the viewport, so freeze
	// page scroll underneath it. The scoped preview instance (fixed=false) lives
	// inside its own frame and must leave the page alone.
	useEffect(() => {
		if (!fixed || !open) return;
		const { body, documentElement } = document;
		const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
		const prevOverflow = body.style.overflow;
		const prevPaddingRight = body.style.paddingRight;
		body.style.overflow = "hidden";
		// Pad by the reclaimed scrollbar width so hiding it doesn't reflow the page.
		if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
		return () => {
			body.style.overflow = prevOverflow;
			body.style.paddingRight = prevPaddingRight;
		};
	}, [fixed, open]);

	const runCommand = (command: CommandDef) => {
		onSelect?.(command);
		command.onRun?.();
		onOpenChange(false);
	};

	const renderItem = (
		command: CommandDef,
		pinned = false,
		lastPinned = false,
	) => {
		const Icon = command.icon;
		// The active row keeps accent text in every state, so it stays legible as
		// "where you are" even while the cursor sits on it. A normal row only turns
		// bright under the cursor. Both keep the same selected background — the
		// two marks stack instead of replacing one another.
		const tone = command.active
			? "text-accent before:absolute before:left-0 before:top-1/2 before:h-4 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-accent"
			: "text-ink-dim data-[selected=true]:text-ink";
		return (
			<Command.Item
				key={command.id}
				value={command.label}
				keywords={command.keywords}
				onSelect={() => runCommand(command)}
				onMouseEnter={() => onItemHover?.(command)}
				forceMount={pinned || undefined}
				className={
					pinned
						? // Pinned items grow to fill the footer row. Earlier items refuse to
							// shrink so that only the last one truncates when space runs out.
							`relative flex grow cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 font-sans text-xs data-[selected=true]:bg-accent/15 ${tone} ${lastPinned ? "min-w-0" : "shrink-0"}`
						: `relative flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 font-sans text-sm data-[selected=true]:bg-accent/15 ${tone}`
				}
			>
				{Icon && (
					<Icon
						className={
							pinned
								? `h-3.5 w-3.5 shrink-0 ${command.active ? "text-accent" : "text-ink-mute"}`
								: `h-4 w-4 ${command.active ? "text-accent" : "text-ink-mute"}`
						}
					/>
				)}
				<span
					className={
						pinned
							? lastPinned
								? "min-w-0 truncate"
								: "whitespace-nowrap"
							: "flex-1"
					}
				>
					{command.label}
				</span>
				{command.hint && (
					// Split on whitespace so a chord ("G C", "⌘ C") reads as one chip per
					// key instead of overflowing a single fixed-size box.
					<span className="flex shrink-0 items-center gap-1">
						{command.hint.split(/\s+/).map((key, index) => (
							<kbd
								key={`${key}-${index}`}
								className={`inline-flex h-5 min-w-5 items-center justify-center rounded border border-hairline px-1 font-mono text-[10px] leading-none ${pinned ? "text-current" : "text-ink-mute"}`}
							>
								{key}
							</kbd>
						))}
					</span>
				)}
			</Command.Item>
		);
	};

	const scrollGroups = groups.filter((group) => !group.pinned);
	const pinnedGroups = groups.filter((group) => group.pinned);

	// Typing re-filters the list; snap the scroll region back to the top so the
	// best matches aren't hidden below a stale scroll offset.
	const listRef = useRef<HTMLDivElement>(null);

	// A seeded selection can sit far below the fold. cmdk scrolls it in on mount,
	// but only `block: "nearest"` — the row lands flush against an edge with no
	// neighbours visible. Re-center it, same treatment as the sidebar's active
	// entry. Deferred a macrotask: cmdk only marks the row `aria-selected` on a
	// later commit (item registration → store emit → re-render), so an effect
	// running on the open commit would find nothing selected yet.
	useEffect(() => {
		if (!open || !initialValue) return;
		const timer = setTimeout(() => {
			listRef.current
				?.querySelector('[aria-selected="true"]')
				?.scrollIntoView({ block: "center" });
		}, 0);
		return () => clearTimeout(timer);
	}, [open, initialValue]);

	const surface = glass
		? "border-white/15 bg-white/10 backdrop-blur-xl"
		: "border-hairline bg-panel";

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					className={`${fixed ? "fixed" : "absolute"} inset-0 z-50 flex items-start justify-center pt-[12%]`}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.15 }}
				>
					<button
						aria-label="Close command palette"
						onClick={() => onOpenChange(false)}
						className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
					/>
					<motion.div
						initial={{ opacity: 0, scale: 0.97, y: -8 }}
						animate={{ opacity: 1, scale: 1, y: 0 }}
						exit={{ opacity: 0, scale: 0.97, y: -8 }}
						transition={{ duration: 0.16, ease: "easeOut" }}
						className={`relative z-10 w-full max-w-xl overflow-hidden rounded-xl border shadow-2xl ${surface}`}
					>
						{glass && (
							<div className="pointer-events-none absolute inset-0 bg-linear-to-b from-white/12 to-transparent" />
						)}
						<Command
							value={value}
							onValueChange={setValue}
							// cmdk keeps the last pointer-hovered item selected (it doubles as
							// the keyboard-active row), so the highlight lingers after the cursor
							// leaves. Clear it on exit — arrow keys re-enter from the top.
							onMouseLeave={() => setValue(NO_SELECTION)}
							loop={loop}
							className="relative"
						>
							<div className="border-b border-hairline/60 px-3">
								<Command.Input
									autoFocus
									placeholder={placeholder}
									onValueChange={(value) => {
										onValueChange?.(value);
										listRef.current?.scrollTo({ top: 0 });
									}}
									className="h-12 w-full bg-transparent font-sans text-sm text-ink outline-none placeholder:text-ink-mute"
								/>
							</div>
							<AutoMaskVertical ref={listRef} className="max-h-80">
								<Command.List className="overflow-y-visible p-2">
									<Command.Empty className="px-3 py-6 text-center font-mono text-xs text-ink-mute">
										No results.
									</Command.Empty>
									{scrollGroups.map((group) => (
										<Command.Group
											key={group.id}
											heading={group.heading}
											className="**:[[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-display [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-ink-mute"
										>
											{group.commands.map((command) => renderItem(command))}
										</Command.Group>
									))}
								</Command.List>
							</AutoMaskVertical>
							{pinnedGroups.length > 0 && (
								<div className="flex w-full items-center gap-1 overflow-hidden border-t border-hairline/60 p-2">
									{/* `contents` erases the group wrappers from layout so every
									    pinned item across all groups shares one flex row. */}
									{pinnedGroups.map((group, groupIndex) => (
										<Command.Group
											key={group.id}
											forceMount
											className="contents [&_[cmdk-group-items]]:contents"
										>
											{group.commands.map((command, commandIndex) =>
												renderItem(
													command,
													true,
													groupIndex === pinnedGroups.length - 1 &&
														commandIndex === group.commands.length - 1,
												),
											)}
										</Command.Group>
									))}
								</div>
							)}
						</Command>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
