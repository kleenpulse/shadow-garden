"use client";

import {
  ArrowDown,
  Bike,
  Cast,
  Check,
  Circle,
  LoaderCircle,
  Music,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
  Timer,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useAnimationLoop } from "@/hooks/use-animation-loop";
import { cn } from "@/lib/utils";
import {
  useIsland,
  useIslandState,
  type IslandActivity,
} from "./live-activity";

// Five ready-made activities. Each is a factory returning the three views the
// island asks for; the views read one shared clock and keep anything they both
// need — play state, a pause — in island state, so the pill and the card can
// never disagree about what is happening.

const TIMER_TINT = "#ff9f0a";
const DELIVERY_TINT = "#30d158";

const clock = (s: number, pad = false) => {
  const v = Math.max(0, Math.floor(s));
  const m = Math.floor(v / 60);
  return `${pad ? String(m).padStart(2, "0") : m}:${String(v % 60).padStart(2, "0")}`;
};

interface TrackState {
  offset: number;
  frozenAt: number | null;
}

/**
 * Local time for one activity: the island clock, minus however long this
 * activity has been paused. Pure arithmetic over two numbers, so a pause
 * stored from the card is already in effect when the pill renders.
 */
function useTrack(key: string, startAt = 0) {
  const { elapsed } = useIsland();
  const [s, set] = useIslandState<TrackState>(`${key}:track`, {
    offset: -startAt,
    frozenAt: null,
  });
  const t = s.frozenAt ?? elapsed - s.offset;
  const running = s.frozenAt === null;
  const toggle = () =>
    set((p) =>
      p.frozenAt === null
        ? { offset: p.offset, frozenAt: elapsed - p.offset }
        : { offset: elapsed - p.frozenAt, frozenAt: null },
    );
  const seek = (to: number) =>
    set((p) =>
      p.frozenAt === null
        ? { offset: elapsed - to, frozenAt: null }
        : { offset: p.offset, frozenAt: to },
    );
  return { t, running, toggle, seek };
}

function Ring({
  value,
  color,
  size = 22,
  children,
}: {
  value: number;
  color: string;
  size?: number;
  children?: ReactNode;
}) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <span
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" className="absolute inset-0 -rotate-90">
        <circle cx={12} cy={12} r={r} fill="none" stroke={color} strokeOpacity={0.25} strokeWidth={3} />
        <circle
          cx={12}
          cy={12}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
          className="transition-[stroke-dashoffset] duration-100 ease-linear"
        />
      </svg>
      {children}
    </span>
  );
}

function RoundButton({
  label,
  onClick,
  className,
  style,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={style}
      className={cn(
        "grid size-10 shrink-0 place-items-center rounded-full bg-white/12 text-white transition-[background-color,transform] duration-150 hover:bg-white/20 active:scale-90",
        "outline-none focus-visible:ring-2 focus-visible:ring-white/70",
        className,
      )}
    >
      {children}
    </button>
  );
}

function Spinner({ className, color }: { className?: string; color?: string }) {
  const { paused, reduced } = useIsland();
  const still = paused || reduced;
  return (
    <motion.span
      className={cn("inline-grid", className)}
      style={{ color }}
      animate={still ? { rotate: 0 } : { rotate: 360 }}
      transition={
        still ? { duration: 0 } : { duration: 1, ease: "linear", repeat: Infinity }
      }
    >
      <LoaderCircle className="size-full" />
    </motion.span>
  );
}

// ─── Media ─────────────────────────────────────────────────────────────────

export interface MediaTrack {
  title: string;
  artist: string;
  art: string;
  /** Seconds. */
  duration: number;
}

export interface MediaActivityOptions {
  id?: string;
  tracks: MediaTrack[];
  /** Where the audio is coming from, shown above the title. */
  source?: string;
  /** Seconds into the first track the demo starts at. */
  startAt?: number;
}

// One period of a sine, tiled along the played part of the bar. Sliding the
// tile is the whole animation — no path is ever rebuilt.
const WAVE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='14'%3E%3Cpath d='M0 7 Q20 1 40 7 T80 7' fill='none' stroke='white' stroke-width='3'/%3E%3C/svg%3E")`;

function useMedia(o: MediaActivityOptions) {
  const key = o.id ?? "media";
  const [index, setIndex] = useIslandState(`${key}:index`, 0);
  const track = useTrack(key, o.startAt ?? 0);
  const song = o.tracks[index % o.tracks.length];
  const pos = track.t % song.duration;
  const skip = (dir: 1 | -1) => {
    const n = o.tracks.length;
    // Back restarts the song first, like every player that ships.
    if (dir === -1 && pos > 3) return track.seek(0);
    setIndex((i) => (i + dir + n) % n);
    track.seek(0);
  };
  return { song, pos, playing: track.running, toggle: track.toggle, skip };
}

