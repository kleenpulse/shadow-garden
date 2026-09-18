// Bridge from the template's CSS tokens to shader uniforms.
//
// The host writes --sg-accent / --sg-bg onto the [data-template] wrapper (and
// can rewrite them live, without a reload — the Shadow Garden bench does this
// on every color drag). CSS picks the change up for free; the WebGPU canvases
// do not, because a uniform is not a var(). This watcher closes that gap: it
// resolves the template's --accent and --background to linear-ish RGB floats
// and re-fires whenever the wrapper's inline style mutates.

export type Rgb = [number, number, number];

export interface TokenColors {
  accent: Rgb;
  background: Rgb;
  reduced: boolean;
}

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_RE = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i;

/** Parse a CSS color (hex or rgb()) into 0–1 floats; null when unparsable. */
export function parseCssColor(raw: string): Rgb | null {
  const value = raw.trim();
  const hex = HEX_RE.exec(value);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    const n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const rgb = RGB_RE.exec(value);
  if (rgb) {
    return [
      Number(rgb[1]) / 255,
      Number(rgb[2]) / 255,
      Number(rgb[3]) / 255,
    ];
  }
  return null;
}

function read(el: HTMLElement, fallbackAccent: Rgb, fallbackBg: Rgb): TokenColors {
  const style = getComputedStyle(el);
  const host = el.closest<HTMLElement>("[data-template]");
  return {
    accent: parseCssColor(style.getPropertyValue("--accent")) ?? fallbackAccent,
    background: parseCssColor(style.getPropertyValue("--background")) ?? fallbackBg,
    reduced: host?.getAttribute("data-motion") === "reduced",
  };
}

/**
 * Watch the resolved token colors above `el`. Fires once immediately, then on
 * every style / data-motion mutation of the [data-template] ancestor. Returns
 * an unsubscribe.
 */
export function watchTemplateTokens(
  el: HTMLElement,
  fallbackAccent: Rgb,
  fallbackBg: Rgb,
  onChange: (colors: TokenColors) => void,
): () => void {
  onChange(read(el, fallbackAccent, fallbackBg));

  const host = el.closest<HTMLElement>("[data-template]");
  if (!host) return () => {};

  const observer = new MutationObserver(() =>
    onChange(read(el, fallbackAccent, fallbackBg)),
  );
  observer.observe(host, {
    attributes: true,
    attributeFilter: ["style", "data-motion"],
  });
  return () => observer.disconnect();
}
