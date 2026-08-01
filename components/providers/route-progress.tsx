"use client";

import { ProgressProvider } from "@bprogress/next/app";

// Client boundary for BProgress. The package ships no "use client" banner, so the
// root layout can't import it directly and stay a Server Component.
//
// `color` is interpolated straight into `.bar { background: … }`, which accepts an
// <image> — so a gradient works where a bare hex is expected. The same value also
// feeds the peg's box-shadow, where a gradient is invalid and kills the glow; that
// one declaration is restored in globals.css.
const BAR_GRADIENT = "linear-gradient(90deg, #f754f1 0%, #6d28d9 50%, #22d3ee 100%)";

export function RouteProgress({ children }: { children: React.ReactNode }) {
	return (
		<ProgressProvider height="3px" color={BAR_GRADIENT} options={{ showSpinner: false }}>
			{children}
		</ProgressProvider>
	);
}
