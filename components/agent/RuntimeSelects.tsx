"use client";

import { useEffect, useReducer, useState } from "react";
import { createPortal } from "react-dom";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

// The agent runtime (public/agent/runtime) builds its own DOM and is vendored
// unchanged, so its <select>s can't be swapped in its code. Instead each one
// stays in the DOM, hidden (assistant.css, [data-mg-enhanced]), and the bench's
// Select renders beside it: a choice writes the native value and fires the
// native input/change events the runtime listens for. The runtime keeps reading
// and writing its own control; this only replaces what people see and touch.

// Radix reserves "" for "no value", and the runtime uses it for "Custom / unsaved".
const EMPTY = "__mg-empty__";

const toItem = (value: string) => (value === "" ? EMPTY : value);
const fromItem = (value: string) => (value === EMPTY ? "" : value);

/** The select's visible label, without the option text a wrapping <label> holds. */
function labelOf(select: HTMLSelectElement): string | undefined {
	const own = select.getAttribute("aria-label");
	if (own) return own;
	const label = select.labels?.[0];
	if (!label) return undefined;
	const clone = label.cloneNode(true) as HTMLElement;
	clone.querySelectorAll("select, [data-mg-select-host]").forEach((el) => el.remove());
	return clone.textContent?.trim() || undefined;
}

/** Write the runtime's own control and fire the events it listens for. */
function choose(select: HTMLSelectElement, value: string) {
	select.value = fromItem(value);
	select.dispatchEvent(new Event("input", { bubbles: true }));
	select.dispatchEvent(new Event("change", { bubbles: true }));
}

function BenchSelect({ select }: { select: HTMLSelectElement }) {
	const [, refresh] = useReducer((n: number) => n + 1, 0);

	useEffect(() => {
		// Options come and go (saved setups), and the runtime also sets .value
		// directly, which fires no event and no mutation, so a cheap poll catches it.
		const observer = new MutationObserver(refresh);
		observer.observe(select, { childList: true, subtree: true, attributes: true, characterData: true });
		select.addEventListener("change", refresh);
		let last = select.value;
		const poll = window.setInterval(() => {
			if (select.value !== last) {
				last = select.value;
				refresh();
			}
		}, 400);
		return () => {
			observer.disconnect();
			select.removeEventListener("change", refresh);
			window.clearInterval(poll);
		};
	}, [select]);

	const options = Array.from(select.options);
	return (
		<Select
			value={toItem(select.value)}
			disabled={select.disabled}
			onValueChange={(value) => {
				choose(select, value);
				refresh();
			}}
		>
			<SelectTrigger
				aria-label={labelOf(select)}
				className="mt-1 border-0 py-2 text-[12px] focus-visible:ring-1 focus-visible:ring-accent"
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent className="z-60 border-0 bg-raised">
				{options.map((option) => (
					<SelectItem
						key={toItem(option.value)}
						value={toItem(option.value)}
						disabled={option.disabled}
					>
						{option.text}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

interface Enhanced {
	select: HTMLSelectElement;
	host: HTMLElement;
	key: string;
}

export default function RuntimeSelects({ rootId }: { rootId: string }) {
	const [enhanced, setEnhanced] = useState<Enhanced[]>([]);

	useEffect(() => {
		const root = document.getElementById(rootId);
		if (!root) return;
		const known = new Map<HTMLSelectElement, Enhanced>();
		let count = 0;

		const scan = () => {
			let changed = false;
			for (const select of root.querySelectorAll("select")) {
				// Inside a <form>, Radix renders its own hidden native <select> for
				// form submission. Enhancing that one would nest Selects without end.
				if (select.multiple || known.has(select) || select.closest("[data-mg-select-host]")) continue;
				const host = document.createElement("span");
				host.setAttribute("data-mg-select-host", "");
				host.style.display = "block";
				select.after(host);
				select.setAttribute("data-mg-enhanced", "");
				select.setAttribute("aria-hidden", "true");
				select.tabIndex = -1;
				known.set(select, { select, host, key: `mg-select-${count++}` });
				changed = true;
			}
			for (const [select, entry] of known) {
				if (!select.isConnected) {
					entry.host.remove();
					known.delete(select);
					changed = true;
				}
			}
			if (changed) setEnhanced([...known.values()]);
		};

		scan();
		// Chat forms can add selects at any time; the scan is one querySelectorAll.
		const observer = new MutationObserver(scan);
		observer.observe(root, { childList: true, subtree: true });
		return () => {
			observer.disconnect();
			for (const { select, host } of known.values()) {
				host.remove();
				select.removeAttribute("data-mg-enhanced");
				select.removeAttribute("aria-hidden");
				select.removeAttribute("tabindex");
			}
		};
	}, [rootId]);

	return enhanced.map(({ select, host, key }) =>
		createPortal(<BenchSelect select={select} />, host, key),
	);
}
