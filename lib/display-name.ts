// Shell-only display helper. Deliberately NOT in lib/utils.ts: that file ships to
// customers as the `util` variant behind every `cn` import (§V41), and a
// PascalCase splitter for our own catalog headers is Shadow Garden internals — it
// would paste into a buyer's project as dead code they have to reason about.

/** Registry names are PascalCase ("ScrollVelocity"); uppercase display headers
 *  need word breaks or they render as one run ("SCROLLVELOCITY"). */
export function displayName(name: string) {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}
