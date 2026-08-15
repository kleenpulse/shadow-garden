"use client";

import {
	createContext,
	useCallback,
	useContext,
	useLayoutEffect,
	useState,
} from "react";
import { NextIntlClientProvider } from "next-intl";
import {
	DEFAULT_LOCALE,
	type Locale,
	readStoredLocale,
	resolveBrowserLocale,
	writeStoredLocale,
} from "./config";
import { MESSAGES } from "./messages";

type I18nContextValue = {
	locale: Locale;
	setLocale: (next: Locale) => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * SSR and the first client render are always 'en' (hydration-safe); the real
 * locale resolves in a layout effect — before paint — from localStorage →
 * navigator.languages → 'en'. Messages are bundled, so switching is one
 * synchronous state swap: no fetch, no reload, no flash.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
	const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

	const applyLocale = useCallback((next: Locale) => {
		setLocaleState(next);
		document.documentElement.lang = next;
		writeStoredLocale(next);
	}, []);

	useLayoutEffect(() => {
		const resolved =
			readStoredLocale() ?? resolveBrowserLocale(navigator.languages);
		if (resolved !== DEFAULT_LOCALE) applyLocale(resolved);
	}, [applyLocale]);

	return (
		<I18nContext.Provider value={{ locale, setLocale: applyLocale }}>
			<NextIntlClientProvider
				locale={locale}
				messages={MESSAGES[locale]}
				timeZone="UTC"
			>
				{children}
			</NextIntlClientProvider>
		</I18nContext.Provider>
	);
}

export function useI18n(): I18nContextValue {
	const ctx = useContext(I18nContext);
	if (!ctx) throw new Error("useI18n must be used within I18nProvider");
	return ctx;
}

export function useLocale(): Locale {
	return useI18n().locale;
}

/** The one switch path (picker, anywhere else). Purely client-side —
 *  localStorage persistence only, no backend. */
export function useSetLocale(): (next: Locale) => void {
	return useI18n().setLocale;
}
