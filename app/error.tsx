"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import PreviewErrorFallback from "@/components/shell/PreviewErrorFallback";
import { logError } from "@/lib/log-error";

// Route-level backstop. The per-component <PreviewBoundary>s catch throws inside
// live previews; this catches anything that escapes to the server-rendered route
// (the landing page is a server component). One file at the app root covers the
// (shell) and (fullscreen) groups, which inherit it.
//
// Next 16.2 recovery is `unstable_retry` (re-fetch + re-render); `reset` remains
// as a fallback for older/edge cases. See next/dist/docs .../file-conventions/error.md.
export default function RouteError({
	error,
	unstable_retry,
	reset,
}: {
	error: Error & { digest?: string };
	unstable_retry?: () => void;
	reset?: () => void;
}) {
	useEffect(() => {
		logError("Route error", error, { digest: error.digest });
	}, [error]);

	const retry = unstable_retry ?? reset ?? (() => {});

	return (
		<div className="grid min-h-[70svh] place-items-center p-6">
			<div className="w-full max-w-md">
				<PreviewErrorFallback error={error} onRetry={retry} variant="stage" />
			</div>
		</div>
	);
}
