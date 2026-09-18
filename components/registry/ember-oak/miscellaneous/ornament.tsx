// The decorative artwork, generated.
//
// The source dressed the page with twenty-odd PNG cutouts: leaves flanking every
// heading, four cocktail glasses, four portraits. None of it was ours to
// redistribute, and none of it needed to be a raster in the first place — they are
// flat, single-colour silhouettes.
//
// So they are drawn instead. Three families, each deterministic from a seed, which
// means the same slot always gets the same ornament across renders, reloads and
// builds. Swapping in real photography later is one component to replace.

type Family = "leaf" | "glass" | "portrait";

/** FNV-1a. Stable across engines, unlike a hand-rolled shift hash. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function leaf(seed: number): string {
  // A frond: a spine with paired blades whose count and splay vary by seed.
  const blades = 5 + (seed % 4);
  const splay = 18 + ((seed >> 3) % 14);
  let d = `<path d="M50 96 C50 70 50 40 50 6" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  for (let i = 0; i < blades; i++) {
    const y = 20 + (i * 62) / blades;
    const span = 30 - i * 2.2;
    d += `<path d="M50 ${y} C${50 - span * 0.6} ${y - splay * 0.35} ${50 - span} ${y - splay * 0.1} ${50 - span * 0.9} ${y + splay * 0.35} C${50 - span * 0.4} ${y + splay * 0.2} ${50 - span * 0.1} ${y + splay * 0.1} 50 ${y}Z" fill="currentColor" opacity="0.85"/>`;
    d += `<path d="M50 ${y} C${50 + span * 0.6} ${y - splay * 0.35} ${50 + span} ${y - splay * 0.1} ${50 + span * 0.9} ${y + splay * 0.35} C${50 + span * 0.4} ${y + splay * 0.2} ${50 + span * 0.1} ${y + splay * 0.1} 50 ${y}Z" fill="currentColor" opacity="0.85"/>`;
  }
  return d;
}

function glass(seed: number): string {
  // Four silhouettes — coupe, highball, rocks, martini — chosen by seed.
  switch (seed % 4) {
    case 0:
      return `<path d="M26 26 H74 C74 48 62 58 52 60 V82 H68 V88 H32 V82 H48 V60 C38 58 26 48 26 26Z" fill="currentColor"/>
              <ellipse cx="50" cy="26" rx="24" ry="4" fill="currentColor" opacity="0.55"/>`;
    case 1:
      return `<path d="M36 12 H64 L61 88 H39 Z" fill="currentColor"/>
              <ellipse cx="50" cy="12" rx="14" ry="3.5" fill="currentColor" opacity="0.55"/>
              <rect x="46" y="4" width="3" height="14" rx="1.5" fill="currentColor" opacity="0.7"/>`;
    case 2:
      return `<path d="M30 34 H70 L66 86 H34 Z" fill="currentColor"/>
              <ellipse cx="50" cy="34" rx="20" ry="4" fill="currentColor" opacity="0.55"/>
              <circle cx="44" cy="52" r="6" fill="currentColor" opacity="0.35"/>`;
    default:
      return `<path d="M22 24 H78 L54 58 V82 H70 V88 H30 V82 H46 V58 Z" fill="currentColor"/>
              <ellipse cx="50" cy="24" rx="28" ry="4" fill="currentColor" opacity="0.55"/>
              <circle cx="64" cy="16" r="5" fill="currentColor" opacity="0.6"/>`;
  }
}

function portrait(seed: number): string {
  // A bust in silhouette. Enough to read as a person at avatar size without
  // pretending to be anyone in particular.
  const shoulder = 30 + (seed % 8);
  return `<circle cx="50" cy="38" r="18" fill="currentColor"/>
          <path d="M${50 - shoulder} 96 C${50 - shoulder} 72 ${50 - 14} 62 50 62 C${50 + 14} 62 ${50 + shoulder} 72 ${50 + shoulder} 96 Z" fill="currentColor" opacity="0.9"/>`;
}

const FAMILIES: Record<Family, (seed: number) => string> = {
  leaf,
  glass,
  portrait,
};

export default function Ornament({
  family,
  seed,
  className,
  flip = false,
}: {
  family: Family;
  /** Any stable string. The same seed always draws the same ornament. */
  seed: string;
  className?: string;
  /** Mirror horizontally — for the leaves that flank a heading in pairs. */
  flip?: boolean;
}) {
  const value = hash(seed);
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="width:100%;height:100%${
    flip ? ";transform:scaleX(-1)" : ""
  }">${FAMILIES[family](value)}</svg>`;

  return (
    <span
      className={className}
      aria-hidden
      // Generated markup, not user content: the only interpolated values are
      // numbers derived from a hash.
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
