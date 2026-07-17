"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => /mac/i.test(navigator.platform || navigator.userAgent);
// SSR renders the non-mac label; hydrated clients correct it without a mismatch.
const getServerSnapshot = () => false;

export function useIsMac(): boolean {
	return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
