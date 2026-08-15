"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import type { Range, Suggestion } from "@/lib/cookbook-search";
import { useDataCopy } from "@/lib/i18n/data-copy";
import { cn } from "@/lib/utils";

// Mirrors scripts/i18n/gen-catalog.ts's slugify exactly — it's the key the
// cookbookSections.<slug>.title catalog is generated under.
function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/&/g, "and")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * The glossary's filter, as a real combobox.
 *
 * Presentation and interaction only — every ranked suggestion arrives as a prop.
 * Typing never filters the page: it moves `query`, which moves the popup. The
 * list behind it changes only on a commit — a picked suggestion or Enter — so a
 * suggestion click has a still page to scroll into (§V27).
 *
 * This is the repo's first `role="combobox"`, so the ARIA here is the reference
 * implementation rather than a copy of one: input owns `aria-activedescendant`,
 * the listbox never takes focus, and the visual cursor and the announced cursor
 * are the same piece of state (a combobox where they can disagree is a combobox
 * that lies to a screen reader).
 */

/** Paint the characters the query actually matched. */
function Marked({ text, ranges }: { text: string; ranges: readonly Range[] }) {
	if (ranges.length === 0) return <>{text}</>;
	const out: React.ReactNode[] = [];
	let at = 0;
	ranges.forEach(([start, end], i) => {
		if (start > at) out.push(text.slice(at, start));
		out.push(
			// Not <mark> — the UA default is a yellow that has no business on this
			// bench, and overriding it costs more than styling a span.
			<span key={i} className="rounded-[2px] bg-accent/20 text-ink">
				{text.slice(start, end)}
			</span>,
		);
		at = end;
	});
	if (at < text.length) out.push(text.slice(at));
	return <>{out}</>;
}

