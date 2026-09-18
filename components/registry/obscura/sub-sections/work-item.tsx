import { cn } from "@/lib/utils";
import { asset } from "../../_shared/cdn";
import GalleryCanvas from "../gfx/gallery-canvas";
import type { WORK } from "../lib/constants";

// One print on the wall: the picture plane (WebGPU when available, a plain
// img with a CSS hover otherwise) and a caption row set like a gallery label.

type Work = (typeof WORK.items)[number];

type WorkItemProps = {
  work: Work;
  /** Alternating orientations keep the wall from becoming a grid of clones. */
  orientation: "portrait" | "landscape";
};

export default function WorkItem({ work, orientation }: WorkItemProps) {
  return (
    <figure className="group">
      <GalleryCanvas
        src={asset(work.id, { transform: "w_1600" })}
        alt={work.alt}
        className={cn(
          "w-full rounded-[var(--radius)]",
          orientation === "portrait" ? "aspect-4/5" : "aspect-3/2",
        )}
      />
      <figcaption className="mt-4 flex items-baseline justify-between gap-4 border-t border-[var(--border)] pt-3">
        <span className="flex items-baseline gap-3">
          <span className="font-[family-name:var(--font-body)] text-xs text-[var(--accent)]">
            {work.index}
          </span>
          <span className="font-[family-name:var(--font-display)] text-lg text-[var(--foreground)] transition-colors duration-300 group-hover:text-[var(--accent)]">
            {work.title}
          </span>
        </span>
        <span className="font-[family-name:var(--font-body)] text-xs tracking-[0.15em] text-[var(--muted-foreground)] uppercase">
          {work.meta}
        </span>
      </figcaption>
    </figure>
  );
}
