import { termAnchor, termDefinition } from "@/lib/cookbook";
import type { ComponentEntry } from "@/lib/registry/types";
import DemonstratedTermsList from "./DemonstratedTermsList";

// The header chips name the motion terms a component demonstrates; this prints
// what they mean. Both sides already exist — `entry.cookbook` declares the terms,
// lib/cookbook.ts defines them — so this is a join, not new copy. It also gives
// every component page a paragraph of genuinely topical text it didn't have, and
// feeds the glossary a deep link from all 70.
//
// The join stays in this server component so lib/cookbook never enters the
// client bundle; the client list only translates the display copy.
export default function DemonstratedTerms({ entry }: { entry: ComponentEntry }) {
	const terms = (entry.cookbook ?? [])
		.map((term) => ({ term, definition: termDefinition(term) }))
		.filter((row): row is { term: string; definition: string } =>
			Boolean(row.definition),
		)
		.map((row) => ({ ...row, anchor: termAnchor(row.term) }));

	if (terms.length === 0) return null;

	return <DemonstratedTermsList rows={terms} />;
}
