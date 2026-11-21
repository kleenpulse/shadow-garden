import type { Metadata } from "next";
import AskView from "./_components/AskView";

export const metadata: Metadata = {
	title: "Ask the Garden",
	description:
		"Find, tune and grab Motion Garden components by asking. The assistant runs in your browser, on the AI provider and key you choose, and other sites can call it as an open agentic web peer.",
	alternates: { canonical: "/ask" },
};

export default function AskPage() {
	return <AskView />;
}
