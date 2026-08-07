import ts from "typescript";

// Finds SVG <filter> elements that displace pixels but never declare their own
// region. AST rather than text search, for the same reason as loop-usage.ts: two
// entries describe this exact defect in a doc comment, and a grep would count
// the prose.
//
// The default filter region is `-10% -10% 120% 120%` of the element's box, not
// the box. Out in that skirt the displacement map does not exist, and a filter
// input that is not there is premultiplied transparent black — which is not
// "no displacement". Read straight it gives R=G=0, i.e. maximum displacement in
// the negative direction; run through an arithmetic composite with a constant
// term it lands on 0.5 premultiplied, which un-premultiplies to R=G=1 and is
// maximum displacement the other way. Either way the skirt samples the source
// half a scale inside the box and paints a copy of the element's own edge around
// it. Shipped twice — mirage and lens (§B18, §B20).
//
// Scoped to filters that actually displace on purpose. A threshold or a blur
// reads its own input, which exists across the whole region, so the default
// costs it nothing; morphing-text is legitimately unpinned.

export interface FilterRegions {
  /** `<filter>` elements whose subtree contains an `feDisplacementMap`. */
  displacementFilters: number;
  /**
   * One entry per displacing filter that omits any of x/y/width/height, listing
   * the attributes it omits.
   */
  unpinned: string[];
}

const REGION_ATTRS = ["x", "y", "width", "height"] as const;

export function parseFilterRegions(fileName: string, text: string): FilterRegions {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const tagName = (node: ts.Node): string | null => {
    if (ts.isJsxElement(node)) {
      const name = node.openingElement.tagName;
      return ts.isIdentifier(name) ? name.text : null;
    }
    if (ts.isJsxSelfClosingElement(node)) {
      return ts.isIdentifier(node.tagName) ? node.tagName.text : null;
    }
    return null;
  };

  const containsDisplacement = (node: ts.Node): boolean => {
    let found = false;
    const walk = (n: ts.Node) => {
      if (found) return;
      if (tagName(n) === "feDisplacementMap") {
        found = true;
        return;
      }
      ts.forEachChild(n, walk);
    };
    ts.forEachChild(node, walk);
    return found;
  };

  const missingRegionAttrs = (opening: ts.JsxOpeningLikeElement): string[] =>
    REGION_ATTRS.filter(
      (attr) =>
        !opening.attributes.properties.some(
          (p) =>
            ts.isJsxAttribute(p) &&
            ts.isIdentifier(p.name) &&
            p.name.text === attr,
        ),
    );

  let displacementFilters = 0;
  const unpinned: string[] = [];

  const visit = (node: ts.Node): void => {
    if (tagName(node) === "filter" && ts.isJsxElement(node)) {
      if (containsDisplacement(node)) {
        displacementFilters++;
        const missing = missingRegionAttrs(node.openingElement);
        if (missing.length > 0) unpinned.push(missing.join(", "));
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return { displacementFilters, unpinned };
}
