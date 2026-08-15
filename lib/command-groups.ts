import type { ComponentType } from "react";
import {
	Heart,
	Layers,
	Type,
	Sparkles,
	Command as CommandIcon,
	SunMoon,
	Link2,
	LayoutGrid,
} from "lucide-react";
import CookBookIcon from "@/components/icons/cook-book";
import { getEntry } from "@/lib/registry";
import type { Category, ComponentEntry } from "@/lib/registry/types";
import type { CommandGroupDef } from "@/components/registry/command-palette/command-palette";

const CATEGORY_ICON: Record<Category, ComponentType<{ className?: string }>> = {
	Backgrounds: Layers,
	"Text Animations": Type,
	"Micro-interactions": Sparkles,
	"Power-User Systems": CommandIcon,
};

/** The side effects the palette can trigger; supplied by the shell wrapper. */
export interface CommandActions {
	navigate: (href: string) => void;
	toggleTheme: () => void;
	copyLink: () => void;
	toggleFavorite: (slug: string) => void;
}

/**
 * Display copy for the palette's own chrome — group headings, the five static
 * action labels, and the favorite/unfavorite pair. Supplied by the caller
 * (CommandMenu, a client component) rather than imported here, so this module
 * stays framework-free and translation-agnostic.
 *
 * `keywordAliases` are localized search aliases APPENDED to the English
 * keywords already hardcoded below — the English keywords are never replaced
 * (§ commands namespace hard rule: keep every English keyword).
 */
export interface CommandLabels {
	headings: {
		favorites: string;
		components: string;
		actions: string;
	};
	actions: {
		catalog: string;
		favoritesPage: string;
		cookbook: string;
		theme: string;
		copyLink: string;
	};
	/** Favorite/Unfavorite: current-component action label. */
	favoriteCurrent: (favorited: boolean, name: string) => string;
	keywordAliases?: {
		catalog?: string[];
		favoritesPage?: string[];
		cookbook?: string[];
		theme?: string[];
		copyLink?: string[];
		favoriteCurrent?: string[];
	};
}

/** Slug of the component detail route currently open, if any. */
export function currentComponentSlug(pathname: string): string | undefined {
	const match = pathname.match(/^\/components\/([^/]+)$/);
	const slug = match?.[1];
	return slug && getEntry(slug) ? slug : undefined;
}

/**
 * Derive the palette's groups from the registry — Favorites (jump), Components
 * (jump), and Actions (theme / copy / favorite-current / page nav).
 */
export function buildCommandGroups(
	entries: ComponentEntry[],
	favoriteSlugs: string[],
	pathname: string,
	actions: CommandActions,
	labels: CommandLabels,
): CommandGroupDef[] {
	const groups: CommandGroupDef[] = [];

	// Mark the component you're already looking at wherever it appears — the
	// Components list and its Favorites twin are the same destination, so both
	// carry the "you are here" mark.
	const openSlug = currentComponentSlug(pathname);

	const favEntries = favoriteSlugs
		.map((slug) => getEntry(slug))
		.filter((entry): entry is ComponentEntry => Boolean(entry));

	if (favEntries.length > 0) {
		groups.push({
			id: "favorites",
			heading: labels.headings.favorites,
			commands: favEntries.map((entry) => ({
				id: `fav:${entry.slug}`,
				label: entry.name,
				icon: Heart,
				keywords: [entry.category, "favorite", "saved"],
				active: entry.slug === openSlug,
				onRun: () => actions.navigate(`/components/${entry.slug}`),
			})),
		});
	}

	groups.push({
		id: "components",
		heading: labels.headings.components,
		commands: entries.map((entry) => ({
			id: `nav:${entry.slug}`,
			label: entry.name,
			icon: CATEGORY_ICON[entry.category],
			keywords: [entry.category],
			active: entry.slug === openSlug,
			onRun: () => actions.navigate(`/components/${entry.slug}`),
		})),
	});

	const actionCommands: CommandGroupDef["commands"] = [
		{
			id: "action:catalog",
			label: labels.actions.catalog,
			icon: LayoutGrid,
			keywords: [
				"catalog",
				"components",
				"browse",
				"all",
				...(labels.keywordAliases?.catalog ?? []),
			],
			active: pathname === "/components",
			onRun: () => actions.navigate("/components"),
		},
		{
			id: "action:favorites-page",
			label: labels.actions.favoritesPage,
			icon: Heart,
			keywords: [
				"favorites",
				"saved",
				"collection",
				...(labels.keywordAliases?.favoritesPage ?? []),
			],
			active: pathname === "/favorites",
			onRun: () => actions.navigate("/favorites"),
		},
		{
			id: "action:cookbook",
			label: labels.actions.cookbook,
			icon: CookBookIcon,
			keywords: [
				"cookbook",
				"cook book",
				"glossary",
				"terms",
				"reference",
				"naming",
				...(labels.keywordAliases?.cookbook ?? []),
			],
			active: pathname === "/cookbook",
			onRun: () => actions.navigate("/cookbook"),
		},
		{
			id: "action:theme",
			label: labels.actions.theme,
			icon: SunMoon,
			keywords: [
				"dark",
				"light",
				"mode",
				"theme",
				...(labels.keywordAliases?.theme ?? []),
			],
			onRun: actions.toggleTheme,
		},
		{
			id: "action:copy",
			label: labels.actions.copyLink,
			icon: Link2,
			keywords: [
				"share",
				"url",
				"link",
				"copy",
				...(labels.keywordAliases?.copyLink ?? []),
			],
			onRun: actions.copyLink,
		},
	];

	if (openSlug) {
		const entry = getEntry(openSlug)!;
		const isFav = favoriteSlugs.includes(openSlug);
		actionCommands.push({
			id: "action:favorite-current",
			label: labels.favoriteCurrent(isFav, entry.name),
			icon: Heart,
			keywords: [
				"favorite",
				"save",
				"bookmark",
				"toggle",
				entry.name,
				...(labels.keywordAliases?.favoriteCurrent ?? []),
			],

			onRun: () => actions.toggleFavorite(openSlug),
		});
	}

	groups.push({
		id: "actions",
		heading: labels.headings.actions,
		commands: actionCommands,
		pinned: true,
	});

	return groups;
}
