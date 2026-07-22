// Musical primitives. The whole point of constraining interaction audio to a
// scale: no matter what order the user triggers events in, every note lands in
// the same mode, so it can never sound "wrong" — only more or less melodic.

/** A4 = MIDI 69 = 440Hz. Equal temperament. */
export function midiToFreq(midi: number): number {
	return 440 * 2 ** ((midi - 69) / 12);
}

/** Major pentatonic degrees (semitone offsets). Consonant against itself in
 * any combination — the safest palette for chance-ordered playback. */
const MAJOR_PENTATONIC = [0, 2, 4, 7, 9] as const;

/**
 * Resolve a scale degree (unbounded — wraps into higher octaves) to a MIDI
 * note above `rootMidi`. degree 0 → root, 5 → root + octave, etc.
 */
export function degreeToMidi(rootMidi: number, degree: number): number {
	const len = MAJOR_PENTATONIC.length;
	const octave = Math.floor(degree / len);
	const step = ((degree % len) + len) % len;
	return rootMidi + octave * 12 + MAJOR_PENTATONIC[step];
}

/** Root of the interaction range. C4 keeps hovers bright without shrillness. */
export const ROOT_MIDI = 60; // C4

/** Reference pitch the procedural/sample buffers are rendered at. Detune from
 * here stays within ~1.5 octaves so pitch-shifting never sounds chipmunked. */
export const REFERENCE_MIDI = 60; // C4
