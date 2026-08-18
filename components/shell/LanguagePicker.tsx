"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown } from "lucide-react";
import { LOCALES } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/provider";

// Badge + code + caret trigger, small grid panel. Hand-rolled popover on
// purpose: the house has no shared popover primitive and the showcased
// command-palette component is overkill for six rows.
export default function LanguagePicker() {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const t = useTranslations("chrome.language");
	const { locale, setLocale } = useI18n();
	const active = LOCALES.find((l) => l.code === locale) ?? LOCALES[0];

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (e: PointerEvent) => {
			if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	return (
		<div ref={rootRef} className="relative">
			<button
				type="button"
				aria-label={t("changeLanguage")}
				aria-expanded={open}
				aria-haspopup="listbox"
				onClick={() => setOpen((v) => !v)}
				className="flex h-8 items-center gap-1.5 rounded-md border border-hairline bg-panel px-2 font-mono text-[11px] leading-none text-ink-dim transition-colors hover:border-accent-muted hover:text-accent focus-visible:text-accent focus-visible:outline-none"
			>
				<span className="text-ink-mute">{active.badge}</span>
				<span className="uppercase">{active.code}</span>
				<ChevronDown className="size-3 text-ink-mute" aria-hidden />
			</button>
			{open && (
				<div
					role="listbox"
					aria-label={t("label")}
					className="absolute end-0 top-full z-30 mt-1.5 w-56 rounded-lg border border-hairline bg-surface p-1.5 shadow-lg"
				>
					<p className="px-2 pb-1.5 pt-1 font-mono text-[10px] uppercase tracking-wide text-ink-mute">
						{t("label")}
					</p>
					<div className="grid grid-cols-2 gap-1">
						{LOCALES.map((l) => {
							const isActive = l.code === locale;
							return (
								<button
									key={l.code}
									type="button"
									role="option"
									aria-selected={isActive}
									onClick={() => {
										setLocale(l.code);
										setOpen(false);
									}}
									className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-start text-sm transition-colors hover:bg-panel ${
										isActive ? "bg-panel text-accent" : "text-ink-dim"
									}`}
								>
									<span className="grid size-6 shrink-0 place-items-center rounded border border-hairline font-mono text-[9px] text-ink-mute">
										{l.badge}
									</span>
									<span className="min-w-0 flex-1 truncate">
										{l.nativeName}
									</span>
									{isActive && (
										<Check className="size-3 shrink-0" aria-hidden />
									)}
								</button>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
