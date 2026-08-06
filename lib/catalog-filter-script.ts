import { registry } from "@/lib/registry";
import { NEW_WINDOW_DAYS } from "@/lib/registry/freshness";

/** Stamped on <html> before first paint; globals.css keys the pre-hydration
 *  filter off it, and Sidebar removes it once React owns the list for real. */
export const CATALOG_FILTER_ATTR = "data-catalog-filter";

/**
 * Distinct `addedAt` values across the registry. Static data — no clock — so it
 * serializes into the prerendered HTML safely. The script narrows it to the ones
 * still inside the New window using the *browser's* clock, which is the whole
 * reason freshness can't be baked (see NewBadge).
 *
 * Distinct dates rather than a slug→date map: ~20 short strings instead of one
 * entry per component, and it's the only shape the generated selector needs.
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
 * Width only needed a CSS var. This filter changes *which rows exist*, and no
 * script running in <body> head position can touch a sidebar the parser hasn't
 * reached yet — so it stamps an attribute and globals.css hides the non-matching
 * rows and their now-empty category headings.
 *
 * "new" is the one filter CSS can't express statically (it's a date comparison),
 * so the script computes the fresh dates against the live clock and injects the
 * two rules for it. Everything else is static CSS.
 */
export function catalogFilterScript(): string {
	const dates = JSON.stringify(distinctAddedDates());
	const windowMs = NEW_WINDOW_DAYS * 86_400_000;

	return `try{
var s=JSON.parse(localStorage.getItem('sg-ui'));
var f=s&&s.state&&s.state.catalogFilter;
if(f&&f!=='all'){
document.documentElement.setAttribute('${CATALOG_FILTER_ATTR}',f);
if(f==='new'){
var n=Date.now(),fresh=${dates}.filter(function(d){return n-Date.parse(d)<${windowMs}});
if(fresh.length){
var sel=':is('+fresh.map(function(d){return '[data-added="'+d+'"]'}).join(',')+')';
var st=document.createElement('style');
st.textContent='html[${CATALOG_FILTER_ATTR}="new"] [data-entry]:not('+sel+'){display:none}'+
'html[${CATALOG_FILTER_ATTR}="new"] [data-group]:not(:has('+sel+')){display:none}';
document.head.appendChild(st);
}
}
}
}catch(e){}`.replace(/\n/g, "");
}
