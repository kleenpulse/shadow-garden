// Subtitle for the /favorites header. Favorites live in this browser
// (localStorage) — there are no accounts to sync them to.
export default function FavoritesSubtitle() {
  return (
    <p className="mt-3 max-w-xl font-sans text-sm text-ink-dim">
      The components you&rsquo;ve pinned, saved in this browser.
    </p>
  );
}
