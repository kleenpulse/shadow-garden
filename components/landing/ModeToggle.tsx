"use client";

import { useRef, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { HERO_VARIANTS, type HeroVariant } from "@/lib/hero-variant";
import { cn } from "@/lib/utils";

// Active colour comes from the html attribute (the hero-scroll custom
// variant), which the pre-paint script stamps before hydration and the store
// keeps in step afterwards — so the first frame is right and there is one
// source of truth for the highlight. React owns only aria-checked, focus and
// the handlers. Hover is scoped to the unchecked radios: an unscoped hover
// would out-rank the attribute variant (:hover carries specificity, :where
// does not) and grey the active one under the pointer.
const MODE_CLASS: Record<HeroVariant, string> = {
	classic: "text-accent hero-scroll:text-ink-mute",
	scroll: "text-ink-mute hero-scroll:text-accent",
};

interface ModeToggleProps {
	value: HeroVariant;
	onChange: (next: HeroVariant) => void;
	className?: string;
}

export default function ModeToggle({ value, onChange, className }: ModeToggleProps) {
	const t = useTranslations("landing.hero");
	const refs = useRef<(HTMLButtonElement | null)[]>([]);
	// Literal-key calls: next-intl's typed t() rejects a union-typed key.
	const labels: Record<HeroVariant, string> = {
		classic: t("modeClassic"),
		scroll: t("modeScroll"),
	};

	// WAI-ARIA radio group: arrows move both selection and focus, wrapping.
	const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
		let next = index;
		if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % HERO_VARIANTS.length;
		else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
			next = (index - 1 + HERO_VARIANTS.length) % HERO_VARIANTS.length;
		else return;
		e.preventDefault();
		onChange(HERO_VARIANTS[next]);
		refs.current[next]?.focus();
	};

	return (
		<div
			role="radiogroup"
			aria-label={t("modeLabel")}
			className={cn("flex items-center gap-3", className)}
		>
			<span aria-hidden>{t("modeLabel")}</span>
			{HERO_VARIANTS.map((mode, i) => (
				<button
					key={mode}
					ref={(el) => {
						refs.current[i] = el;
					}}
					type="button"
					role="radio"
					aria-checked={value === mode}
					tabIndex={value === mode ? 0 : -1}
					onClick={() => onChange(mode)}
					onKeyDown={(e) => onKeyDown(e, i)}
					className={cn(
						"cursor-pointer rounded-sm transition-colors duration-150 aria-[checked=false]:hover:text-ink aria-[checked=false]:focus-visible:text-ink",
						MODE_CLASS[mode],
					)}
				>
					{labels[mode]}
				</button>
			))}
		</div>
	);
}
