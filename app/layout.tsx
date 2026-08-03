import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Mono } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "@/components/theme-provider";
import { RouteProgress } from "@/components/providers/route-progress";
import { IntroOverlay } from "@/components/intro/IntroOverlay";
import { DevFab } from "@/components/dev/DevFab";
import JsonLd from "@/components/seo/JsonLd";
import { siteSchema } from "@/lib/schema";
import {
	SITE_DESCRIPTION,
	SITE_NAME,
	SITE_TAGLINE,
	SITE_URL,
} from "@/lib/site";
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

// No `alternates.canonical` here on purpose. Metadata merges shallowly, so a
// canonical on the root layout is inherited by every page that doesn't set its own
// — pointing all 74 URLs at `/` and suppressing the lot. Each page declares its
// own; a future page that forgets gets no canonical (neutral) rather than the
// wrong one (fatal).
export const metadata: Metadata = {
	metadataBase: new URL(SITE_URL),
	title: {
		default: `${SITE_TAGLINE} — ${SITE_NAME}`,
		template: `%s — ${SITE_NAME}`,
	},
	description: SITE_DESCRIPTION,
	applicationName: SITE_NAME,
	authors: [{ name: SITE_NAME, url: SITE_URL }],
	creator: SITE_NAME,
	publisher: SITE_NAME,
	keywords: [
		"react animation components",
		"react component library",
		"animated react components",
		"framer motion components",
		"webgl background react",
		"next.js components",
		"tailwind components",
		"react ui components",
		"motion design system",
		"typescript react components",
	],
	openGraph: {
		type: "website",
		siteName: SITE_NAME,
		locale: "en_US",
		url: SITE_URL,
		title: `${SITE_TAGLINE} — ${SITE_NAME}`,
		description: SITE_DESCRIPTION,
	},
	twitter: {
		card: "summary_large_image",
		title: `${SITE_TAGLINE} — ${SITE_NAME}`,
		description: SITE_DESCRIPTION,
	},
	robots: {
		index: true,
		follow: true,
		googleBot: { index: true, follow: true, "max-image-preview": "large" },
	},
	formatDetection: { telephone: false, address: false, email: false },
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
				{/* Who the site is, on every route. Static data, so it lands in the
				    prerendered shell rather than streaming in behind a boundary. */}
				<JsonLd data={siteSchema()} />
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
