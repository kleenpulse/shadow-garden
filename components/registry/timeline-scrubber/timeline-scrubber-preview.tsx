"use client";

import type { PreviewProps } from "@/lib/registry/types";
import TimelineScrubber from "./timeline-scrubber";
import type { TimelineMarker } from "./types";

// Markers are supplied by the caller, so the component a customer pastes has no
// opinion about what is on the timeline. These sit at times that survive the
// `duration` control being dragged down — everything is inside the first eight
// seconds so the lane is never empty.
const MARKERS: TimelineMarker[] = [
  { id: "in", time: 0.5, label: "In" },
  { id: "beat", time: 2.25, label: "Beat" },
  { id: "cut", time: 3.8, label: "Cut", color: "#38bdf8" },
  { id: "hit", time: 5.4, label: "Hit" },
  { id: "out", time: 7.2, label: "Out", color: "#f472b6" },
];

export default function TimelineScrubberPreview({
  values,
  reducedMotion,
  paused,
}: PreviewProps) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <TimelineScrubber
        markers={MARKERS}
        duration={values.duration as number}
        fps={values.fps as number}
        zoom={values.zoom as number}
        snapThreshold={values.snapThreshold as number}
        showRuler={values.showRuler as boolean}
        showMarkers={values.showMarkers as boolean}
        loop={values.loop as boolean}
        playbackRate={values.playbackRate as number}
        follow={values.follow as "off" | "page" | "center"}
        trackHeight={values.trackHeight as number}
        accent={values.accent as string}
        paused={paused}
        reducedMotion={reducedMotion}
        className="max-w-3xl"
      />
    </div>
  );
}
