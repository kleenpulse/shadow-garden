// Structured error logging for render failures caught by <PreviewBoundary>
// and the route error boundary. Dev → console; prod → monitoring stub (no-op
// until a service is wired in). Generalized from the deepellum-admin auth
// logger — no auth coupling, safe to call from client or server.

export interface ErrorLog {
	timestamp: number;
	errorType: string;
	message: string;
	stack?: string;
	context: Record<string, unknown>;
}

// Placeholder for a real monitoring integration (Sentry, etc.).
function sendToMonitoring(_log: ErrorLog): void {
	// TODO: Sentry.captureException(new Error(_log.message), { extra: _log.context })
}

export function logError(
	message: string,
	error: Error,
	context?: Record<string, unknown>,
): void {
	const log: ErrorLog = {
		timestamp: Date.now(),
		errorType: error.name,
		message: error.message,
		stack: error.stack,
		context: {
			...context,
			route:
				typeof window !== "undefined" ? window.location.pathname : undefined,
		},
	};

	if (process.env.NODE_ENV === "production") {
		sendToMonitoring(log);
	} else {
		console.error(`[Shadow Garden] ${message}`, {
			type: log.errorType,
			message: log.message,
			stack: log.stack,
			context: log.context,
		});
	}
}
