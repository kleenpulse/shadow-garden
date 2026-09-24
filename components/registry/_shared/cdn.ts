// Every image, video, font and model a template renders resolves through here.
//
// This file SHIPS — it is a peer variant on every landing-page entry, so a buyer
// who copies a template copies this too. That is the whole point: the repo holds
// zero binaries (SPEC §C12), and swapping the delivery account is one environment
// variable rather than a find-and-replace across forty files.
//
// Client-safe by construction. The Cloudinary API key and secret are used only by
// scripts/templates/upload-assets.ts, which never runs in a request (§V64).

/**
 * Delivery base, including the cloud name — e.g.
 * `https://res.cloudinary.com/shadow-garden`.
 *
 * Falls back to the Motion Garden account so a freshly-pasted template renders
 * before the buyer has configured anything. Point it at your own cloud, re-upload
 * the assets, and nothing else in the template changes.
 */
export const TEMPLATE_CDN =
  process.env.NEXT_PUBLIC_TEMPLATE_CDN ?? "https://res.cloudinary.com/shadow-garden";

export type AssetKind = "image" | "video" | "raw";

/**
 * Per-kind delivery defaults. `f_auto,q_auto` is what makes an 8MB PNG arrive as
 * a 90KB AVIF, so it is on by default rather than opt-in — a caller who forgets it
 * would ship the original bytes and never notice locally.
 *
 * `raw` takes none: a .glb is not transcodable, and a transform segment on a raw
 * URL is a 404, not a no-op.
 */
const DEFAULT_TRANSFORM: Record<AssetKind, string> = {
  image: "f_auto,q_auto",
  video: "f_auto,q_auto,vc_auto",
  raw: "",
};

export interface AssetOptions {
  kind?: AssetKind;
  /**
   * Extra Cloudinary transform, appended to the per-kind default —
   * `"w_1600,c_fill"`, `"e_grayscale"`. Ignored for `raw`.
   */
  transform?: string;
}

/**
 * Build a delivery URL for an uploaded asset.
 *
 * `asset("vellum/hero-plate")` → `.../image/upload/f_auto,q_auto/vellum/hero-plate`
 *
 * Public ids carry no extension — Cloudinary picks the format from `f_auto` and
 * what the browser accepts. A leading slash is tolerated and stripped, because
 * `/vellum/x` is the shape everyone types out of muscle memory and a double slash
 * silently 404s.
 */
export function asset(publicId: string, options: AssetOptions = {}): string {
  const kind = options.kind ?? "image";
  const id = publicId.replace(/^\/+/, "");
  const parts = [DEFAULT_TRANSFORM[kind], options.transform]
    .filter((part): part is string => Boolean(part))
    .join(",");
  const segment = parts ? `${parts}/` : "";
  return `${TEMPLATE_CDN}/${kind}/upload/${segment}${id}`;
}

/** `asset()` with `kind: "video"`. */
export function videoAsset(publicId: string, transform?: string): string {
  return asset(publicId, { kind: "video", transform });
}

/** `asset()` with `kind: "raw"` — .glb, .bin, .woff2. No transform segment. */
export function rawAsset(publicId: string): string {
  return asset(publicId, { kind: "raw" });
}
