// The conductor. Owns the single AudioContext, the master + reverb bus, both
// instruments, and the interaction→music mapping. Lazily constructed on the
// client only; every method is a safe no-op before a user gesture unlocks audio
// (browser autoplay policy). The store drives enabled/volume through here.

import { INSTRUMENTS } from "./manifest";
import { renderPianoBuffer, renderStringBuffer } from "./procedural";
import { renderImpulseResponse } from "./reverb";
import { Sampler } from "./sampler";
import { degreeToMidi, ROOT_MIDI } from "./scales";

/** Semantic interaction cues — components speak intent, not notes. */
export type Voice =
	| "hover" // sidebar / control focus — climbs the scale
	| "select" // commit a choice — bright chord
	| "toggle-on"
	| "toggle-off"
	| "open" // palette / dialog opens — ascending arpeggio
	| "close"
	| "back"
	| "enable" // audio switched on — warm piano welcome
	| "type"; // keystroke in a search field — soft, subtle

interface Note {
	instrument: "piano" | "strings";
	degree: number;
	velocity: number;
	/** Seconds to delay from trigger — builds arpeggios/chords. */
	delay: number;
}

class AudioEngine {
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private reverbSend: GainNode | null = null;
	private piano: Sampler | null = null;
	private strings: Sampler | null = null;

	private enabled = false;
	private volume = 0.6;
	// Interaction sound is a Pro feature. Defaults closed (fail-closed) until the
	// client's Pro check resolves — gated centrally here so every
	// play() call site (hover, select, toggle, type…) is covered without each
	// caller needing its own entitlement check.
	private pro = false;

	// One-shot gesture unlock. A context created outside a user gesture (e.g. a
	// returning visitor whose preference rehydrates to "on") is born suspended;
	// resume() only sticks during a real activation event. So when audio is
	// enabled we arm these listeners and resume on the first genuine gesture.
	private unlockArmed = false;
	private readonly onGesture = () => {
		this.unlock();
		if (this.ctx?.state === "running") this.disarmUnlock();
	};

	// Melodic memory: consecutive hovers walk up the scale, then reset after a
	// pause so a fresh sweep starts low again.
	private step = 0;
	private lastHover = 0;
	private typeStep = 0;

