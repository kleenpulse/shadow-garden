import type { Locale } from "../config";
import en from "./en.json";
import es from "./es.json";
import fr from "./fr.json";
import ja from "./ja.json";
import zh from "./zh.json";
import ar from "./ar.json";

export type Messages = typeof en;

/** `satisfies` doubles as a compile-time key-parity check: a key missing from
 *  any sibling catalog is a tsc error (`bun run check` gate). */
export const MESSAGES = { en, es, fr, ja, zh, ar } satisfies Record<
	Locale,
	Messages
>;
