import { ImageResponse } from "next/og";
import { registry } from "@/lib/registry";
import { SITE_NAME } from "@/lib/site";

// The brand card. Shared by every route that doesn't ship its own.
//
// Deliberately on satori's bundled font rather than Space Mono: loading the real
// display face means fetching a .ttf at build time, which makes the build depend on
// a network round-trip that can fail. The bench identity survives on colour, rule
// weight and letter-spacing alone. If the font ever becomes worth it, read it off
// disk with `process.cwd()` — never fetch it.
//
// No `export const runtime` — `cacheComponents: true` fails the build on a
// route-segment runtime export. This route is `ƒ` (on demand) for the same reason
// the per-component card is; see the note there before trying to make it static.

export const alt = `${SITE_NAME} — animated React components, live and tunable`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BENCH = "#0a0b0c";
const PANEL = "#0e1012";
const HAIRLINE = "#1c1f22";
const INK = "#e2e6e9";
const INK_DIM = "#9aa1a8";
const ACCENT = "#a855f7";

export default function Image() {
	const total = registry.length;
	const free = registry.filter((entry) => entry.tier === "free").length;

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
						<div
							style={{
								display: "flex",
								fontSize: 22,
								letterSpacing: 8,
								textTransform: "uppercase",
								color: INK_DIM,
							}}
						>
							Component Registry
						</div>
						<div style={{ display: "flex", marginTop: 40, fontSize: 96, fontWeight: 700, letterSpacing: -2 }}>
							<span style={{ color: INK }}>Shadow</span>
							<span style={{ color: ACCENT, marginLeft: 24 }}>Garden</span>
						</div>
						<div
							style={{
								display: "flex",
								marginTop: 28,
								fontSize: 34,
								lineHeight: 1.35,
								color: INK_DIM,
								maxWidth: 880,
							}}
						>
							Animated React components, exhibited live on the page they power.
							Every parameter is a dial.
						</div>
					</div>

					<div style={{ display: "flex", flexDirection: "column" }}>
						<div style={{ display: "flex", height: 1, background: HAIRLINE, marginBottom: 28 }} />
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 20,
								fontSize: 24,
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
								{total} components
							</div>
							<div style={{ display: "flex" }}>{free} free</div>
							<div style={{ display: "flex", color: HAIRLINE }}>·</div>
							<div style={{ display: "flex" }}>React · Next.js · TypeScript</div>
						</div>
					</div>
				</div>
			</div>
		),
		size,
	);
}
