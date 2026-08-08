import { registry } from "@/lib/registry";
import { NEW_WINDOW_DAYS } from "@/lib/registry/freshness";

/** Stamped on <html> before first paint; globals.css keys the pre-hydration
 *  filter off it, and Sidebar removes it once React owns the list for real. */
export const CATALOG_FILTER_ATTR = "data-catalog-filter";

/** Stamped when at least one entry is inside the New window. Reveals the New tab
 *  (rendered hidden by default) so it doesn't pop in after hydration. */
export const CATALOG_HAS_NEW_ATTR = "data-catalog-has-new";

/**
 * Distinct `addedAt` values across the registry. Static data — no clock — so it
 * serializes into the prerendered HTML safely. The script narrows it to the ones
 * still inside the New window using the *browser's* clock, which is the whole
 * reason freshness can't be baked (see NewBadge).
 *
 * Distinct dates rather than a slug→date map: ~20 short strings instead of one
 * per component, and it's the only shape the generated selector needs.
 */
function distinctAddedDates(): string[] {
	const dates = new Set<string>();
	for (const entry of registry) if (entry.addedAt) dates.add(entry.addedAt);
	return [...dates].sort();
}

/**
 * Pre-paint restore for the sidebar catalog filter, mirroring the sidebar-width
 * script in app/layout.tsx: read the same zustand-persist key, stamp the DOM
 * before first paint, let CSS do the rest.
 *
 * Width only needed a CSS var. This filter changes *which rows exist*, and a
 * script at the top of <body> can't touch a sidebar the parser hasn't reached
 * yet — so it stamps an attribute and injects the row-hiding rules.
 *
 * "new" is the only filter left (the free/pro tiers are gone — everything is
 * free), and it's exactly the one CSS can't express statically: a date
 * comparison against the live clock. The script resolves the fresh dates and
 * injects the two rules itself.
 */
export function catalogFilterScript(): string {
	const dates = JSON.stringify(distinctAddedDates());
	const windowMs = NEW_WINDOW_DAYS * 86_400_000;

	return `try{
var d=document.documentElement,n=Date.now();
var fresh=${dates}.filter(function(x){return n-Date.parse(x)<${windowMs}});
var sel=fresh.length?':is('+fresh.map(function(x){return '[data-added="'+x+'"]'}).join(',')+')':'';
if(fresh.length)d.setAttribute('${CATALOG_HAS_NEW_ATTR}','');
var s=JSON.parse(localStorage.getItem('sg-ui'));
var f=s&&s.state&&s.state.catalogFilter;
if(f==='new'&&fresh.length){
d.setAttribute('${CATALOG_FILTER_ATTR}',f);
var st=document.createElement('style');
st.textContent='html[${CATALOG_FILTER_ATTR}="new"] [data-entry]:not('+sel+'){display:none}'+
'html[${CATALOG_FILTER_ATTR}="new"] [data-group]:not(:has('+sel+')){display:none}';
document.head.appendChild(st);
}
}catch(e){}`.replace(/\n/g, "");
}
