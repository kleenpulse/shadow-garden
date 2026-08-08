import { type ReactNode } from "react";
import Sidebar from "@/components/shell/Sidebar";
import MobileBar from "@/components/shell/MobileBar";
import TopBar from "@/components/shell/TopBar";
import CommandMenu from "@/components/shell/CommandMenu";
import ToasterBench from "@/components/shell/ToasterBench";
import SiteFooter from "@/components/shell/SiteFooter";

// The docs shell: sidebar catalog + a slim top bar, wrapping both /components
// and /favorites. The global command palette and toaster mount once here.
export default function ShellLayout({ children }: { children: ReactNode }) {
	return (
		<div className="lg:flex">
			<Sidebar />
			<div className="flex min-h-screen min-w-0 flex-1 flex-col">
				<MobileBar />
				<TopBar />
				<main className="min-w-0 flex-1 px-3 py-6 lg:px-8 lg:py-10">
					{children}
				</main>
				{/* Server rendered, so all 18 collection links ship in the static HTML
            of every shell page — the spokes of the hub-and-spoke graph. */}
				<SiteFooter />
			</div>
			<CommandMenu />
			<ToasterBench />
		</div>
	);
}
