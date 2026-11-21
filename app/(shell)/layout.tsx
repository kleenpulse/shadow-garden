import type { ReactNode } from "react";
import Sidebar from "@/components/shell/Sidebar";
import MobileBar from "@/components/shell/MobileBar";
import TopBar from "@/components/shell/TopBar";
import CommandMenu from "@/components/shell/CommandMenu";
import ToasterBench from "@/components/shell/ToasterBench";
import SiteFooter from "@/components/shell/SiteFooter";
import AgentPanel from "@/components/agent/AgentPanel";

// The docs shell: sidebar catalog + a slim top bar, wrapping both /components
// and /favorites. The global command palette, toaster and the open agentic web
// assistant (components/agent/AgentPanel.tsx) mount once here.
export default function ShellLayout({ children }: { children: ReactNode }) {
	return (
		<div className="lg:flex">
			<Sidebar />
			{/* data-shell-content: the column the docked assistant drawer pushes aside
			    on wide screens (globals.css, components/agent/AgentPanel.tsx). */}
			<div data-shell-content className="flex min-h-screen min-w-0 flex-1 flex-col">
				<MobileBar />
				<TopBar />
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
			<AgentPanel />
		</div>
	);
}
