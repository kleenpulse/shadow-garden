import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Mono } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "@/components/theme-provider";
import { RouteProgress } from "@/components/providers/route-progress";
import { IntroOverlay } from "@/components/intro/IntroOverlay";
import { DevFab } from "@/components/dev/DevFab";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

// Display + control readouts share one mono voice — the instrument signature.
const spaceMono = Space_Mono({
	variable: "--font-space-mono",
	subsets: ["latin"],
	weight: ["400", "700"],
});

export const metadata: Metadata = {
	title: {
		default: "Shadow Garden",
		template: "%s — Shadow Garden",
	},
	description:
		"A tunable gallery of animation-forward React components. Preview live, dial in the parameters, copy the source.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			// Next 16 no longer forces smooth scroll unless opted in via this attribute.
			data-scroll-behavior="smooth"
			// next-themes stamps the theme class before hydration — expected mismatch.
			suppressHydrationWarning
			className={`${geistSans.variable} ${geistMono.variable} ${spaceMono.variable} h-full antialiased`}
		>
			<body className="min-h-full flex flex-col font-sans">
				{/* Pre-paint: restore the persisted sidebar width into a CSS var before
            first paint so a resized sidebar renders at its saved width, no flash.
            Reads the same zustand-persist key/shape + clamps as lib/store.ts. */}
				<script
					dangerouslySetInnerHTML={{
						__html:
							"try{var s=JSON.parse(localStorage.getItem('sg-ui'));var w=Math.min(480,Math.max(220,(s&&s.state&&+s.state.sidebarWidth)||288));document.documentElement.style.setProperty('--sg-sidebar-w',w+'px')}catch(e){}",
					}}
				/>
				{/* Pre-paint: stamp html[data-sg-intro] when this session hasn't played
            the intro (or ?sg-intro forces a replay). globals.css keys the
            overlay's visibility + scroll lock off the attribute, so the first
            paint shows the wordmark with zero flash of page content, and a
            played session never paints the overlay at all. */}
				<script
					dangerouslySetInnerHTML={{
						__html:
							"try{var ip=false;try{ip=sessionStorage.getItem('sg-intro-v1')==='1'}catch(e){}if(!ip||location.search.indexOf('sg-intro')>-1){document.documentElement.setAttribute('data-sg-intro','')}}catch(e){}",
					}}
				/>
				<ThemeProvider
					attribute="class"
					defaultTheme="dark"
					enableSystem={false}
					disableTransitionOnChange
				>
					<RouteProgress>
						<IntroOverlay />
						<NuqsAdapter>{children}</NuqsAdapter>
						{process.env.NODE_ENV === "development" && <DevFab />}
					</RouteProgress>
				</ThemeProvider>
			</body>
		</html>
	);
}