function Equalizer({ playing }: { playing: boolean }) {
  const { paused, reduced } = useIsland();
  const live = playing && !paused && !reduced;
  return (
    <span aria-hidden className="flex h-4 items-center gap-[3px]">
      {[0.9, 0.6, 1.1, 0.75].map((d, i) => (
        <motion.span
          key={i}
          className="h-full w-[3px] origin-center rounded-full bg-white/85"
          animate={live ? { scaleY: [0.35, 1, 0.5, 0.85, 0.35] } : { scaleY: 0.35 }}
          transition={
            live
              ? { duration: d, repeat: Infinity, ease: "easeInOut" }
              : { duration: 0.2 }
          }
        />
      ))}
    </span>
  );
}

function WaveProgress({ value, moving }: { value: number; moving: boolean }) {
  const pct = `${Math.min(1, Math.max(0, value)) * 100}%`;
  return (
    <div className="relative h-3.5">
      <div
        className="absolute top-1/2 right-0 h-[3px] -translate-y-1/2 rounded-full bg-white/25"
        style={{ left: pct }}
      />
      <motion.div
        className="absolute inset-y-0 left-0"
        style={{
          width: pct,
          backgroundImage: WAVE,
          backgroundRepeat: "repeat-x",
          backgroundSize: "80px 14px",
          backgroundPositionY: "50%",
        }}
        animate={{ backgroundPositionX: moving ? ["0px", "80px"] : "0px" }}
        transition={
          moving
            ? { duration: 2.4, ease: "linear", repeat: Infinity }
            : { duration: 0.3 }
        }
      />
      <div
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_3px_rgba(0,0,0,0.25)]"
        style={{ left: pct }}
      />
    </div>
  );
}

function MediaLeading(o: MediaActivityOptions) {
  const { song } = useMedia(o);
  return (
    <img
      src={song.art}
      alt=""
      draggable={false}
      className="size-6 rounded-md object-cover"
    />
  );
}

function MediaTrailing(o: MediaActivityOptions) {
  const { playing } = useMedia(o);
  return <Equalizer playing={playing} />;
}

function MediaCard(o: MediaActivityOptions) {
  const { song, pos, playing, toggle, skip } = useMedia(o);
  const { paused, reduced } = useIsland();
  return (
    <div className="relative isolate p-5">
      <img
        src={song.art}
        alt=""
        draggable={false}
        className="absolute inset-0 -z-10 size-full object-cover opacity-45"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/30 via-black/55 to-black/80" />
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium tracking-wide text-white/70 uppercase">
          <Music className="size-3.5 shrink-0" />
          <span className="truncate">{o.source ?? "Now playing"}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 text-xs font-medium text-white">
          <Cast className="size-3.5" />
          Output
        </span>
      </div>
      <div className="mt-2.5">
        <p className="truncate text-base font-semibold">{song.title}</p>
        <p className="truncate text-sm text-white/60">{song.artist}</p>
      </div>
      <div className="mt-4">
        <WaveProgress
          value={pos / song.duration}
          moving={playing && !paused && !reduced}
        />
        <div className="mt-1.5 flex justify-between text-[11px] text-white/50 tabular-nums">
          <span>{clock(pos, true)}</span>
          <span>{clock(song.duration, true)}</span>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-center gap-4">
        <RoundButton label="Previous" onClick={() => skip(-1)} className="bg-transparent">
          <SkipBack className="size-5 fill-current" />
        </RoundButton>
        <RoundButton
          label={playing ? "Pause" : "Play"}
          onClick={toggle}
          className="size-12 bg-white text-black hover:bg-white/90"
        >
          {playing ? (
            <Pause className="size-5 fill-current" />
          ) : (
            <Play className="size-5 translate-x-px fill-current" />
          )}
        </RoundButton>
        <RoundButton label="Next" onClick={() => skip(1)} className="bg-transparent">
          <SkipForward className="size-5 fill-current" />
        </RoundButton>
      </div>
    </div>
  );
}

export function mediaActivity(o: MediaActivityOptions): IslandActivity {
  return {
    id: o.id ?? "media",
    label: "Now playing",
    leading: <MediaLeading {...o} />,
    trailing: <MediaTrailing {...o} />,
    expanded: <MediaCard {...o} />,
  };
}

// ─── Timer ─────────────────────────────────────────────────────────────────

export interface TimerActivityOptions {
  id?: string;
  label?: string;
  /** Length of the countdown, in seconds. */
  seconds: number;
}

