// Hand-rolled multisampler. No Tone.js — raw Web Audio keeps the pinned stack
// intact. Given a sparse set of buffers across the range, it plays any target
// note by picking the nearest neighbour and detuning by the cents difference,
// then shapes it with a gain envelope and routes dry + reverb-send.

import type { InstrumentManifest } from "./manifest";

interface LoadedSample {
	midi: number;
	buffer: AudioBuffer;
}

export interface TriggerOptions {
	/** Peak gain for this note (0–1). */
	velocity?: number;
	/** Extra fade-out seconds beyond the sample's own tail. */
	release?: number;
}

export class Sampler {
	private samples: LoadedSample[] = [];
	private readonly maxVoices = 8;
	private voices: AudioBufferSourceNode[] = [];

	constructor(
		private readonly ctx: AudioContext,
		/** Dry bus. */
		private readonly output: AudioNode,
		/** Reverb send bus. */
		private readonly reverbSend: AudioNode,
		private readonly fallback: AudioBuffer,
	) {}

	/**
	 * Attempt to load every recorded sample in the manifest. Any that fail
	 * (assets not fetched) are skipped — the sampler still works off remaining
	 * samples, or the procedural fallback if none load.
	 */
	async load(manifest: InstrumentManifest): Promise<void> {
		const loaded = await Promise.all(
			manifest.samples.map(async (entry): Promise<LoadedSample | null> => {
				try {
					const res = await fetch(entry.url);
					if (!res.ok) return null;
					const bytes = await res.arrayBuffer();
					const buffer = await this.ctx.decodeAudioData(bytes);
					return { midi: entry.midi, buffer };
				} catch {
					return null;
				}
			}),
		);
		this.samples = loaded
			.filter((s): s is LoadedSample => s !== null)
			.sort((a, b) => a.midi - b.midi);
	}

	private pick(midi: number): { buffer: AudioBuffer; sourceMidi: number } {
		if (this.samples.length === 0) {
			// Procedural buffer is rendered at REFERENCE_MIDI (C4 = 60).
			return { buffer: this.fallback, sourceMidi: 60 };
		}
		let nearest = this.samples[0];
		for (const s of this.samples) {
			if (Math.abs(s.midi - midi) < Math.abs(nearest.midi - midi)) nearest = s;
		}
		return { buffer: nearest.buffer, sourceMidi: nearest.midi };
	}

	/** Play a MIDI note now. Steals the oldest voice past the polyphony cap. */
	trigger(midi: number, { velocity = 0.7, release = 0.08 }: TriggerOptions = {}) {
		const { buffer, sourceMidi } = this.pick(midi);
		const now = this.ctx.currentTime;

		const source = this.ctx.createBufferSource();
		source.buffer = buffer;
		source.detune.value = (midi - sourceMidi) * 100; // cents

		const env = this.ctx.createGain();
		env.gain.setValueAtTime(0, now);
		env.gain.linearRampToValueAtTime(velocity, now + 0.006); // click-free attack

		const send = this.ctx.createGain();
		send.gain.value = 0.28; // wet amount

		source.connect(env);
		env.connect(this.output);
		env.connect(send);
		send.connect(this.reverbSend);

		source.start(now);

		// Voice stealing.
		this.voices.push(source);
		if (this.voices.length > this.maxVoices) {
			const oldest = this.voices.shift();
			try {
				oldest?.stop();
			} catch {
				/* already stopped */
			}
		}
		source.onended = () => {
			this.voices = this.voices.filter((v) => v !== source);
			env.disconnect();
			send.disconnect();
		};
		void release; // reserved for held-note voices; UI cues are one-shots
	}
}
