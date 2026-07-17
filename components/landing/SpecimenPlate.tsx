import { cn } from "@/lib/utils";

// Instrument-log specimen plate: `EXHIBIT α-01 · BACKGROUNDS · 7 UNITS`.
// Server component — pure microtype between hairline rules.
export default function SpecimenPlate({
  greek,
  index,
  label,
  meta,
  className,
}: {
  greek: string;
  index: string;
  label: string;
  meta?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline gap-3 border-y border-hairline py-2 font-display text-[10px] uppercase tracking-[0.28em] text-ink-mute",
        className,
      )}
    >
      {/* normal-case keeps the glyph a lowercase Greek letter — uppercase would
          turn α into Α, which reads as a Latin A. */}
      <span className="text-accent">
        Exhibit <span className="normal-case">{greek}</span>-{index}
      </span>
      <span aria-hidden>·</span>
      <span className="text-ink-dim">{label}</span>
      {meta ? (
        <>
          <span aria-hidden>·</span>
          <span>{meta}</span>
        </>
      ) : null}
    </div>
  );
}
