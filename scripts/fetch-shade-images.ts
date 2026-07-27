/**
 * Populate public/shades/ with the Seven Shadows character art used by the
 * Unfold demo (components/registry/unfold/UnfoldPreview.tsx).
 *
 *   bun scripts/fetch-shade-images.ts
 *
 * Source: the-eminence-in-shadow.fandom.com, served off the Wikia CDN. These
 * are character renders from "The Eminence in the Shadow" and remain the
 * property of their rights holders — they are demo dressing for the Unfold
 * preview, not part of the licensed component source. Swapping SOURCES for
 * your own artwork changes nothing else: Unfold treats `image` as an optional
 * field and renders identically without it.
 *
 * The CDN content-negotiates and answers any path with WebP regardless of the
 * extension you ask for, so the destinations are `.webp` to match what actually
 * lands on disk.
 *
 * Picking these: game key art only — no light-novel plates. The "Member" cards
 * are one commissioned series, so six of the seven share a night-and-moon
 * composition and a violet palette that happens to land on Shadow Garden's own
 * accent. Eta has no seventh-member card; her splash art is from the same run
 * and matches. Consistency across the row matters more here than any single
 * image, which is why the off-palette alternatives (Eta's beach event art) were
 * passed over.
 *
 * These are 16:9 plates and Unfold crops them hard to a face, so they are
 * fetched far wider than a slat ever renders — the zoom, not the layout, is
 * what sets the resolution needed. Each one also needs an `imagePosition` in
 * UnfoldPreview.tsx, since the subject sits somewhere different in every frame.
 *
 * Failures are reported, not fatal — a missing file just means that slat falls
 * back to the plain graphite panel.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const CDN = "https://static.wikia.nocookie.net/to-be-a-power-in-the-shadows/images";

// The open slat magnifies its source several times over to reach the face, so
// this is sized for the zoom rather than the slat. Downscales the oversized
// plates (Gamma's is 7113px) and leaves the 1920px ones untouched.
const WIDTH = 1600;

// dest (under public/) → CDN path. The Shadow Garden "Member" card series,
// plus Eta's splash art in place of the card she never got.
const SOURCES: Record<string, string> = {
	"shades/alpha.webp": `${CDN}/e/e6/Alpha-First_Member-Game.jpg`,
	"shades/beta.webp": `${CDN}/5/59/Beta-Second_Member-Game.png`,
	"shades/gamma.webp": `${CDN}/a/af/Gamma_third_member_game.png`,
	"shades/delta.webp": `${CDN}/e/e3/Delta_fourth_member_game.jpg`,
	"shades/epsilon.webp": `${CDN}/c/cd/Epsilon-The_Fifth_Member-game.png`,
	"shades/zeta.webp": `${CDN}/2/2c/Zeta-Sixth_Member-game.png`,
	"shades/eta.webp": `${CDN}/3/38/Eta_Splash_Art_Game.png`,
};

const publicDir = join(process.cwd(), "public");

let ok = 0;
let failed = 0;

await Promise.all(
	Object.entries(SOURCES).map(async ([dest, url]) => {
		try {
			const res = await fetch(`${url}/revision/latest/scale-to-width-down/${WIDTH}`, {
				headers: { "User-Agent": "shadow-garden-asset-fetch" },
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const bytes = new Uint8Array(await res.arrayBuffer());
			const out = join(publicDir, dest);
			await mkdir(dirname(out), { recursive: true });
			await writeFile(out, bytes);
			console.log(`✓ ${dest} (${(bytes.length / 1024).toFixed(0)}KB)`);
			ok++;
		} catch (err) {
			console.warn(`✗ ${dest} — ${(err as Error).message}`);
			failed++;
		}
	}),
);

console.log(`\nDone: ${ok} fetched, ${failed} failed.`);
if (failed > 0) {
	console.log("Slats without an image render as plain panels — nothing breaks.");
}
