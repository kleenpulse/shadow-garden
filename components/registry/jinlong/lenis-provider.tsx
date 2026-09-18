"use client";

import { useLoaderState } from "./hooks/use-loader-state";
import { ReactLenis, useLenis } from "lenis/react";

export const LenisProvider = ({ children }: { children: React.ReactNode }) => {
	const { isLoaded } = useLoaderState();

	return <ReactLenis root={isLoaded}>{children}</ReactLenis>;
};
