/** A labelled point on the timeline. Snapping targets these. */
export interface TimelineMarker {
  id: string;
  /** Position in seconds from the start. */
  time: number;
  label: string;
  /** Overrides the timeline accent for this marker's pip. */
  color?: string;
}

/**
 * What the viewport does when the playhead runs past its right edge during
 * playback. Only meaningful when the zoom is high enough that the whole
 * duration does not fit.
 *
 * - `off` — nothing. The playhead leaves and you scroll after it yourself.
 * - `page` — jump a whole viewport when it crosses the edge. Cheap, and it
 *   keeps the ruler still for most of the time, which is what makes it
 *   readable while something is playing.
 * - `center` — hold the playhead in the middle and move the world past it.
 *   The opposite trade: the playhead never moves, so the ruler never stops.
 */
export type FollowMode = "off" | "page" | "center";
