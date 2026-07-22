/**
 * Populate public/audio/ with recorded instrument samples so the sampler
 * upgrades from its procedural fallback to real piano/strings.
 *
 *   bun scripts/fetch-audio-samples.ts
 *
 * Source: nbrosowsky/tonejs-instruments (MIT) — piano derived from the
 * CC-licensed Salamander Grand Piano; cello stands in for the orchestral
 * low-string layer. Swap SOURCES for any set you prefer; destinations must
 * match lib/audio/manifest.ts. Failures are reported, not fatal — the app
 * still runs on the procedural fallback for anything that didn't land.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const RAW =
	"https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples";

// dest (under public/) → source url. Cello notes cover our C3/C4 string anchors.
const SOURCES: Record<string, string> = {
	"audio/piano/C3.mp3": `${RAW}/piano/C3.mp3`,
	"audio/piano/C4.mp3": `${RAW}/piano/C4.mp3`,
	"audio/piano/C5.mp3": `${RAW}/piano/C5.mp3`,
	"audio/strings/C3.mp3": `${RAW}/cello/C3.mp3`,
	"audio/strings/C4.mp3": `${RAW}/cello/C4.mp3`,
};

const publicDir = join(process.cwd(), "public");

let ok = 0;
let failed = 0;

await Promise.all(
	Object.entries(SOURCES).map(async ([dest, url]) => {
		try {
			const res = await fetch(url);
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
	console.log(
		"Missing samples fall back to the procedural instrument automatically.",
	);
}
