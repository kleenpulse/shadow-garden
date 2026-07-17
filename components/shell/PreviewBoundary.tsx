"use client";

import type { ReactNode } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import PreviewErrorFallback from "./PreviewErrorFallback";
import { logError } from "@/lib/log-error";

// Isolates one live component so a render throw (WebGL context loss, a bad
// tuned prop, a shader compile) shows a fallback in that slot instead of
// blanking the page. `resetKeys` auto-recovers when inputs change — e.g. the
// user switches slug or tweaks the control that caused the throw.
//
// `variant="silent"` still catches and logs, but renders nothing — the right
// call for decorative, aria-hidden backdrops where a visible error card would
// sit behind real content and read as broken.
export default function PreviewBoundary({
	children,
	slug,
	label,
	variant = "stage",
	resetKeys,
	showRetry = true,
}: {
	children: ReactNode;
	slug?: string;
	label?: string;
	variant?: "stage" | "inline" | "silent";
	resetKeys?: unknown[];
	showRetry?: boolean;
}) {
	const name = label ?? slug;

	const renderFallback =
		variant === "silent"
			? () => null
			: ({ error, resetErrorBoundary }: FallbackProps) => (
					<PreviewErrorFallback
						error={error instanceof Error ? error : new Error(String(error))}
						onRetry={resetErrorBoundary}
						variant={variant}
						label={name}
						showRetry={showRetry}
					/>
				);

	return (
		<ErrorBoundary
			resetKeys={resetKeys}
			onError={(error, info) =>
				logError(
					`Preview crashed: ${name ?? "unknown"}`,
					error instanceof Error ? error : new Error(String(error)),
					{ slug, componentStack: info.componentStack },
				)
			}
			fallbackRender={renderFallback}
		>
			{children}
		</ErrorBoundary>
	);
}
