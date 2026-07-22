"use client";

import { useEffect, useState } from "react";

// Module-scoped so every caller in a page load shares one /api/entitlement
// round-trip instead of each client island firing its own. A real upgrade
// always lands via CheckoutResult's hard reload (window.location.assign), so
// this cache never needs to be invalidated mid-session.
let cached: Promise<boolean> | null = null;

function fetchPro(): Promise<boolean> {
	if (!cached) {
		cached = fetch("/api/entitlement", { cache: "no-store" })
			.then((r) => (r.ok ? r.json() : { pro: false }))
			.then((d) => Boolean(d?.pro))
			.catch(() => false);
	}
	return cached;
}

/** Client-side Pro entitlement lookup — the seam GoProButton introduced,
 * shared with any other client island that needs to gate on Pro status.
 * null = still resolving; gated UI should stay neutral until it settles. */
export function usePro(): boolean | null {
	const [pro, setPro] = useState<boolean | null>(null);

	useEffect(() => {
		let active = true;
		fetchPro().then((p) => {
			if (active) setPro(p);
		});
		return () => {
			active = false;
		};
	}, []);

	return pro;
}
