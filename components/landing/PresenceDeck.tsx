"use client";

import { useOnlineCount } from "@/hooks/use-online-count";

// Live presence readout, updating over the Supabase Realtime websocket. Renders
// nothing until Supabase is configured (dormancy); the server gate in app/page.tsx
// already omits the surrounding band in that case, but self-gating keeps this
// island honest wherever it's mounted.
export default function PresenceDeck() {
  const { configured, ready, total } = useOnlineCount();

  if (!configured) return null;

  return (
    <div className="grid gap-3">
      <PresenceCard label="Online now" count={total} ready={ready} accent />
    </div>
  );
}

function PresenceCard({
  label,
  count,
  ready,
  accent = false,
}: {
  label: string;
  count: number;
  ready: boolean;
  accent?: boolean;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-hairline bg-panel p-4">
      <div className="flex items-center gap-2">
        <span
          className={`size-1.5 rounded-full motion-safe:animate-pulse ${
            accent ? "bg-accent" : "bg-ink-mute"
          }`}
          aria-hidden
        />
        <span className="font-display text-[10px] uppercase tracking-[0.12em] text-ink-mute">
          {label}
        </span>
      </div>
      {ready ? (
        <span
          className={`font-display text-4xl tabular-nums ${
            accent ? "text-accent" : "text-ink"
          }`}
        >
          {count}
        </span>
      ) : (
        <span className="h-10 w-10 animate-pulse rounded bg-raised/60" aria-hidden />
      )}
    </article>
  );
}
