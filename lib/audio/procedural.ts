// Fallback instruments. Rendered once as AudioBuffers so the sampler can treat
// them exactly like recorded samples (single buffer, pitch-shifted via detune).
// These play immediately with zero downloaded assets; drop real samples into
// public/audio/ and the sampler prefers those (see manifest.ts).

import { midiToFreq, REFERENCE_MIDI } from "./scales";

/**
 * Additive piano-ish tone with inharmonic partials and per-partial decay.
 * Inharmonicity (stiff-string stretch) is what stops additive synthesis from
 * sounding like an organ.
 */
export function renderPianoBuffer(ctx: BaseAudioContext): AudioBuffer {
	const rate = ctx.sampleRate;
	const dur = 2.4;
	const length = Math.floor(dur * rate);
	const buffer = ctx.createBuffer(1, length, rate);
	const data = buffer.getChannelData(0);
	const f0 = midiToFreq(REFERENCE_MIDI);
	const B = 0.0008; // string stiffness

	const partials = 10;
	for (let n = 1; n <= partials; n++) {
		const stretch = Math.sqrt(1 + B * n * n);
		const freq = f0 * n * stretch;
		const amp = 1 / (n * n); // lower partials dominate
		const decay = 4 + n * 0.9; // higher partials die faster
		for (let i = 0; i < length; i++) {
			const t = i / rate;
			data[i] +=
				amp * Math.exp(-decay * t) * Math.sin(2 * Math.PI * freq * t);
		}
	}

	// Percussive attack: a few ms of shaped noise-like transient.
	const attack = Math.floor(0.004 * rate);
	for (let i = 0; i < attack; i++) data[i] *= i / attack;

	normalize(data);
	return buffer;
}

/**
 * Bowed-string swell: slow attack, sawtooth-leaning harmonic stack, gentle
 * vibrato. The long attack is the "orchestra" character for confirm/open cues.
 */
export function renderStringBuffer(ctx: BaseAudioContext): AudioBuffer {
	const rate = ctx.sampleRate;
	const dur = 2.8;
	const length = Math.floor(dur * rate);
	const buffer = ctx.createBuffer(1, length, rate);
	const data = buffer.getChannelData(0);
	const f0 = midiToFreq(REFERENCE_MIDI);

	// Fewer partials + steep 1/n^2 rolloff → warm bowed tone. A full 1/n
	// sawtooth stack reads as a buzzer, which is what made the old cue harsh.
	const partials = 6;
	for (let i = 0; i < length; i++) {
		const t = i / rate;
		const vibrato = 1 + 0.003 * Math.sin(2 * Math.PI * 5.2 * t);
		let s = 0;
		for (let n = 1; n <= partials; n++) {
			s += (1 / (n * n)) * Math.sin(2 * Math.PI * f0 * n * vibrato * t);
		}
		data[i] = s * 0.8;
	}

	// Slow attack in, long release out.
	const attack = Math.floor(0.12 * rate);
	const release = Math.floor(0.6 * rate);
	for (let i = 0; i < attack; i++) data[i] *= i / attack;
	for (let i = 0; i < release; i++) {
		data[length - 1 - i] *= i / release;
	}

	normalize(data);
	return buffer;
}

function normalize(data: Float32Array): void {
	let peak = 0;
	for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
	if (peak > 0) {
		const g = 0.9 / peak;
		for (let i = 0; i < data.length; i++) data[i] *= g;
	}
}
