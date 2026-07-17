"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/shell/ThemeToggle";
import Wordmark from "@/components/Wordmark";
import { cn } from "@/lib/utils";

// Fixed landing header: wordmark + theme control in one bar. Transparent over
// the hero, then gains a blurred surface once scrolled so it stays legible
// against the lighter content below.
export default function LandingHeader() {
	const [scrolled, setScrolled] = useState(false);

	useEffect(() => {
		const onScroll = () => setScrolled(window.scrollY > 24);
		onScroll();
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	return (
		<div
			className={cn(
				"fixed inset-x-0 top-0 z-50 flex items-center justify-between px-6 py-4 transition-colors duration-300 sm:pl-8",
				scrolled
					? " bg-surface/70 dark:bg-surface/40 backdrop-blur-xl"
					: "bg-transparent",
			)}
		>
			<Link href="/components" className="inline-flex items-baseline">
				<Wordmark size="sm" boldSecond />
			</Link>
			<ThemeToggle />
		</div>
	);
}
