import type { Metadata } from "next";
import { registry } from "@/lib/registry";
import NotFoundContent from "./_components/not-found-content";

// Next returns a real 404 status for this route, which is what matters — a soft
// 404 (200 + "not found" copy) gets the URL indexed as a thin page. The links are
// here so a crawler that lands on a dead URL still finds its way into the catalog
// instead of hitting a wall.
//
// No `robots` key: Next already emits `<meta name="robots" content="noindex">` on
// a not-found render, and declaring it again ships the tag twice.
export const metadata: Metadata = {
	title: "Not Found",
};

export default function NotFound() {
	return <NotFoundContent total={registry.length} />;
}
