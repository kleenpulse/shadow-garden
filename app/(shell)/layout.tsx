import { Suspense, type ReactNode } from "react";
import { COMMERCE_COMING_SOON, commerceArmed } from "@/lib/capabilities";
import { IS_LOCAL_DEV } from "@/lib/env";
import Sidebar from "@/components/shell/Sidebar";
import MobileBar from "@/components/shell/MobileBar";
import TopBar from "@/components/shell/TopBar";
import CommandMenu from "@/components/shell/CommandMenu";
import ToasterBench from "@/components/shell/ToasterBench";
import SiteFooter from "@/components/shell/SiteFooter";
import CheckoutResult from "@/components/shell/CheckoutResult";
import PricingModal from "@/components/shell/PricingModal";

// The docs shell: sidebar catalog + a slim top bar, wrapping both /components
// and /favorites. The global command palette and toaster mount once here.
//
// `commerce` is an env read, not a cookie read — a build-time constant, so the
// layout stays static and the whole mount matrix is per-deployment: unarmed
// deploys ship no Go Pro, no auth menu, no checkout listener. The modal also
// mounts in local dev so #subscribe is exercisable before any env exists.
export default function ShellLayout({ children }: { children: ReactNode }) {
	const commerce = commerceArmed();
	// Payments switched off but the tier still teased: the Go Pro slot shows a
	// muted marker and the pricing modal renders with disabled CTAs.
	const comingSoon = COMMERCE_COMING_SOON && !commerce;
	return (
		<div className="lg:flex">
			<Sidebar />
			<div className="flex min-h-screen min-w-0 flex-1 flex-col">
				<MobileBar commerce={commerce} />
				<TopBar commerce={commerce} comingSoon={comingSoon} />
				<main className="min-w-0 flex-1 px-3 py-6 lg:px-8 lg:py-10">
					{children}
				</main>
				{/* Client component (i18n needs useTranslations), but the SSR pass is
            always 'en' (see lib/i18n/provider.tsx), so all 18 collection links
            still ship in the static HTML of every shell page — the spokes of
            the hub-and-spoke graph. */}
				<SiteFooter />
			</div>
			<CommandMenu />
			<ToasterBench />
			{(commerce || IS_LOCAL_DEV || comingSoon) && (
				<>
					{/* Reads the URL (nuqs) → must sit under Suspense so the static
					    shell prerender keeps its shape. Hash-driven modal needs none. */}
					<Suspense fallback={null}>
						<CheckoutResult />
					</Suspense>
					<PricingModal comingSoon={comingSoon} />
				</>
			)}
		</div>
	);
}
