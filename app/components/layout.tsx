import type { ReactNode } from "react";
import Sidebar from "@/components/shell/Sidebar";
import MobileBar from "@/components/shell/MobileBar";

export default function ComponentsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="lg:flex">
      <Sidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <MobileBar />
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
