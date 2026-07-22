// The "hall". A short exponential-decay noise impulse fed to a ConvolverNode is
// what separates "a beep" from "an instrument in a room" — this is most of what
// makes the sampled tone read as orchestral rather than as a UI click.

/**
 * Synthesize a stereo impulse response. No asset needed — decaying diffuse
 * noise convolves into a plausible small hall. `seconds` sets the tail length.
 * The noise must be genuinely broadband (an LCG here) — tonal pseudo-noise
 * rings metallic and makes every cue sound cheap.
 */
export function renderImpulseResponse(
	ctx: BaseAudioContext,
	seconds = 1.6,
	decay = 4.5,
): AudioBuffer {
	const rate = ctx.sampleRate;
	const length = Math.max(1, Math.floor(seconds * rate));
	const impulse = ctx.createBuffer(2, length, rate);

	for (let channel = 0; channel < 2; channel++) {
		const data = impulse.getChannelData(channel);
		// Deterministic LCG, seeded per channel so L/R decorrelate into a stereo
		// field instead of a mono point source.
		let seed = channel === 0 ? 0x9e3779b9 : 0x1b56c4e9;
		const rand = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			return seed / 0xffffffff;
		};
		// Short fade-in avoids a hard click at the head of the tail.
		const fadeIn = Math.floor(0.005 * rate);
		for (let i = 0; i < length; i++) {
			const t = i / length;
			const white = rand() * 2 - 1;
			const env = (1 - t) ** decay;
			const head = i < fadeIn ? i / fadeIn : 1;
			data[i] = white * env * head;
		}
	}
	return impulse;
}
