import { ImageResponse } from "next/og";

// Generated rather than checked in as a binary, so the mark stays in one place:
// change the two dial positions here and app/icon.svg together.
//
// No `export const runtime` — `cacheComponents: true` fails the build on a
// route-segment runtime export, and ImageResponse runs fine on Node in Next 16.

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
	return new ImageResponse(
		(
			<div
				style={{
					width: "100%",
					height: "100%",
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					gap: 22,
					background: "#0a0b0c",
				}}
			>
				{[0, 1].map((row) => (
					<div
						key={row}
						style={{
							position: "relative",
							display: "flex",
							width: 124,
							height: 22,
							borderRadius: 11,
							background: "#1c1f22",
						}}
					>
						<div
							style={{
								position: "absolute",
								top: -6,
								left: row === 0 ? 12 : 68,
								width: 34,
								height: 34,
								borderRadius: 17,
								background: "#a855f7",
							}}
						/>
					</div>
				))}
			</div>
		),
		size,
	);
}
