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
	BookMarked,
} from "lucide-react";
import { getEntry } from "@/lib/registry";
import type { Category, ComponentEntry } from "@/lib/registry/types";
import type { CommandGroupDef } from "@/components/registry/command-palette/CommandPalette";

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

/** Slug of the component detail route currently open, if any. */
export function currentComponentSlug(pathname: string): string | undefined {
	const match = pathname.match(/^\/components\/([^/]+)$/);
	const slug = match?.[1];
	return slug && getEntry(slug) ? slug : undefined;
}

/**
 * Derive the palette's groups from the registry — Favorites (jump), Components
 * (jump), and Actions (theme / copy / favorite-current / page nav). Mirrors the
 * ellum palette's "groups built from config" model, minus the app-specific
 * auth/billing gating.
 */
export function buildCommandGroups(
	entries: ComponentEntry[],
	favoriteSlugs: string[],
	pathname: string,
	actions: CommandActions,
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
			heading: "Favorites",
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
		heading: "Components",
		commands: entries.map((entry) => ({
			id: `nav:${entry.slug}`,
			label: entry.name,
			icon: CATEGORY_ICON[entry.category],
			keywords: [entry.category, entry.tier],
			active: entry.slug === openSlug,
			onRun: () => actions.navigate(`/components/${entry.slug}`),
		})),
	});

	const actionCommands: CommandGroupDef["commands"] = [
		{
			id: "action:catalog",
			label: "Catalog",
			icon: LayoutGrid,
			keywords: ["catalog", "components", "browse", "all"],
			active: pathname === "/components",
			onRun: () => actions.navigate("/components"),
		},
		{
			id: "action:favorites-page",
			label: "Favorites",
			icon: Heart,
			keywords: ["favorites", "saved", "collection"],
			active: pathname === "/favorites",
			onRun: () => actions.navigate("/favorites"),
		},
		{
			id: "action:philosophy",
			label: "Motion Philosophy",
			icon: BookMarked,
			keywords: ["philosophy", "glossary", "terms", "reference", "naming"],
			active: pathname === "/philosophy",
			onRun: () => actions.navigate("/philosophy"),
		},
		{
			id: "action:theme",
			label: "Theme",
			icon: SunMoon,
			keywords: ["dark", "light", "mode", "theme"],
			onRun: actions.toggleTheme,
		},
		{
			id: "action:copy",
			label: "Copy page link",
			icon: Link2,
			keywords: ["share", "url", "link", "copy"],
			onRun: actions.copyLink,
		},
	];

	if (openSlug) {
		const entry = getEntry(openSlug)!;
		const isFav = favoriteSlugs.includes(openSlug);
		actionCommands.push({
			id: "action:favorite-current",
			label: isFav ? `Unfavorite: ${entry.name}` : `Favorite: ${entry.name}`,
			icon: Heart,
			keywords: ["favorite", "save", "bookmark", "toggle", entry.name],

			onRun: () => actions.toggleFavorite(openSlug),
		});
	}

	groups.push({
		id: "actions",
		heading: "Actions",
		commands: actionCommands,
		pinned: true,
	});

	return groups;
}