// After hitting zero the demo holds a beat, then starts over.
const TIMER_HOLD = 3;

function useTimer(o: TimerActivityOptions) {
  const track = useTrack(o.id ?? "timer");
  const local = track.t % (o.seconds + TIMER_HOLD);
  const remaining = Math.max(0, o.seconds - local);
  return { ...track, remaining, value: remaining / o.seconds };
}

function TimerLeading(o: TimerActivityOptions) {
  const { value } = useTimer(o);
  return (
    <Ring value={value} color={TIMER_TINT}>
      <Timer className="size-3" style={{ color: TIMER_TINT }} />
    </Ring>
  );
}

function TimerTrailing(o: TimerActivityOptions) {
  const { remaining } = useTimer(o);
  return (
    <span className="text-sm font-semibold tabular-nums" style={{ color: TIMER_TINT }}>
      {clock(Math.ceil(remaining))}
    </span>
  );
}

function TimerCard(o: TimerActivityOptions) {
  const { remaining, running, toggle, seek } = useTimer(o);
  return (
    <div className="flex items-center justify-between gap-4 p-5">
      <div className="flex gap-3">
        <RoundButton
          label={running ? "Pause timer" : "Resume timer"}
          onClick={toggle}
          className="size-12"
          style={{ backgroundColor: `${TIMER_TINT}33`, color: TIMER_TINT }}
        >
          {running ? (
            <Pause className="size-5 fill-current" />
          ) : (
            <Play className="size-5 translate-x-px fill-current" />
          )}
        </RoundButton>
        <RoundButton label="Reset timer" onClick={() => seek(0)} className="size-12">
          <X className="size-5" />
        </RoundButton>
      </div>
      <div className="text-right">
        <p className="text-xs font-medium" style={{ color: TIMER_TINT }}>
          {o.label ?? "Timer"}
        </p>
        <p
          className="text-[2.75rem] leading-none font-light tabular-nums"
          style={{ color: TIMER_TINT }}
        >
          {clock(Math.ceil(remaining))}
        </p>
      </div>
    </div>
  );
}

export function timerActivity(o: TimerActivityOptions): IslandActivity {
  return {
    id: o.id ?? "timer",
    label: o.label ?? "Timer",
    leading: <TimerLeading {...o} />,
    trailing: <TimerTrailing {...o} />,
    expanded: <TimerCard {...o} />,
  };
}

// ─── Download ──────────────────────────────────────────────────────────────

export interface DownloadActivityOptions {
  id?: string;
  filename: string;
  /** Total size, in MB. */
  sizeMb: number;
  /** Average throughput, in MB/s. */
  speed: number;
}

const DOWNLOAD_HOLD = 2.5;

function useDownload(o: DownloadActivityOptions) {
  const track = useTrack(o.id ?? "download");
  const duration = o.sizeMb / o.speed;
  const local = track.t % (duration + DOWNLOAD_HOLD);
  const value = Math.min(1, local / duration);
  // Real throughput is never flat; a slow wobble keeps the readout honest.
  const rate = o.speed * (0.86 + 0.14 * Math.sin(track.t * 1.7));
  return {
    ...track,
    value,
    done: value >= 1,
    rate,
    left: Math.max(0, duration - local),
  };
}

function DownloadLeading(o: DownloadActivityOptions) {
  const { accent } = useIsland();
  const { done } = useDownload(o);
  return (
    <span
      className="grid size-6 place-items-center rounded-full"
      style={{ backgroundColor: done ? DELIVERY_TINT : accent }}
    >
      {done ? (
        <Check className="size-3.5" strokeWidth={3} />
      ) : (
        <ArrowDown className="size-3.5" strokeWidth={3} />
      )}
    </span>
  );
}

function DownloadTrailing(o: DownloadActivityOptions) {
  const { accent } = useIsland();
  const { value, done } = useDownload(o);
  return done ? (
    <span className="text-sm font-semibold" style={{ color: DELIVERY_TINT }}>
      Done
    </span>
  ) : (
    <Ring value={value} color={accent} />
  );
}