export default function CookbookFilter({
	query,
	onQueryChange,
	onCommitQuery,
	suggestions,
	onSelect,
	className,
}: {
	query: string;
	onQueryChange: (value: string) => void;
	/** Enter with nothing to pick — apply the raw text as the list filter. */
	onCommitQuery: (value: string) => void;
	suggestions: Suggestion[];
	onSelect: (suggestion: Suggestion) => void;
	className?: string;
}) {
	const t = useTranslations("chrome.cookbookFilter");
	const copy = useDataCopy();
	// Kind headings, keyed by the closed Suggestion["kind"] union.
	const headings: Record<Suggestion["kind"], string> = {
		term: t("headings.term"),
		component: t("headings.component"),
		section: t("headings.section"),
	};

	const [open, setOpen] = useState(false);
	// -1 = nothing selected. Distinct from 0 on purpose: a fresh popup must not
	// pre-highlight a row, or Enter commits something the user never looked at.
	const [active, setActive] = useState(-1);

	const wrapRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLUListElement>(null);


	const uid = useId();
	const listboxId = `sg-cookbook-listbox-${uid}`;
	const optionId = (i: number) => `sg-cookbook-option-${uid}-${i}`;

	const visible = open && suggestions.length > 0;

	const close = () => {
		setOpen(false);
		setActive(-1);
	};

	const commit = (suggestion: Suggestion) => {
		close();
		onSelect(suggestion);
	};

	// A new result set invalidates the cursor. Resetting to -1 rather than 0 keeps
	// Enter meaning "the best match" instead of "whatever row happens to be first
	// after the list reshuffled under me".
	//
	// Adjusted during render, not in an effect: an effect would paint one frame
	// with the stale cursor highlighting a row that has already been replaced.
	// Same prev-value pattern the command palette uses for its open transition.
	const [seenSuggestions, setSeenSuggestions] = useState(suggestions);
	if (seenSuggestions !== suggestions) {
		setSeenSuggestions(suggestions);
		setActive(-1);
	}

	useEffect(() => {
		listRef.current?.scrollTo({ top: 0 });
	}, [suggestions]);

	// Keep the cursor inside the popup without ever scrolling the page — same
	// manual scrollTop arithmetic the section rail uses, for the same reason:
	// scrollIntoView on a nested scroller happily walks up to the document.
	useEffect(() => {
		const list = listRef.current;
		if (!list || active < 0) return;
		const row = list.querySelector<HTMLElement>(`[data-index="${active}"]`);
		if (!row) return;
		const listBox = list.getBoundingClientRect();
		const rowBox = row.getBoundingClientRect();
		if (rowBox.top < listBox.top) {
			list.scrollTop += rowBox.top - listBox.top - 4;
		} else if (rowBox.bottom > listBox.bottom) {
			list.scrollTop += rowBox.bottom - listBox.bottom + 4;
		}
	}, [active]);

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		// An IME candidate is committed with Enter. Without this guard, picking a
		// Japanese candidate would also fire a suggestion the user never chose.
		if (event.nativeEvent.isComposing || event.keyCode === 229) return;

		const count = suggestions.length;

		switch (event.key) {
			case "ArrowDown":
				event.preventDefault();
				if (!open) {
					setOpen(true);
					if (event.altKey) return; // Alt+Down opens without moving (APG).
				}
				if (count === 0) return;
				setActive((i) => (i + 1) % count);
				return;
			case "ArrowUp":
				event.preventDefault();
				if (!open) {
					setOpen(true);
					return;
				}
				if (count === 0) return;
				setActive((i) => (i <= 0 ? count - 1 : i - 1));
				return;
			case "Enter":
				event.preventDefault();
				if (visible) {
					// No cursor yet → the top-ranked row. Type-and-Enter should do the
					// obvious thing rather than nothing.
					commit(suggestions[active >= 0 ? active : 0]);
					return;
				}
				// Nothing to pick, so Enter means the literal text. This is the only
				// route to the empty state and to description-only matches, which
				// never earn a suggestion row.
				onCommitQuery(query);
				return;
			case "Escape":
				// Two-stage: dismiss the popup first, clear the query only if it is
				// already dismissed. One Escape should never destroy typed input.
				if (visible) close();
				else if (query) onQueryChange("");
				return;
			case "Tab":
				// Closes but never commits — moving focus is not a choice (APG).
				close();
				return;
			default:
				return;
		}
	};

	return (
		<div
			ref={wrapRef}
			className={cn("relative w-full sm:max-w-xs", className)}
			onBlur={(event) => {
				// relatedTarget is null when focus leaves for the page body. Rows
				// suppress focus loss entirely (see onMouseDown below), so reaching
				// here always means the user is done with the popup.
				if (!wrapRef.current?.contains(event.relatedTarget as Node | null)) {
					close();
				}
			}}
		>
			<input
				ref={inputRef}
				// Deliberately `text`, not `search`: the native search input paints a
				// UA clear button that swallows Escape and differs per engine. Ours is
				// below, and it behaves the same everywhere.
				type="text"
				role="combobox"
				value={query}
				onChange={(event) => {
					const next = event.target.value;
					onQueryChange(next);
					setOpen(next.trim().length > 0);
				}}
				onKeyDown={onKeyDown}
				onFocus={() => {
					if (query.trim().length > 0) setOpen(true);
				}}
				placeholder={t("placeholder")}
				aria-label={t("filterLabel")}
				aria-expanded={visible}
				aria-controls={visible ? listboxId : undefined}
				aria-autocomplete="list"
				aria-activedescendant={
					visible && active >= 0 ? optionId(active) : undefined
				}
				autoComplete="off"
				autoCorrect="off"
				spellCheck={false}
				inputMode="search"
				enterKeyHint="go"
				className="w-full rounded-md border border-hairline bg-panel py-2 pl-3 pr-8 font-mono text-xs text-ink outline-none placeholder:text-ink-mute focus-visible:border-accent"
			/>

			{query.length > 0 && (
				<button
					type="button"
					// Suppress the focus loss so the wrapper's onBlur can't close the
					// popup out from under the click that is still in flight.
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => {
						onQueryChange("");
						close();
						inputRef.current?.focus();
					}}
					aria-label={t("clearLabel")}
					className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-1 text-ink-mute transition-colors hover:text-ink"
				>
					<svg
						viewBox="0 0 16 16"
						aria-hidden
						className="size-3"
						fill="none"
						stroke="currentColor"
						strokeWidth={1.75}
						strokeLinecap="round"
					>
						<path d="M4 4l8 8M12 4l-8 8" />
					</svg>
				</button>
			)}

			{visible && (
				<ul
					ref={listRef}
					id={listboxId}
					role="listbox"
					aria-label={t("suggestionsLabel")}
					// z-10, not higher: the shell's TopBar is sticky at z-20, and a
					// popup that paints over it while the page is scrolled reads broken.
					onMouseDown={(event) => event.preventDefault()}
					className="absolute left-0 right-0 top-full z-10 mt-1 max-h-65 sm:max-h-72 overflow-y-auto scrollbar-thin rounded-md border border-hairline bg-panel p-1 shadow-lg dark:shadow-2xl shadow-black/25 dark:shadow-black/60"
				>
					{suggestions.map((suggestion, i) => {
						const isActive = i === active;
						const heading =
							i === 0 || suggestions[i - 1].kind !== suggestion.kind
								? headings[suggestion.kind]
								: null;

						return (
							<li
								key={`${suggestion.kind}:${suggestion.label}`}
								role="presentation"
							>
								{heading && (
									<p
										role="presentation"
										className="px-2 pb-1 pt-1.5 font-display text-[10px] uppercase tracking-widest text-ink-mute"
									>
										{heading}
									</p>
								)}
								<div
									id={optionId(i)}
									role="option"
									aria-selected={isActive}
									data-index={i}
									// pointermove, not pointerenter: scrolling the list under a
									// stationary cursor would otherwise steal the keyboard cursor.
									onPointerMove={() => setActive(i)}
									onClick={() => commit(suggestion)}
									className={cn(
										"flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-1.5 font-mono text-xs transition-colors",
										isActive ? "bg-accent/15 text-ink" : "text-ink-dim",
									)}
								>
									<span className="min-w-0 flex-1 truncate">
										<Marked
											text={suggestion.label}
											ranges={suggestion.ranges}
										/>
									</span>

									{suggestion.kind === "term" && (
										<span className="shrink-0 font-display text-[9px] uppercase tracking-[0.16em] text-ink-mute">
											{copy(
												`cookbookSections.${slugify(suggestion.sectionTitle)}.title`,
												suggestion.sectionTitle,
											)}
										</span>
									)}
									{suggestion.kind === "component" && (
										<span className="shrink-0 font-display text-[9px] uppercase tracking-[0.16em] text-ink-mute">
											{t("demoCount", { count: suggestion.demos })}
										</span>
									)}
									{suggestion.kind === "section" && (
										<span className="shrink-0 font-display text-[9px] uppercase tracking-[0.16em] text-ink-mute">
											{t("sectionTermCount", { count: suggestion.count })}
										</span>
									)}
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
