"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Pause, Play } from "lucide-react";

import { Button } from "../ui/button";
import { useCharacter } from "../hooks/use-character";
import { useLoaderState } from "../hooks/use-loader-state";
import { asset, rawAsset } from "../../_shared/cdn";

// The soundtrack player.
//
// Rewritten. The original had six defects, every one of them silent — the widget
// rendered, the button clicked, and it still lied about what it was doing:
//
//   1. `timeupdate` wrote the elapsed time into the `duration` state, so the label
//      that said "min" counted up from 0:00 and the track length was never shown.
//   2. Playback was started by firing a synthetic `click()` on the button ref.
//      Browsers block programmatic playback without a user gesture, `play()`
//      returns a promise nobody awaited, and `setIsPlaying(true)` ran regardless —
//      so the UI reported "Listening…" over silence.
//   3. Metadata was read inside `setTimeout(…, 1000)`. On a slow connection the
//      duration was simply 0.
//   4. The `timeupdate` listener was never removed, so it stacked on every remount.
//   5. The track title was derived from `audioRef.current?.currentSrc` DURING
//      RENDER — a ref read that is null on the server and on the first client
//      pass, which is both a hydration mismatch and a value that never updates.
//   6. The asset filename contained a space (`chanch chi.mp3`).
//
// The fix for all six is the same idea: let the audio element be the source of
// truth and subscribe to it, rather than guessing and writing state in parallel.

const TRACK = {
  title: "Chanch Chi",
  src: rawAsset("jinlong/chanch-chi.mp3"),
  artwork: asset("jinlong/chanch-chi"),
};

function formatTime(timeInSeconds: number): string {
  if (!Number.isFinite(timeInSeconds) || timeInSeconds < 0) return "0:00";
  const minutes = Math.floor(timeInSeconds / 60);
  const seconds = Math.floor(timeInSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function MusicPlayer() {
  const { updateMusicPlaying } = useCharacter();
  const { isLoaded } = useLoaderState();

  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  // Autoplay is a request, not a guarantee. When the browser refuses, the widget
  // says so instead of claiming to be playing.
  const [blocked, setBlocked] = useState(false);
  const triedAutoplay = useRef(false);

  // One subscription to the element, covering every piece of state the UI shows.
  // `play` and `pause` are what actually decide `isPlaying` — not the click
  // handler, which only expresses an intent that can fail.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onTimeUpdate = () => setElapsed(audio.currentTime || 0);
    const onPlay = () => {
      setIsPlaying(true);
      setBlocked(false);
      updateMusicPlaying(true);
    };
    const onPause = () => {
      setIsPlaying(false);
      updateMusicPlaying(false);
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    // The element may already have metadata if it was cached.
    if (audio.readyState >= 1) onLoadedMetadata();

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, [updateMusicPlaying]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    try {
      await audio.play();
    } catch {
      // Autoplay policy, a missing file, an unsupported codec — all arrive here.
      // The `pause` listener has already put the UI back where it belongs.
      setBlocked(true);
    }
  }, []);

  // Try once, after the splash has finished. If the browser refuses, the button
  // is still there and a real click will always work.
  useEffect(() => {
    if (!isLoaded || triedAutoplay.current) return;
    triedAutoplay.current = true;
    void togglePlay();
  }, [isLoaded, togglePlay]);

  const seek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = Number(event.target.value);
    audio.currentTime = next;
    setElapsed(next);
  };

  return (
    <div className="other__item pointer-events-none relative w-full flex-shrink-0 translate-y-full rounded-2xl bg-black px-5 py-2 opacity-0 min-[500px]:py-4 md:max-w-[250px] md:px-3 md:py-3 min-[1100px]:max-w-[300px] xl:max-w-[347px] xl:px-5 min-[2000px]:max-w-[400px] min-[2000px]:py-4 min-[2900px]:max-w-[600px]">
      <div className="flex items-center gap-x-8 md:gap-x-2 xl:gap-x-4 min-[2900px]:gap-x-6">
        {/* `preload="metadata"` is what makes the duration available without
            downloading the whole track before the page settles. */}
        <audio ref={audioRef} src={TRACK.src} loop preload="metadata" className="sr-only" />

        <Button
          variant="icon"
          size="icon"
          onClick={togglePlay}
          aria-label={isPlaying ? `Pause ${TRACK.title}` : `Play ${TRACK.title}`}
          className="pointer-events-auto flex size-10 items-center justify-center rounded-full bg-white p-3 text-black md:size-8 md:p-2.5 min-[2000px]:size-10 min-[2900px]:size-16"
        >
          {isPlaying ? (
            <Pause className="size-5 min-[500px]:size-6 md:size-5 min-[2900px]:size-7" />
          ) : (
            <Play className="size-5 min-[500px]:size-6 md:size-5 min-[2900px]:size-7" />
          )}
        </Button>

        <div className="flex min-w-0 flex-1 items-center gap-x-1 min-[2000px]:gap-x-4">
          <div className="flex min-w-0 flex-col gap-y-1 min-[2000px]:gap-y-4">
            <h2 className="truncate text-2xl font-semibold text-white sm:font-bold xl:text-2xl min-[2000px]:text-3xl min-[2900px]:text-5xl">
              {TRACK.title}
            </h2>

            <p className="flex items-center gap-x-1 font-light text-white/80 max-[500px]:text-sm md:text-xs xl:text-sm min-[2000px]:text-base min-[2900px]:text-2xl">
              {/* Elapsed against total, which is what the original meant to show. */}
              <span className="tabular-nums">
                {formatTime(elapsed)} / {formatTime(duration)}
              </span>
              <span>•</span>
              <span>
                {blocked ? "Tap to play" : isPlaying ? "Listening…" : "Paused"}
              </span>
            </p>

            {/* `formatTime` existed in the original and was wired to nothing
                seekable. Now the readout and the control agree. */}
            <label className="sr-only" htmlFor="jinlong-seek">
              Seek within {TRACK.title}
            </label>
            <input
              id="jinlong-seek"
              type="range"
              min={0}
              max={duration || 0}
              step={0.5}
              value={elapsed}
              onChange={seek}
              disabled={!duration}
              className="pointer-events-auto h-1 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-[hsl(var(--primary-red))] disabled:cursor-default disabled:opacity-40"
            />
          </div>

          <Image
            src={TRACK.artwork}
            width={200}
            height={280}
            alt=""
            aria-hidden
            className="absolute bottom-0 right-0 max-w-[90px] sm:max-w-full md:max-w-[80px] xl:max-w-[100px] min-[1440px]:max-w-[118px] min-[2000px]:max-w-[130px] min-[2900px]:max-w-[200px]"
          />
        </div>
      </div>
    </div>
  );
}
