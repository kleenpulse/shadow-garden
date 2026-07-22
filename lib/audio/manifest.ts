// Instrument catalogue. The sampler tries to load real recorded samples listed
// here from /public/audio/<instrument>/; if a file 404s (assets not fetched
// yet) it silently falls back to the procedural buffer. Run
// `bun scripts/fetch-audio-samples.ts` to populate public/audio/.

export type InstrumentId = "piano" | "strings";

export interface SampleEntry {
	/** MIDI note the file was recorded at. */
	midi: number;
	/** Path under /public. */
	url: string;
}

export interface InstrumentManifest {
	id: InstrumentId;
	/** Recorded samples, sparse across the range; the sampler detunes between
	 * the nearest neighbours. Empty [] → always use the procedural fallback. */
	samples: SampleEntry[];
}

// A few anchor notes per instrument is enough — the sampler pitch-shifts to
// fill the gaps. Keep them near the interaction range (C3–C6) so detune stays
// small. These filenames match what the fetch script writes.
export const INSTRUMENTS: Record<InstrumentId, InstrumentManifest> = {
	piano: {
		id: "piano",
		samples: [
			{ midi: 48, url: "/audio/piano/C3.mp3" },
			{ midi: 60, url: "/audio/piano/C4.mp3" },
			{ midi: 72, url: "/audio/piano/C5.mp3" },
		],
	},
	strings: {
		id: "strings",
		samples: [
			{ midi: 48, url: "/audio/strings/C3.mp3" },
			{ midi: 60, url: "/audio/strings/C4.mp3" },
		],
	},
};
