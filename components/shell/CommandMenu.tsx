"use client";

import { useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";
// Patched router: imperative navigations drive the route progress bar too.
import { useRouter } from "@bprogress/next/app";
import { toast } from "sonner";
import CommandPalette, {
  isEditableTarget,
  type Hotkey,
} from "@/components/registry/command-palette/command-palette";
import { registry, getEntry } from "@/lib/registry";
import { buildCommandGroups, currentComponentSlug } from "@/lib/command-groups";
import { useUIStore } from "@/lib/store";
import { useFavoritesStore } from "@/lib/favorites-store";
import { useThemeTransition } from "@/hooks/use-theme-transition";

// ⌘K (mac), Ctrl+K (win/linux), and "/" all open the palette. Module constant so
// the array identity stays stable across renders.
const HOTKEYS: Hotkey[] = ["cmd+k", "ctrl+k", "/"];

/**
 * The real shell command palette: dogfoods the showcased CommandPalette product
 * component, fed by registry-derived groups and wired to app actions. Mounted
 * once in the shell layout.
 */
export default function CommandMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const paletteOpen = useUIStore((state) => state.paletteOpen);
  const setPaletteOpen = useUIStore((state) => state.setPaletteOpen);
  const favoriteSlugs = useFavoritesStore((state) => state.slugs);
  const toggleFav = useFavoritesStore((state) => state.toggle);
  const { resolvedTheme, pickTheme } = useThemeTransition();

  // On the palette's own demo page, yield the global hotkey to the live preview
  // instance so ⌘K / "/" opens one palette (the demo), not two stacked overlays.
  const currentSlug = currentComponentSlug(pathname);
  const onPalettePage = currentSlug === "command-palette";

  // Highlight the component you're viewing when the palette opens; on any other
  // route (catalog, favorites, …) highlight nothing (null) rather than the first
  // item. The seed is the item's label, which is how cmdk matches selection.
  const initialValue = currentSlug ? (getEntry(currentSlug)?.name ?? null) : null;

  const toggleFavorite = useCallback(
    (slug: string) => {
      // Read the pre-toggle status from the store to avoid a stale closure.
      const wasFav = useFavoritesStore.getState().has(slug);
      toggleFav(slug);
      const name = getEntry(slug)?.name ?? "component";
      if (wasFav) toast(`Removed ${name} from favorites`);
      else toast.success(`Added ${name} to favorites`);
    },
    [toggleFav],
  );

  const groups = buildCommandGroups(registry, favoriteSlugs, pathname, {
    navigate: (href) => router.push(href),
    toggleTheme: () => pickTheme(resolvedTheme === "light" ? "dark" : "light"),
    copyLink: () => {
      if (!navigator.clipboard) {
        toast("Clipboard unavailable");
        return;
      }
      navigator.clipboard.writeText(window.location.href).then(
        () => toast.success("Link copied"),
        () => toast("Couldn't copy link"),
      );
    },
    toggleFavorite,
  });

  // The app owns ⌘K / Ctrl+K / "/", so always cancel the browser defaults for
  // them (Chrome's Ctrl+K omnibox search, Firefox's "/" quick-find) — regardless
  // of which palette instance opens on a given page. Runs in the capture phase so
  // the browser default is suppressed even where the palette listener stands down
  // (e.g. the palette's own demo page). "/" is left alone while typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const modK =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slash = event.key === "/" && !isEditableTarget();
      if (modK || slash) event.preventDefault();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  // "F" favorites the component you're viewing — when the palette is closed and
  // you're not typing in a field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (paletteOpen) return;
      if (event.key.toLowerCase() !== "f") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      const slug = currentComponentSlug(pathname);
      if (!slug) return;
      event.preventDefault();
      toggleFavorite(slug);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, pathname, toggleFavorite]);

  return (
    <CommandPalette
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      groups={groups}
      hotkey={onPalettePage ? [] : HOTKEYS}
      initialValue={initialValue}
      fixed
      placeholder="Search components or run a command…"
    />
  );
}
