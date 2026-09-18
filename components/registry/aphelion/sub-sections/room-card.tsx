import { cn } from "@/lib/utils";
import type { ROOMS } from "../lib/constants";

// One room. The "window" at the top is pure CSS — a gradient night sky per
// orientation, painted in template.css — because a template that promises
// zero image assets has to keep that promise in its most tempting spot.

type Room = (typeof ROOMS.items)[number];

export default function RoomCard({ room }: { room: Room }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--background)_82%,white_3%)] transition-colors duration-300 hover:border-[color-mix(in_srgb,var(--accent)_45%,var(--border))]">
      <div
        aria-hidden="true"
        className={cn(
          "aphelion-window h-48 w-full transition-transform duration-700 group-hover:scale-[1.03]",
          room.sky === "east" && "aphelion-window-east",
          room.sky === "south" && "aphelion-window-south",
          room.sky === "zenith" && "aphelion-window-zenith",
        )}
      />
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-[family-name:var(--font-display)] text-xl text-[var(--foreground)]">
            {room.name}
          </h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            <span className="text-[var(--foreground)]">{room.price}</span> /{" "}
            {room.unit}
          </p>
        </div>
        <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--muted-foreground)]">
          {room.description}
        </p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {room.features.map((feature) => (
            <li
              key={feature}
              className="rounded-[calc(var(--radius)*0.75)] border border-[var(--border)] px-2.5 py-1 text-[11px] tracking-wide text-[var(--muted-foreground)] uppercase"
            >
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
