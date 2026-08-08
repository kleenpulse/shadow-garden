import { ImageResponse } from "next/og";
import { getEntry } from "@/lib/registry";
import { displayName } from "@/lib/display-name";

// One card per component. A registry of visual motion that shares as a bare text
// link is throwing away the only thing it sells, so every one of the 70 detail
// pages gets its own.
//
// This route renders on demand (`ƒ` in the build output), and under Cache
// Components that is the only option — verified, not assumed:
//   - `"use cache"` is illegal here. It requires a serializable return value and
//     ImageResponse is a streaming Response.
//   - `export const dynamic`/`runtime` breaks the build outright with
//     `cacheComponents: true`.
//   - `generateStaticParams` does not prerender an image route under Cache
//     Components. Measured, not assumed: adding it takes the build from 163 to 233
//     "static pages" — exactly 70 more — and writes ZERO image artifacts to
//     `.next/server`, leaving the route `ƒ` regardless. It is 70 units of build
//     work for nothing, which is why it is not here.
// The cost is bounded: a social crawler fetches a given card a handful of times
// ever, and the CDN caches the PNG in front of this.
//
// An unknown slug falls through to the brand card rather than erroring — the page
// itself already 404s, and an OG route is not the place to litigate routing.
//
// Font notes: see app/opengraph-image.tsx.

export const alt = "Shadow Garden component";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BENCH = "#0a0b0c";
const PANEL = "#0e1012";
const HAIRLINE = "#1c1f22";
const INK = "#e2e6e9";
const INK_DIM = "#9aa1a8";
const ACCENT = "#a855f7";

export default async function Image({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	// Next 16: params is a Promise and must be awaited.
	const { slug } = await params;
	const entry = getEntry(slug);

	const name = entry ? displayName(entry.name) : "Shadow Garden";
	const category = entry?.category ?? "Component Registry";
	const description = entry?.description ?? "";
	const propCount = entry?.props.length ?? 0;

	return new ImageResponse(
		(
			<div
				style={{
					width: "100%",
					height: "100%",
					display: "flex",
					background: BENCH,
					color: INK,
					padding: 64,
				}}
			>
				<div style={{ display: "flex", width: 8, background: ACCENT, borderRadius: 4 }} />
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						justifyContent: "space-between",
						flex: 1,
						paddingLeft: 48,
					}}
				>
					<div style={{ display: "flex", flexDirection: "column" }}>
						<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
							<div
								style={{
									display: "flex",
									fontSize: 22,
									letterSpacing: 8,
									textTransform: "uppercase",
									color: ACCENT,
								}}
							>
								{category}
							</div>
						</div>

						<div
							style={{
								display: "flex",
								marginTop: 36,
								fontSize: name.length > 18 ? 76 : 96,
								fontWeight: 700,
								letterSpacing: -1,
								textTransform: "uppercase",
							}}
						>
							{name}
						</div>

						<div
							style={{
								display: "flex",
								marginTop: 26,
								fontSize: 32,
								lineHeight: 1.35,
								color: INK_DIM,
								maxWidth: 900,
							}}
						>
							{description}
						</div>
					</div>

					<div style={{ display: "flex", flexDirection: "column" }}>
						<div style={{ display: "flex", height: 1, background: HAIRLINE, marginBottom: 28 }} />
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 20,
								fontSize: 23,
								letterSpacing: 3,
								textTransform: "uppercase",
								color: INK_DIM,
							}}
						>
							<div
								style={{
									display: "flex",
									padding: "10px 20px",
									borderRadius: 8,
									background: PANEL,
									border: `1px solid ${HAIRLINE}`,
									color: INK,
								}}
							>
								Shadow Garden
							</div>
							{propCount > 0 && <div style={{ display: "flex" }}>{propCount} tunable props</div>}
							<div style={{ display: "flex", color: HAIRLINE }}>·</div>
							<div style={{ display: "flex" }}>Live preview</div>
						</div>
					</div>
				</div>
			</div>
		),
		size,
	);
}
