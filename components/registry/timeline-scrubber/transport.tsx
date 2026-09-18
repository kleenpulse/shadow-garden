"use client";

import {
  ChevronFirst,
  ChevronLast,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Transport controls and the timecode readout.
 *
 * Every button here has a keyboard equivalent on the track itself. They are not
 * a fallback for each other — the buttons are for people who are already
 * pointing at the timeline, the keys are for people whose hands are on the
 * keyboard, and a transport that only works one way makes half its audience
 * change posture to use it.
 */
export default function Transport({
  playing,
  timecode,
  accent,
  onToggle,
  onStart,
  onEnd,
  onStepBack,
  onStepForward,
  className,
}: {
  playing: boolean;
  timecode: string;
  accent: string;
  onToggle: () => void;
  onStart: () => void;
  onEnd: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  className?: string;
}) {
  const button =
    "flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-raised text-ink-dim outline-none transition-colors hover:text-ink focus-visible:text-ink [&_svg]:h-3.5 [&_svg]:w-3.5";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button type="button" onClick={onStart} aria-label="Go to start" className={button}>
        <ChevronFirst />
      </button>
      <button type="button" onClick={onStepBack} aria-label="Previous frame" className={button}>
        <SkipBack />
      </button>

      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? "Pause" : "Play"}
        aria-pressed={playing}
        className={cn(button, "h-8 w-8")}
        style={playing ? { borderColor: accent, color: accent } : undefined}
      >
        {playing ? <Pause /> : <Play />}
      </button>

      <button type="button" onClick={onStepForward} aria-label="Next frame" className={button}>
        <SkipForward />
      </button>
      <button type="button" onClick={onEnd} aria-label="Go to end" className={button}>
        <ChevronLast />
      </button>

      {/* Tabular figures and a fixed width. A timecode that changes width sixty
          times a second drags every control beside it along with it. */}
      <span className="ml-1 font-mono text-xs tabular-nums text-ink">{timecode}</span>
    </div>
  );
}
