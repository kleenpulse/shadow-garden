// The decode charset — cryptic glyphs a scramble draws from before a string
// resolves to its true form. Shared by the living Wordmark and the section-rail
// tooltip so the two flourishes speak the same visual language.
export const SCRAMBLE = "!<>-_\\/[]{}=+*^?#§%";

export const scrambleChar = (): string =>
	SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)];