function DownloadCard(o: DownloadActivityOptions) {
  const { accent } = useIsland();
  const { value, done, rate, left, running, toggle, seek } = useDownload(o);
  return (
    <div className="p-5">
      <div className="flex items-center gap-3">
        <span
          className="grid size-11 shrink-0 place-items-center rounded-xl"
          style={{ backgroundColor: done ? `${DELIVERY_TINT}33` : `${accent}33` }}
        >
          {done ? (
            <Check className="size-5" style={{ color: DELIVERY_TINT }} strokeWidth={3} />
          ) : (
            <ArrowDown className="size-5" style={{ color: accent }} strokeWidth={3} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{o.filename}</p>
          <p className="truncate text-xs text-white/55 tabular-nums">
            {done
              ? `${o.sizeMb} MB · Downloaded`
              : `${Math.round(value * o.sizeMb)} of ${o.sizeMb} MB · ${rate.toFixed(1)} MB/s`}
          </p>
        </div>
        {!done && (
          <div className="flex gap-2">
            <RoundButton label={running ? "Pause download" : "Resume download"} onClick={toggle} className="size-9">
              {running ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
            </RoundButton>
            <RoundButton label="Restart download" onClick={() => seek(0)} className="size-9">
              <X className="size-4" />
            </RoundButton>
          </div>
        )}
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/15">
        <div
          className="h-full rounded-full transition-[width,background-color] duration-100 ease-linear"
          style={{
            width: `${value * 100}%`,
            backgroundColor: done ? DELIVERY_TINT : accent,
          }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-white/50 tabular-nums">
        <span>{Math.floor(value * 100)}%</span>
        <span>{done ? "Complete" : running ? `${Math.ceil(left)}s left` : "Paused"}</span>
      </div>
    </div>
  );
}

export function downloadActivity(o: DownloadActivityOptions): IslandActivity {
  return {
    id: o.id ?? "download",
    label: `Downloading ${o.filename}`,
    leading: <DownloadLeading {...o} />,
    trailing: <DownloadTrailing {...o} />,
    expanded: <DownloadCard {...o} />,
  };
}

// ─── Delivery ──────────────────────────────────────────────────────────────

export interface DeliveryActivityOptions {
  id?: string;
  vendor: string;
  item: string;
  /** Minutes from order to door. */
  minutes: number;
  /** Simulated minutes per real second, so the demo arrives this decade. */
  timeScale?: number;
}

const DELIVERY_STAGES = ["Ordered", "On the way", "Arrived"];
const DELIVERY_HOLD = 3;

function useDelivery(o: DeliveryActivityOptions) {
  const track = useTrack(o.id ?? "delivery");
  const span = (o.minutes * 60) / (o.timeScale ?? 30);
  const local = track.t % (span + DELIVERY_HOLD);
  const value = Math.min(1, local / span);
  const eta = Math.ceil((1 - value) * o.minutes);
  // The courier only leaves once the order is ready, a fifth of the way in.
  const stage = value >= 1 ? 2 : value >= 0.2 ? 1 : 0;
  return { value, eta, stage, arrived: value >= 1 };
}

function DeliveryLeading() {
  return (
    <span
      className="grid size-6 place-items-center rounded-full"
      style={{ backgroundColor: `${DELIVERY_TINT}33`, color: DELIVERY_TINT }}
    >
      <Bike className="size-3.5" />
    </span>
  );
}

function DeliveryTrailing(o: DeliveryActivityOptions) {
  const { eta, arrived } = useDelivery(o);
  return (
    <span className="text-sm font-semibold tabular-nums" style={{ color: DELIVERY_TINT }}>
      {arrived ? "Here" : `${eta} min`}
    </span>
  );
}

function DeliveryCard(o: DeliveryActivityOptions) {
  const { value, eta, stage, arrived } = useDelivery(o);
  const pct = `${value * 100}%`;
  return (
    <div className="p-5">
      <p className="truncate text-xs text-white/55">{o.vendor}</p>
      <p className="mt-0.5 text-lg font-semibold">
        {arrived ? (
          "Your order is here"
        ) : (
          <>
            Arriving in{" "}
            <span className="tabular-nums" style={{ color: DELIVERY_TINT }}>
              {eta} min
            </span>
          </>
        )}
      </p>
      <p className="truncate text-sm text-white/60">{o.item}</p>
      <div className="relative mt-6 mb-1 h-1.5 rounded-full bg-white/15">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100 ease-linear"
          style={{ width: pct, backgroundColor: DELIVERY_TINT }}
        />
        {[0, 50, 100].map((at, i) => (
          <span
            key={at}
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black transition-colors"
            style={{
              left: `${at}%`,
              backgroundColor: i <= stage ? DELIVERY_TINT : "rgba(255,255,255,0.35)",
            }}
          />
        ))}
        <span
          className="absolute bottom-full mb-1 -translate-x-1/2 transition-[left] duration-100 ease-linear"
          style={{ left: pct, color: DELIVERY_TINT }}
        >
          <Bike className="size-4" />
        </span>
      </div>
      <div className="mt-2 flex justify-between text-[11px]">
        {DELIVERY_STAGES.map((label, i) => (
          <span key={label} className={i <= stage ? "text-white" : "text-white/40"}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function deliveryActivity(o: DeliveryActivityOptions): IslandActivity {
  return {
    id: o.id ?? "delivery",
    label: `Delivery from ${o.vendor}`,
    leading: <DeliveryLeading />,
    trailing: <DeliveryTrailing {...o} />,
    expanded: <DeliveryCard {...o} />,
  };
}

// ─── Agent ─────────────────────────────────────────────────────────────────

export interface AgentStep {
  title: string;
  /** The tool call behind the step, typed out under it while it runs. */
  detail?: string;
  /** Seconds this step takes in the demo. Falls back to `stepSeconds`. */
  seconds?: number;
}

export interface AgentActivityOptions {
  id?: string;
  /** Who is doing the work. */
  agent: string;
  task: string;
  steps: (string | AgentStep)[];
  /** Default seconds per step in the demo. */
  stepSeconds?: number;
  /** Demo token burn, for the running total. */
  tokensPerSecond?: number;
}

const AGENT_HOLD = 4;
// How long a new step holds the widened pill before it folds back to the
// count. Short enough that a fast run never reads as a permanently wide pill.
const ANNOUNCE = 2.4;

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

function useAgent(o: AgentActivityOptions) {
  const track = useTrack(o.id ?? "agent");
  const steps = o.steps.map((s) => (typeof s === "string" ? { title: s } : s));
  const durations = steps.map((s) => s.seconds ?? o.stepSeconds ?? 4);
  const starts: number[] = [];
  let total = 0;
  for (const d of durations) {
    starts.push(total);
    total += d;
  }
  const local = track.t % (total + AGENT_HOLD);
  let current = steps.findIndex((_, i) => local < starts[i] + durations[i]);
  if (current === -1) current = steps.length;
  const done = current >= steps.length;
  // Seconds into the current step — or, once done, into the finish.
  const into = done ? local - total : local - starts[current];
  const spent = Math.min(local, total);
  const tps = o.tokensPerSecond ?? 170;
  return {
    ...track,
    steps,
    durations,
    current,
    done,
    into,
    progress: done ? 1 : into / durations[current],
    spent,
    tokens: Math.max(0, Math.round(spent * tps + Math.sin(spent * 2.3) * 22)),
    announce: into < ANNOUNCE,
    working: !done && track.running,
  };
}

const tokens = (n: number) =>
  n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`;

// ── Three sparkles on a tilted orbit ──────────────────────────────────────
// Each sparkle is flat; the depth is in the ring. A sparkle swinging past the
// front swells to full size and draws on top, one going round the back
// shrinks to a speck behind it — so the cluster keeps rearranging itself
// without any sparkle ever turning.

// A four-point sparkle with concave sides: each quadratic's control point
// sits near the centre, which is what pinches the arms.
const SPARKLE =
  "M0 -1Q0.14 -0.14 1 0Q0.14 0.14 0 1Q-0.14 0.14 -1 0Q-0.14 -0.14 0 -1Z";

const ORBIT = 0.6; // ring radius, in units of the half-box
const THIRD = (Math.PI * 2) / 3;
const TILT = 0.55; // ring tipped toward the viewer, so it reads as a ring
const ROLL = -0.6; // and rolled, so the cluster runs corner to corner
const SPIN = 1.8; // rad/s while working — one lap every ~3.5s

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [255, 255, 255];
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

const tint = (ch: number, t: number) => Math.round(ch + (255 - ch) * t);

// The finish pose: the big sparkle a touch low-left of centre, one small one
// on its top-right shoulder, the other off its bottom-left. Same half-box
// units as the ring.
const POSE = [
  { x: -0.12, y: 0.1, scale: 0.58, depth: 1 },
  { x: 0.62, y: -0.58, scale: 0.24, depth: 0.55 },
  { x: -0.6, y: 0.62, scale: 0.17, depth: 0.55 },
] as const;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface OrbitSparklesProps {
  color: string;
  /** Orbit while true; ease to rest with one sparkle out front when false. */
  spinning: boolean;
  /** Bump to kick the orbit — each step's arrival lands as a flick. */
  pulse: number;
  /** Leave the ring for the finish pose. */
  done?: boolean;
  size?: number;
  className?: string;
}

function OrbitSparkles({
  color,
  spinning,
  pulse,
  done = false,
  size = 24,
  className,
}: OrbitSparklesProps) {
  const { paused, reduced } = useIsland();
  const still = paused || reduced;
  const hostRef = useRef<HTMLSpanElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const starRefs = useRef<(SVGPathElement | null)[]>([]);
  const live = useRef({ color, spinning, pulse, done, still });
  useLayoutEffect(() => {
    live.current = { color, spinning, pulse, done, still };
  });
  // Orbit state lives in a ref, written from the frame — never React state,
  // or every frame would be a render.
  const sim = useRef({
    angle: 0.4,
    vel: 0,
    time: 0,
    pulse,
    order: "",
    // How much wobble is left: it dies with the spin, so a settled sparkle
    // stands upright instead of freezing mid-tilt.
    energy: spinning ? 1 : 0,
    // 0 on the ring, 1 in the finish pose.
    settle: done ? 1 : 0,
    slots: null as number[] | null,
  });

  const loop = useAnimationLoop({
    target: hostRef,
    halted: still,
    onFrame: ({ dt }) => {
      const svg = svgRef.current;
      if (!svg) return;
      const s = sim.current;
      const {
        color: c,
        spinning: spin,
        pulse: p,
        done: fin,
        still: frozen,
      } = live.current;

      if (p !== s.pulse) {
        s.pulse = p;
        if (spin) s.vel += 8;
      }
      // The ring repeats every third of a lap, so "at rest" is the nearest
      // angle that puts some sparkle dead in front.
      const rest =
        Math.PI / 2 + Math.round((s.angle - Math.PI / 2) / THIRD) * THIRD;
      if (spin) {
        s.vel += (SPIN - s.vel) * Math.min(1, dt * 2.5);
      } else {
        // A damped spring onto that angle, so stopping reads as settling.
        s.vel += ((rest - s.angle) * 40 - s.vel * 9) * dt;
      }
      s.angle += s.vel * dt;
      s.time += dt;

      const energyTo = spin ? 1 : 0;
      const settleTo = fin ? 1 : 0;
      if (frozen) {
        // A halted loop only ever paints this one frame, so land on the
        // targets rather than ease toward them.
        s.energy = energyTo;
        s.settle = settleTo;
      } else {
        s.energy += (energyTo - s.energy) * Math.min(1, dt * 4);
        s.settle += (settleTo - s.settle) * Math.min(1, dt * 7);
      }

      const [r, g, b] = hexToRgb(c);
      const cr = Math.cos(ROLL);
      const sr = Math.sin(ROLL);
      const ring: { x: number; y: number; z: number }[] = [];
      for (let i = 0; i < 3; i++) {
        const a = s.angle + i * THIRD;
        // On the ring, then tipped toward the viewer, then rolled.
        const x0 = Math.cos(a) * ORBIT;
        const z0 = Math.sin(a) * ORBIT;
        const y0 = -z0 * Math.sin(TILT);
        ring.push({
          x: x0 * cr - y0 * sr,
          y: x0 * sr + y0 * cr,
          z: z0 * Math.cos(TILT),
        });
      }

      // Who takes which spot is decided once, when the finish starts, so no
      // sparkle changes its mind halfway there: the front one grows, the
      // rightmost of the other two climbs to the shoulder.
      if (fin && !s.slots) {
        const byDepth = [0, 1, 2].sort((i, j) => ring[j].z - ring[i].z);
        const [, m, n] = byDepth;
        const [right, left] = ring[m].x >= ring[n].x ? [m, n] : [n, m];
        s.slots = [];
        s.slots[byDepth[0]] = 0;
        s.slots[right] = 1;
        s.slots[left] = 2;
      } else if (!fin && s.slots && s.settle < 0.001) {
        s.slots = null;
      }

      const items: { el: SVGPathElement; key: number; i: number }[] = [];
      for (let i = 0; i < 3; i++) {
        const el = starRefs.current[i];
        if (!el) continue;
        const { x: rx, y: ry, z } = ring[i];
        // 0 at the back of the ring, 1 at the front.
        const ringDepth = (z / (ORBIT * Math.cos(TILT)) + 1) / 2;
        const ringScale = (0.3 + 0.7 * Math.pow(ringDepth, 1.4)) * 0.58;
        const pose = s.slots ? POSE[s.slots[i]] : null;
        const t = pose ? s.settle : 0;
        const x = pose ? lerp(rx, pose.x, t) : rx;
        const y = pose ? lerp(ry, pose.y, t) : ry;
        const scale = pose ? lerp(ringScale, pose.scale, t) : ringScale;
        const depth = pose ? lerp(ringDepth, pose.depth, t) : ringDepth;
        const wobble = Math.sin(s.time * 1.3 + i * 2.1) * 10 * s.energy;
        el.setAttribute(
          "transform",
          `translate(${(12 + x * 9).toFixed(2)} ${(12 + y * 9).toFixed(2)}) rotate(${wobble.toFixed(1)}) scale(${(scale * 12).toFixed(2)})`,
        );
        const tn = 0.15 + depth * 0.45;
        el.setAttribute(
          "fill",
          `rgb(${tint(r, tn)},${tint(g, tn)},${tint(b, tn)})`,
        );
        // Dimmer behind: depth reads before occlusion does.
        el.setAttribute("fill-opacity", (0.45 + depth * 0.55).toFixed(2));
        // In the pose the big one draws last, whatever the ring said.
        const key = pose && t > 0.5 ? (s.slots![i] === 0 ? 2 : 0) : z;
        items.push({ el, key, i });
      }

      items.sort((a1, b1) => a1.key - b1.key);
      const order = items.map((it) => it.i).join();
      if (order !== s.order) {
        s.order = order;
        for (const it of items) svg.appendChild(it.el);
      }

      if (
        !spin &&
        Math.abs(s.vel) < 0.01 &&
        Math.abs(rest - s.angle) < 0.002 &&
        s.energy < 0.001 &&
        Math.abs(settleTo - s.settle) < 0.001
      ) {
        return false;
      }
    },
  });

  useEffect(() => {
    loop.start();
  }, [spinning, pulse, color, done, still, loop]);

  return (
    <span
      ref={hostRef}
      aria-hidden
      className={cn("relative inline-block shrink-0", className)}
      style={{ width: size, height: size }}
    >
      {/* React renders these once and never moves them; the frame reorders
          them for depth, which React's reconciler never sees. */}
      <svg
        ref={svgRef}
        viewBox="0 0 24 24"
        className="size-full overflow-visible"
      >
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            ref={(el) => {
              starRefs.current[i] = el;
            }}
            d={SPARKLE}
          />
        ))}
      </svg>
    </span>
  );
}

function Shimmer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { paused, reduced } = useIsland();
  const live = !paused && !reduced;
  return (
    <motion.span
      className={cn("bg-clip-text text-transparent", className)}
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0.6) 38%, #fff 50%, rgba(255,255,255,0.6) 62%, rgba(255,255,255,0.6) 100%)",
        backgroundSize: "250% 100%",
      }}
      animate={{ backgroundPositionX: live ? ["120%", "-20%"] : "0%" }}
      transition={
        live
          ? { duration: 1.8, repeat: Infinity, ease: "linear" }
          : { duration: 0 }
      }
    >
      {children}
    </motion.span>
  );
}

/** Digits roll up on change instead of swapping in place. */
function Ticker({ value }: { value: number }) {
  const { reduced } = useIsland();
  return (
    <span className="relative inline-flex overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={reduced ? false : { y: "80%", opacity: 0 }}
          animate={{ y: "0%", opacity: 1 }}
          exit={reduced ? { opacity: 0 } : { y: "-80%", opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.32, ease: EASE_OUT }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function DrawnCheck({ className }: { className?: string }) {
  const { reduced } = useIsland();
  return (
    <svg
      viewBox="0 0 24 24"
      width={24}
      height={24}
      fill="none"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <motion.path
        d="M5 12.5l4.5 4.5L19 7.5"
        initial={{ pathLength: reduced ? 1 : 0 }}
        animate={{ pathLength: 1 }}
        transition={{
          duration: reduced ? 0 : 0.45,
          ease: EASE_OUT,
          delay: reduced ? 0 : 0.1,
        }}
      />
    </svg>
  );
}

function AgentLeading(o: AgentActivityOptions) {
  const { accent } = useIsland();
  const a = useAgent(o);
  const text = a.done
    ? `All ${a.steps.length} steps done`
    : a.steps[a.current].title;
  return (
    <span className="relative flex items-center gap-2">
      <OrbitSparkles
        color={accent}
        spinning={a.working}
        pulse={a.current}
        done={a.done}
      />
      {/* The pill widens to carry the news, then folds back to the count —
          the shell's layout spring does the widening; this only decides
          when there is something worth saying. */}
      <AnimatePresence mode="popLayout" initial={false}>
        {a.announce && (
          <motion.span
            key={a.current}
            initial={{ opacity: 0, x: -6, filter: "blur(4px)" }}
            animate={{
              opacity: 1,
              x: 0,
              filter: "blur(0px)",
              transition: { duration: 0.3, delay: 0.12, ease: EASE_OUT },
            }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            className="block max-w-[9.5rem] text-[13px] font-medium"
          >
            {a.done ? (
              <span className="block truncate" style={{ color: accent }}>
                {text}
              </span>
            ) : (
              <Shimmer className="block truncate">{text}</Shimmer>
            )}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function AgentTrailing(o: AgentActivityOptions) {
  const { accent } = useIsland();
  const { current, done, steps } = useAgent(o);
  return (
    <span
      className="flex items-center text-sm font-semibold tabular-nums"
      style={{ color: accent }}
    >
      {done ? (
        <DrawnCheck className="size-4" />
      ) : (
        <>
          <Ticker value={current + 1} />/{steps.length}
        </>
      )}
    </span>
  );
}

function Caret() {
  const { paused, reduced } = useIsland();
  const live = !paused && !reduced;
  return (
    <motion.span
      aria-hidden
      className="ml-px inline-block h-[1em] w-[0.45em] translate-y-[0.15em] bg-current"
      animate={{ opacity: live ? [1, 1, 0, 0] : 1 }}
      transition={
        live
          ? {
              duration: 1,
              repeat: Infinity,
              times: [0, 0.5, 0.5, 1],
              ease: "linear",
            }
          : { duration: 0 }
      }
    />
  );
}

function AgentCard(o: AgentActivityOptions) {
  const { accent } = useIsland();
  const a = useAgent(o);
  const status = a.done ? "Done" : a.running ? "Working" : "Paused";
  return (
    <div className="p-5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span
          className="flex items-center gap-1.5 font-medium"
          style={{ color: accent }}
        >
          <OrbitSparkles
            color={accent}
            spinning={a.working}
            pulse={a.current}
            done={a.done}
            size={20}
          />
          {o.agent} · {status}
        </span>
        <span className="text-white/50 tabular-nums">
          {clock(a.spent)} · {tokens(a.tokens)} tokens
        </span>
      </div>
      <p className="mt-2 truncate text-base font-semibold">{o.task}</p>

      <div className="mt-3 flex gap-1" aria-hidden>
        {a.steps.map((s, i) => (
          <span
            key={s.title}
            className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/12"
          >
            <span
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-100 ease-linear"
              style={{
                width: `${(i < a.current ? 1 : i === a.current ? a.progress : 0) * 100}%`,
                backgroundColor: accent,
              }}
            />
          </span>
        ))}
      </div>

      <ol className="mt-3 space-y-1.5">
        {a.steps.map((s, i) => {
          const state =
            i < a.current ? "done" : i === a.current ? "now" : "next";
          // Typed out over the first half of the step, so the line is whole
          // before the step ends rather than finishing as it vanishes.
          const typed = s.detail
            ? s.detail.slice(
                0,
                Math.ceil(s.detail.length * Math.min(1, a.progress * 1.8)),
              )
            : "";
          return (
            <li key={s.title} className="text-sm">
              <div
                className={cn(
                  "flex items-center gap-2",
                  state === "next" ? "text-white/40" : "text-white/90",
                )}
              >
                {state === "done" ? (
                  <Check
                    className="size-4 shrink-0"
                    style={{ color: accent }}
                    strokeWidth={3}
                  />
                ) : state === "now" && a.running ? (
                  <Spinner className="size-4 shrink-0" color={accent} />
                ) : (
                  <Circle className="size-4 shrink-0 opacity-50" />
                )}
                {state === "now" && a.running ? (
                  <Shimmer className="min-w-0 flex-1 truncate">
                    {s.title}
                  </Shimmer>
                ) : (
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                )}
                {state !== "next" && (
                  <span className="shrink-0 text-[11px] text-white/35 tabular-nums">
                    {(state === "done" ? a.durations[i] : a.into).toFixed(1)}s
                  </span>
                )}
              </div>
              {state === "now" && s.detail && (
                <p className="mt-0.5 ml-6 truncate font-mono text-[11px] text-white/45">
                  {typed}
                  {a.running && <Caret />}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      {a.done && (
        <p
          className="mt-3 text-xs font-medium tabular-nums"
          style={{ color: accent }}
        >
          {a.steps.length} steps in {clock(a.spent)} · {tokens(a.tokens)}{" "}
          tokens
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={a.done ? () => a.seek(0) : a.toggle}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-white/12 py-2 text-sm font-medium outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/70"
        >
          {a.done ? (
            <>
              <RotateCcw className="size-4" /> Run again
            </>
          ) : a.running ? (
            <>
              <Pause className="size-3.5 fill-current" /> Pause
            </>
          ) : (
            <>
              <Play className="size-3.5 fill-current" /> Resume
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export function agentActivity(o: AgentActivityOptions): IslandActivity {
  return {
    id: o.id ?? "agent",
    label: `${o.agent}: ${o.task}`,
    leading: <AgentLeading {...o} />,
    trailing: <AgentTrailing {...o} />,
    expanded: <AgentCard {...o} />,
  };
}