	private ensureContext(): boolean {
		if (this.ctx) return true;
		const Ctor =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext?: typeof AudioContext })
				.webkitAudioContext;
		if (!Ctor) return false;

		const ctx = new Ctor();
		const master = ctx.createGain();
		master.gain.value = this.enabled ? this.volume : 0;
		master.connect(ctx.destination);

		// Reverb bus: send → convolver → wet gain → master.
		const convolver = ctx.createConvolver();
		convolver.buffer = renderImpulseResponse(ctx);
		const wet = ctx.createGain();
		wet.gain.value = 0.9;
		const send = ctx.createGain();
		send.gain.value = 1;
		send.connect(convolver);
		convolver.connect(wet);
		wet.connect(master);

		const pianoBuf = renderPianoBuffer(ctx);
		const stringBuf = renderStringBuffer(ctx);
		const piano = new Sampler(ctx, master, send, pianoBuf);
		const strings = new Sampler(ctx, master, send, stringBuf);
		// Fire-and-forget: real samples upgrade the tone when they arrive; the
		// procedural fallback covers the gap immediately.
		void piano.load(INSTRUMENTS.piano);
		void strings.load(INSTRUMENTS.strings);

		this.ctx = ctx;
		this.master = master;
		this.reverbSend = send;
		this.piano = piano;
		this.strings = strings;
		return true;
	}

	/** Call from a real user gesture — resumes the (possibly suspended) context. */
	unlock() {
		if (!this.ensureContext()) return;
		void this.ctx?.resume();
	}

	// pointerenter/hover are NOT user-activation events, so only these can
	// actually resume a suspended context. Capture + passive: we never cancel.
	private armUnlock() {
		if (this.unlockArmed || this.ctx?.state === "running") return;
		this.unlockArmed = true;
		const opts = { capture: true, passive: true } as const;
		window.addEventListener("pointerdown", this.onGesture, opts);
		window.addEventListener("keydown", this.onGesture, opts);
		window.addEventListener("touchend", this.onGesture, opts);
	}

	private disarmUnlock() {
		if (!this.unlockArmed) return;
		this.unlockArmed = false;
		const opts = { capture: true } as const;
		window.removeEventListener("pointerdown", this.onGesture, opts);
		window.removeEventListener("keydown", this.onGesture, opts);
		window.removeEventListener("touchend", this.onGesture, opts);
	}

	setEnabled(on: boolean) {
		this.enabled = on;
		// Arm rather than eagerly unlock: a load-time enable (rehydrate) has no
		// active gesture, so creating the context now would only strand it
		// suspended. The toggle path still fires instantly — SoundToggle's
		// play("enable") runs inside the same click and unlocks there.
		if (on) this.armUnlock();
		this.applyMaster();
	}

	setPro(pro: boolean) {
		this.pro = pro;
	}

	setVolume(v: number) {
		this.volume = Math.min(1, Math.max(0, v));
		this.applyMaster();
	}

	private applyMaster() {
		if (this.master && this.ctx) {
			this.master.gain.setTargetAtTime(
				this.enabled ? this.volume : 0,
				this.ctx.currentTime,
				0.02,
			);
		}
	}

	play(voice: Voice) {
		if (!this.enabled || !this.pro) return;
		if (!this.ensureContext()) return;
		if (this.ctx?.state === "suspended") void this.ctx.resume();

		for (const note of this.notesFor(voice)) {
			const inst = note.instrument === "piano" ? this.piano : this.strings;
			const midi = degreeToMidi(ROOT_MIDI, note.degree);
			if (note.delay <= 0) {
				inst?.trigger(midi, { velocity: note.velocity });
			} else {
				window.setTimeout(
					() => inst?.trigger(midi, { velocity: note.velocity }),
					note.delay * 1000,
				);
			}
		}
	}

	private notesFor(voice: Voice): Note[] {
		const now = typeof performance !== "undefined" ? performance.now() : 0;
		switch (voice) {
			case "hover": {
				if (now - this.lastHover > 900) this.step = 0;
				this.lastHover = now;
				const degree = this.step % 8;
				this.step += 1;
				return [{ instrument: "piano", degree, velocity: 0.4, delay: 0 }];
			}
			case "select":
				this.step = 0;
				return [
					{ instrument: "piano", degree: 2, velocity: 0.6, delay: 0 },
					{ instrument: "piano", degree: 4, velocity: 0.5, delay: 0 },
					{ instrument: "piano", degree: 6, velocity: 0.45, delay: 0 },
				];
			case "toggle-on":
				return [
					{ instrument: "piano", degree: 4, velocity: 0.55, delay: 0 },
					{ instrument: "piano", degree: 6, velocity: 0.5, delay: 0.07 },
				];
			case "toggle-off":
				return [
					{ instrument: "piano", degree: 3, velocity: 0.55, delay: 0 },
					{ instrument: "piano", degree: 1, velocity: 0.5, delay: 0.07 },
				];
			case "open":
				return [
					{ instrument: "strings", degree: 0, velocity: 0.5, delay: 0 },
					{ instrument: "piano", degree: 4, velocity: 0.45, delay: 0.05 },
					{ instrument: "piano", degree: 7, velocity: 0.4, delay: 0.11 },
				];
			case "close":
				return [
					{ instrument: "piano", degree: 4, velocity: 0.4, delay: 0 },
					{ instrument: "piano", degree: 0, velocity: 0.45, delay: 0.06 },
				];
			case "back":
				return [{ instrument: "piano", degree: 0, velocity: 0.45, delay: 0 }];
			case "enable":
				// Clean piano welcome: root → third → octave. Piano only, no strings —
				// warm and unambiguous, resolves upward to the octave.
				return [
					{ instrument: "piano", degree: 0, velocity: 0.5, delay: 0 },
					{ instrument: "piano", degree: 2, velocity: 0.45, delay: 0.09 },
					{ instrument: "piano", degree: 5, velocity: 0.42, delay: 0.19 },
				];
			case "type": {
				// Barely-there keystroke tick. Cycles the low pentatonic so fast
				// typing stays melodic without climbing away like `hover` does.
				const degree = this.typeStep % 3;
				this.typeStep += 1;
				return [{ instrument: "piano", degree, velocity: 0.22, delay: 0 }];
			}
		}
	}
}

let engine: AudioEngine | null = null;

/** Client-only singleton. Returns null during SSR so callers stay safe. */
export function getEngine(): AudioEngine | null {
	if (typeof window === "undefined") return null;
	if (!engine) engine = new AudioEngine();
	return engine;
}
