"use client";

import { ReactLenis } from "lenis/react";

export const LenisProvider = ({ children }: { children: React.ReactNode }) => {
	return <ReactLenis root>{children}</ReactLenis>;
};
